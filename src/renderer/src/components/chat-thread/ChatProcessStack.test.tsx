// @vitest-environment happy-dom

import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CHAT_STACK_VISIBLE_ROWS } from './chat-turn-layout'
import { ChatProcessStack } from './ChatProcessStack'

const rows = Array.from({ length: 9 }, (_, i) => `row-${i}`)

function renderStack() {
  return render(
    <ChatProcessStack
      runs={rows}
      runKey={(row) => row}
      renderRun={(row) => <button type="button">{row}</button>}
    />
  )
}

describe('ChatProcessStack', () => {
  afterEach(cleanup)

  it('shows the last rows, folds one into a sliver and hides the rest until expanded', () => {
    const view = renderStack()
    const hidden = rows.length - CHAT_STACK_VISIBLE_ROWS
    const wrapper = (row: string): HTMLElement => view.getByText(row).parentElement!
    const toggle = view.getByRole('button', { name: `${hidden} earlier steps` })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(wrapper('row-0').className).toContain('hidden')
    expect(wrapper(`row-${hidden - 1}`).hasAttribute('inert')).toBe(true)
    expect(wrapper(`row-${hidden}`).className).not.toContain('hidden')

    const before = view.getByText('row-8')
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(wrapper('row-0').className).not.toContain('hidden')
    expect(wrapper(`row-${hidden - 1}`).hasAttribute('inert')).toBe(false)
    // Same element: expanding never remounts a row.
    expect(view.getByText('row-8')).toBe(before)
  })
})
