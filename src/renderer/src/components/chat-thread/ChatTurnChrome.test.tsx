// @vitest-environment happy-dom

import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { FoldHeader, TurnOutcomeAnnouncement, turnOutcomeParts } from './ChatTurnChrome'

describe('turn outcome', () => {
  afterEach(cleanup)

  it('labels each outcome, flagging the digits', () => {
    expect(turnOutcomeParts({ status: 'done', durationMs: 72_000 })).toEqual([
      { text: 'Completed in ', numeric: false },
      { text: '1', numeric: true },
      { text: 'm ', numeric: false },
      { text: '12', numeric: true },
      { text: 's', numeric: false }
    ])
    expect(turnOutcomeParts({ status: 'done', durationMs: null })[0]!.text).toBe('Completed')
    expect(turnOutcomeParts({ status: 'interrupted', durationMs: 5_000 })[0]!.text).toBe('Stopped')
    expect(turnOutcomeParts({ status: 'error', durationMs: 5_000 })[0]!.text).toBe('Failed')
  })

  it('sets the duration digits in mono', () => {
    const { container } = render(
      <FoldHeader turn={{ status: 'done', durationMs: 12_000 }} open={false} onToggle={() => {}} />
    )
    expect(container.textContent).toBe('Completed in 12s')
    expect(container.querySelector('.font-mono')?.textContent).toBe('12')
  })

  it('announces only once the turn settles', () => {
    const { container, rerender } = render(
      <TurnOutcomeAnnouncement turn={{ status: 'running', durationMs: null }} />
    )
    const status = container.querySelector('[role="status"]')!
    expect(status.getAttribute('aria-live')).toBe('polite')
    expect(status.textContent).toBe('')
    rerender(<TurnOutcomeAnnouncement turn={{ status: 'done', durationMs: 3_000 }} />)
    expect(status.textContent).toBe('Completed in 3s')
  })
})
