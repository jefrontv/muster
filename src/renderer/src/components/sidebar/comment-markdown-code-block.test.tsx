// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CommentMarkdown from './CommentMarkdown'

const FENCE = '```ts\nconst a = 1\n```'

describe('CommentMarkdown code block actions', () => {
  const writeClipboardText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined)

  beforeEach(() => {
    writeClipboardText.mockClear()
    window.api = { ui: { writeClipboardText } } as never
  })

  afterEach(() => {
    cleanup()
    Reflect.deleteProperty(window, 'api')
    vi.useRealTimers()
  })

  it('renders no header by default (shared surfaces unchanged)', () => {
    const { container, queryByRole } = render(
      <CommentMarkdown variant="document" content={FENCE} />
    )

    expect(queryByRole('toolbar')).toBeNull()
    const pre = container.querySelector('pre')
    expect(pre).not.toBeNull()
    // The bare pre keeps its own chrome when no header wraps it.
    expect(pre?.className).toContain('rounded-md')
  })

  it('renders the header with language label and actions when opted in', () => {
    const { getByRole, getByText } = render(
      <CommentMarkdown variant="document" content={FENCE} codeBlockActions />
    )

    expect(getByRole('toolbar')).toBeTruthy()
    expect(getByText('ts')).toBeTruthy()
    expect(getByRole('button', { name: 'Wrap lines' })).toBeTruthy()
    expect(getByRole('button', { name: 'Copy code' })).toBeTruthy()
  })

  it('toggles pre wrapping', () => {
    const { container, getByRole } = render(
      <CommentMarkdown variant="document" content={FENCE} codeBlockActions />
    )

    const pre = container.querySelector('pre')
    expect(pre?.className).not.toContain('whitespace-pre-wrap')

    const toggle = getByRole('button', { name: 'Wrap lines' })
    fireEvent.click(toggle)
    expect(container.querySelector('pre')?.className).toContain('whitespace-pre-wrap')
    expect(toggle.getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(getByRole('button', { name: 'Disable line wrap' }))
    expect(container.querySelector('pre')?.className).not.toContain('whitespace-pre-wrap')
  })

  it('copies the fence text and swaps to a check for 1.2s', async () => {
    vi.useFakeTimers()
    const { getByRole, queryByRole } = render(
      <CommentMarkdown variant="document" content={FENCE} codeBlockActions />
    )

    // act: the copied state lands after the awaited clipboard write resolves.
    await act(async () => {
      fireEvent.click(getByRole('button', { name: 'Copy code' }))
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(writeClipboardText).toHaveBeenCalledWith('const a = 1\n')
    expect(getByRole('button', { name: 'Copied' })).toBeTruthy()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_200)
    })
    expect(queryByRole('button', { name: 'Copied' })).toBeNull()
    expect(getByRole('button', { name: 'Copy code' })).toBeTruthy()
  })
})
