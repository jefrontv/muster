// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChatToolItem } from './chat-tool-input'
import { ChatDiffBody } from './ChatDiffBody'
import { DIFF_COPIED_MS } from './ChatDiffBanner'

const content = Array.from({ length: 20 }, (_, index) => `line${index}`).join('\n')

const write: ChatToolItem = {
  kind: 'tool',
  id: 'toolu_1',
  name: 'Write',
  input: { file_path: '/repo/src/app.ts', content },
  status: 'running'
}

describe('ChatDiffBody', () => {
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('shows the first and last 8 lines with a fold that opens and closes again', () => {
    const view = render(<ChatDiffBody item={write} />)
    expect(view.getByText('line7')).toBeTruthy()
    expect(view.queryByText('line8')).toBeNull()
    expect(view.queryByText('line11')).toBeNull()
    expect(view.getByText('line12')).toBeTruthy()

    const fold = view.getByRole('button', { name: 'Show 4 more lines' })
    expect(fold.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(fold)
    expect(view.getByText('line8')).toBeTruthy()
    expect(fold.getAttribute('aria-expanded')).toBe('true')

    fireEvent.click(view.getByRole('button', { name: 'Show fewer lines' }))
    expect(view.queryByText('line8')).toBeNull()
  })

  it('names the file and language, and toggles wrapping off by default', () => {
    const view = render(<ChatDiffBody item={write} />)
    expect(view.getByText('app.ts')).toBeTruthy()
    expect(view.getByText('typescript')).toBeTruthy()
    const wrap = view.getByRole('button', { name: 'Wrap lines' })
    expect(wrap.getAttribute('aria-pressed')).toBe('false')
    expect(view.getByText('line0').parentElement!.className).toContain('whitespace-pre')
    fireEvent.click(wrap)
    expect(wrap.getAttribute('aria-pressed')).toBe('true')
    expect(view.getByText('line0').parentElement!.className).toContain('whitespace-pre-wrap')
  })

  it('marks added lines with the diff colour, marker and tint', () => {
    const view = render(<ChatDiffBody item={write} />)
    const row = view.getByText('line0').closest('[data-diff-line]')!
    expect(row.getAttribute('data-diff-line')).toBe('add')
    expect(row.className).toContain('text-chat-diff-added')
    expect(row.className).toContain('bg-chat-diff-added-tint')
    expect(row.className).toContain('shadow-[inset_3px_0_0_var(--chat-diff-added)]')
  })

  it('copies the whole diff and shows a check for a second', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    const view = render(<ChatDiffBody item={write} />)
    await act(async () => {
      fireEvent.click(view.getByRole('button', { name: 'Copy diff' }))
    })
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('+ line19'))
    expect(view.getByRole('button', { name: 'Copied' })).toBeTruthy()
    act(() => {
      vi.advanceTimersByTime(DIFF_COPIED_MS)
    })
    expect(view.getByRole('button', { name: 'Copy diff' })).toBeTruthy()
  })
})
