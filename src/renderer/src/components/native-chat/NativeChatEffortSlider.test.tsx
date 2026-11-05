// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DropdownMenu, DropdownMenuContent } from '@/components/ui/dropdown-menu'
import { NativeChatEffortSlider } from './NativeChatEffortSlider'

const choices = ['low', 'medium', 'high', 'xhigh', 'max'].map((value) => ({ value, label: value }))

function renderSlider(value: string | null, onChange = vi.fn()): typeof onChange {
  render(
    <DropdownMenu open>
      <DropdownMenuContent>
        <NativeChatEffortSlider
          choices={choices}
          value={value}
          disabled={false}
          onChange={onChange}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
  return onChange
}

afterEach(() => cleanup())

describe('NativeChatEffortSlider', () => {
  it('names the current level and steps with the arrow keys', () => {
    const onChange = renderSlider('medium')
    const slider = screen.getByRole('slider', { name: 'Effort' })
    expect(slider.getAttribute('aria-valuetext')).toBe('Medium')
    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    expect(onChange).toHaveBeenLastCalledWith('high')
    fireEvent.keyDown(slider, { key: 'Home' })
    expect(onChange).toHaveBeenLastCalledWith('low')
  })

  it('stays put at the ends and shows Default with no known level', () => {
    const onChange = renderSlider('max')
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'End' })
    expect(onChange).not.toHaveBeenCalled()
    cleanup()
    renderSlider(null)
    expect(screen.getByRole('slider').getAttribute('aria-valuetext')).toBe('Default')
  })
})
