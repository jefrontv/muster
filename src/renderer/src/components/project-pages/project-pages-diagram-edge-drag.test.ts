import type { EventSource, InternalMouseEvent } from '@maxgraph/core'
import { describe, expect, it, vi } from 'vitest'
import { holdEdgeHandlesUntilDrag } from './project-pages-diagram-edge-drag'

function pointer(x: number, y: number): InternalMouseEvent {
  return { getX: () => x, getY: () => y, consume: vi.fn() } as unknown as InternalMouseEvent
}

function edgeHandler() {
  const moves: number[][] = []
  const ups: { moved: boolean }[] = []
  const handler = {
    index: 1 as number | null,
    startX: 100,
    startY: 100,
    mouseMove(_sender: EventSource, me: InternalMouseEvent) {
      moves.push([me.getX(), me.getY()])
    },
    mouseUp(_sender: EventSource, me: InternalMouseEvent) {
      ups.push({ moved: me.getX() !== handler.startX || me.getY() !== handler.startY })
      handler.index = null
    }
  }
  holdEdgeHandlesUntilDrag(handler, () => 4)
  return { handler, moves, ups }
}

const sender = {} as EventSource

describe('holdEdgeHandlesUntilDrag', () => {
  it('treats a press that wobbles under the tolerance as a click', () => {
    const { handler, moves, ups } = edgeHandler()
    const wobble = pointer(102, 103)
    handler.mouseMove(sender, wobble)
    handler.mouseUp(sender, pointer(102, 103))
    expect(moves).toEqual([])
    expect(wobble.consume).toHaveBeenCalled()
    expect(ups).toEqual([{ moved: false }])
  })

  it('drags once the pointer passes the tolerance, even if it comes back', () => {
    const { handler, moves, ups } = edgeHandler()
    handler.mouseMove(sender, pointer(100, 110))
    handler.mouseMove(sender, pointer(101, 101))
    handler.mouseUp(sender, pointer(101, 101))
    expect(moves).toEqual([
      [100, 110],
      [101, 101]
    ])
    expect(ups).toEqual([{ moved: true }])
  })

  it('leaves moves alone when no handle is pressed', () => {
    const { handler, moves } = edgeHandler()
    handler.index = null
    handler.mouseMove(sender, pointer(101, 101))
    expect(moves).toEqual([[101, 101]])
  })
})
