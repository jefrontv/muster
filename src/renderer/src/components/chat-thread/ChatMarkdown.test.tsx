// @vitest-environment happy-dom

import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChatMarkdown } from './ChatMarkdown'

vi.mock('@/components/native-chat/NativeChatHighlightedCode', () => ({
  useCodeThemeClass: () => ''
}))

const TEXT = [
  'See [the docs](https://example.com) and `npm test`.',
  '',
  '```TypeScript',
  'const a = 1',
  '```',
  '',
  '| Name | Size |',
  '| ---- | ---- |',
  '| a    | 1    |'
].join('\n')

describe('ChatMarkdown', () => {
  afterEach(cleanup)

  it('renders chat-only links, inline code, code blocks and tables', () => {
    const { container } = render(<ChatMarkdown text={TEXT} streaming={false} />)
    expect(container.querySelector('a')?.className).toContain('text-chat-accent')
    expect(container.querySelector('p > code')?.className).toContain('bg-chat-inline-code')
    const pre = container.querySelector('pre')!
    expect(pre.className).toContain('whitespace-pre-wrap')
    expect(pre.parentElement?.className).toContain('bg-chat-code')
    expect(container.textContent).toContain('typescript')
    expect(container.querySelector('th')?.className).toContain('border-chat-line-3')
  })

  it('keeps code banner actions visible and toggles wrapping', () => {
    const { container, getByRole } = render(<ChatMarkdown text={TEXT} streaming={false} />)
    const wrap = getByRole('button', { name: 'Disable line wrap' })
    fireEvent.click(wrap)
    expect(container.querySelector('pre')?.classList.contains('whitespace-pre')).toBe(true)
    expect(getByRole('button', { name: 'Copy code' })).toBeTruthy()
  })

  it('renders reasoning at the compact tier without a pinned code banner', () => {
    const { container } = render(<ChatMarkdown text={TEXT} streaming={false} density="compact" />)
    expect((container.firstChild as HTMLElement).className).toContain('text-chat-ink-tertiary')
    expect(container.querySelector('.sticky')).toBeNull()
  })
})
