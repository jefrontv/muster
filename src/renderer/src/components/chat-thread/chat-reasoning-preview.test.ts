import { describe, expect, it } from 'vitest'
import { reasoningPreview } from './chat-reasoning-preview'

describe('reasoningPreview', () => {
  it('shows the first line once settled, without markdown marks', () => {
    expect(reasoningPreview('\n**Plan** the change\nmore\n\nNext idea', false)).toBe(
      'Plan the change'
    )
  })

  it('waits for a line to finish before previewing it while streaming', () => {
    expect(reasoningPreview('Reading the header', true)).toBe('')
    expect(reasoningPreview('Reading the header\nIt uses', true)).toBe('Reading the header')
  })

  it('moves to the newest paragraph once its first line is complete', () => {
    const text = 'Reading the header\nIt uses flex.\n\nChecking the footer'
    expect(reasoningPreview(text, true)).toBe('Reading the header')
    expect(reasoningPreview(`${text}\nIt is sticky.`, true)).toBe('Checking the footer')
  })
})
