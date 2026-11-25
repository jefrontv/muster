import { describe, expect, it, vi } from 'vitest'
import type { Modifier } from '@dnd-kit/core'
import { lockTabDragToSourceStrip } from './tab-drag-overlay-motion'

vi.mock('../../store', () => ({ useAppStore: { getState: () => ({ groupsByWorktree: {} }) } }))

type ModifierArgs = Parameters<Modifier>[0]
const tab = (groupId: string) => ({ data: { current: { kind: 'tab', groupId } } })
const pane = { data: { current: { kind: 'pane-body', groupId: 'g1' } } }
const run = (over: unknown, y: number) =>
  lockTabDragToSourceStrip({
    active: tab('g1'),
    over,
    activeNodeRect: { height: 24 },
    transform: { x: 40, y, scaleX: 1, scaleY: 1 }
  } as unknown as ModifierArgs)

describe('lockTabDragToSourceStrip', () => {
  it('keeps the overlay on the strip row while it is over its own strip', () => {
    expect(run(tab('g1'), 14)).toMatchObject({ x: 40, y: 0 })
  })

  it('lets the overlay follow the pointer once it leaves the strip', () => {
    expect(run(tab('g2'), 14).y).toBe(14)
    expect(run(pane, 14).y).toBe(14)
    expect(run(null, 14).y).toBe(14)
    expect(run(tab('g1'), 60).y).toBe(60)
  })
})
