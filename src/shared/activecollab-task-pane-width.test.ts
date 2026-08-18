import { describe, expect, it } from 'vitest'
import {
  ACTIVECOLLAB_TASK_PANE_DEFAULT_WIDTH,
  ACTIVECOLLAB_TASK_PANE_MAX_WIDTH,
  ACTIVECOLLAB_TASK_PANE_MIN_WIDTH,
  clampActiveCollabTaskPaneWidth,
  computeMaxActiveCollabTaskPaneWidth
} from './activecollab-task-pane-width'

describe('computeMaxActiveCollabTaskPaneWidth', () => {
  it('leaves the task list its minimum room on a narrow page', () => {
    // 900 − 360 list minimum.
    expect(computeMaxActiveCollabTaskPaneWidth(900)).toBe(540)
  })

  it('never exceeds the absolute maximum on a wide page', () => {
    expect(computeMaxActiveCollabTaskPaneWidth(4000)).toBe(ACTIVECOLLAB_TASK_PANE_MAX_WIDTH)
  })

  it('falls back to the maximum when the container is unmeasured', () => {
    expect(computeMaxActiveCollabTaskPaneWidth(0)).toBe(ACTIVECOLLAB_TASK_PANE_MAX_WIDTH)
    expect(computeMaxActiveCollabTaskPaneWidth(Number.NaN)).toBe(ACTIVECOLLAB_TASK_PANE_MAX_WIDTH)
  })

  it('keeps the pane usable even when the page cannot fit both', () => {
    expect(computeMaxActiveCollabTaskPaneWidth(400)).toBe(ACTIVECOLLAB_TASK_PANE_MIN_WIDTH)
  })
})

describe('clampActiveCollabTaskPaneWidth', () => {
  it('defaults when no width was ever stored', () => {
    expect(clampActiveCollabTaskPaneWidth(undefined)).toBe(ACTIVECOLLAB_TASK_PANE_DEFAULT_WIDTH)
    expect(clampActiveCollabTaskPaneWidth('520')).toBe(ACTIVECOLLAB_TASK_PANE_DEFAULT_WIDTH)
  })

  it('uses the caller fallback for an unusable stored value', () => {
    expect(clampActiveCollabTaskPaneWidth(Number.NaN, undefined, 480)).toBe(480)
  })

  it('holds a stored width inside the bounds', () => {
    expect(clampActiveCollabTaskPaneWidth(100)).toBe(ACTIVECOLLAB_TASK_PANE_MIN_WIDTH)
    expect(clampActiveCollabTaskPaneWidth(5000)).toBe(ACTIVECOLLAB_TASK_PANE_MAX_WIDTH)
    expect(clampActiveCollabTaskPaneWidth(600)).toBe(600)
  })

  it('shrinks a stored width that no longer fits the page', () => {
    expect(clampActiveCollabTaskPaneWidth(880, 900)).toBe(540)
  })
})
