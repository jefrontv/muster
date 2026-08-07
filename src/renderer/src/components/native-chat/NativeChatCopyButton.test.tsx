// @vitest-environment happy-dom

import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NativeChatCopyButton } from './NativeChatCopyButton'

class FakeClipboardItem {
  constructor(public readonly items: Record<string, Blob>) {}
}

describe('NativeChatCopyButton', () => {
  const writeClipboardText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined)
  const clipboardWrite = vi.fn<(items: unknown[]) => Promise<void>>().mockResolvedValue(undefined)

  beforeEach(() => {
    writeClipboardText.mockClear()
    clipboardWrite.mockClear()
    clipboardWrite.mockResolvedValue(undefined)
    window.api = { ui: { writeClipboardText } } as never
    vi.stubGlobal('ClipboardItem', FakeClipboardItem)
    Object.defineProperty(window.navigator, 'clipboard', {
      value: { write: clipboardWrite },
      configurable: true
    })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    Reflect.deleteProperty(window, 'api')
  })

  it('writes markdown + html flavors when getHtml is provided', async () => {
    const { getByRole } = render(
      <NativeChatCopyButton text="**bold**" getHtml={() => '<strong>bold</strong>'} />
    )

    fireEvent.click(getByRole('button'))

    await waitFor(() => expect(clipboardWrite).toHaveBeenCalledTimes(1))
    const item = clipboardWrite.mock.calls[0][0][0] as FakeClipboardItem
    expect(Object.keys(item.items)).toEqual(['text/plain', 'text/html'])
    expect(writeClipboardText).not.toHaveBeenCalled()
    // Success feedback swaps to the check state.
    await waitFor(() => expect(getByRole('button', { name: 'Copied' })).toBeTruthy())
  })

  it('falls back to plain text when the rich write rejects', async () => {
    clipboardWrite.mockRejectedValue(new Error('denied'))
    const { getByRole } = render(
      <NativeChatCopyButton text="**bold**" getHtml={() => '<strong>bold</strong>'} />
    )

    fireEvent.click(getByRole('button'))

    await waitFor(() => expect(writeClipboardText).toHaveBeenCalledWith('**bold**'))
    await waitFor(() => expect(getByRole('button', { name: 'Copied' })).toBeTruthy())
  })

  it('stays plain-text-only without getHtml', async () => {
    const { getByRole } = render(<NativeChatCopyButton text="plain" />)

    fireEvent.click(getByRole('button'))

    await waitFor(() => expect(writeClipboardText).toHaveBeenCalledWith('plain'))
    expect(clipboardWrite).not.toHaveBeenCalled()
  })
})
