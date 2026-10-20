// @vitest-environment happy-dom

import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ChatToolItem } from './chat-tool-input'
import { CHAT_STACK_VISIBLE_ROWS } from './chat-turn-layout'
import { ChatToolGroupRow } from './ChatToolGroupRow'

const reads: ChatToolItem[] = Array.from({ length: 8 }, (_, i) => ({
  kind: 'tool',
  id: `read-${i}`,
  name: 'Read',
  input: { file_path: `/repo/file-${i}.ts` },
  status: 'done'
}))

describe('ChatToolGroupRow', () => {
  afterEach(cleanup)

  it('rolls the last calls into view while closed and lists them all when opened', () => {
    const view = render(<ChatToolGroupRow items={reads} />)
    const wrapper = (i: number): HTMLElement =>
      view.getByText(new RegExp(`file-${i}\\.ts`)).closest('[data-chat-group-row]') as HTMLElement
    const hidden = reads.length - CHAT_STACK_VISIBLE_ROWS
    const header = view.getByRole('button', { name: /Read files/ })
    expect(header.getAttribute('aria-expanded')).toBe('false')
    expect(header.textContent).toContain('8 calls')
    expect(wrapper(0).className).toContain('hidden')
    expect(wrapper(hidden - 1).hasAttribute('inert')).toBe(true)
    expect(wrapper(reads.length - 1).className).not.toContain('hidden')

    const newest = view.getByText(/file-7\.ts/)
    fireEvent.click(header)
    expect(header.getAttribute('aria-expanded')).toBe('true')
    expect(wrapper(0).className).not.toContain('hidden')
    expect(view.getByText(/file-7\.ts/)).toBe(newest)
  })
})
