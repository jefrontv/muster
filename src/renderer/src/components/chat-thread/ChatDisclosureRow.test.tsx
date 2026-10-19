// @vitest-environment happy-dom

import { useState } from 'react'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ChatDisclosureRow } from './ChatDisclosureRow'

function Row({ initiallyOpen = false }: { initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen)
  return (
    <ChatDisclosureRow
      icon={<svg data-testid="icon" />}
      label="Ran"
      open={open}
      onOpenChange={setOpen}
    >
      <div>body</div>
    </ChatDisclosureRow>
  )
}

describe('ChatDisclosureRow', () => {
  afterEach(cleanup)

  it('shows the icon closed, with a down chevron that only appears on hover or focus', () => {
    const view = render(<Row />)
    const button = view.getByRole('button')
    expect(view.getByTestId('icon')).toBeTruthy()
    const down = button.querySelector('[data-chevron="down"]')!
    expect(down.getAttribute('class')).toContain('opacity-0')
    expect(down.getAttribute('class')).toContain('group-hover/row:opacity-100')
    expect(down.getAttribute('class')).toContain('group-focus-visible/row:opacity-100')
    expect(button.querySelector('[data-chevron="up"]')).toBeNull()
  })

  it('swaps the icon for an always-visible up chevron when open, without changing colour', () => {
    const view = render(<Row />)
    const button = view.getByRole('button')
    const closedClass = button.className
    fireEvent.click(button)
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(view.queryByTestId('icon')).toBeNull()
    const up = button.querySelector('[data-chevron="up"]')!
    expect(up.getAttribute('class')).not.toContain('opacity-0')
    expect(button.querySelector('[data-chevron="down"]')).toBeNull()
    expect(button.className).toBe(closedClass)
    expect(view.getByText('body')).toBeTruthy()
  })
})
