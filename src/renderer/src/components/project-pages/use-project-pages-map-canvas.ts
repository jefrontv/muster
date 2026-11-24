// Runs the map canvas: layout ticks, painting, pan and zoom, dragging nodes, hover and picks.
import type React from 'react'
import { useEffect, useRef } from 'react'
import type { PagesGraph, PagesGraphNode } from '../../../../shared/project-pages-graph-types'
import {
  drawMap,
  fitView,
  readMapPalette,
  type MapPalette,
  type MapView
} from './project-pages-map-draw'
import {
  createMapSim,
  neighboursOf,
  nodeAt,
  tickMapSim,
  type MapSim,
  type SimNode
} from './project-pages-map-model'

type Drag = { node: SimNode | null; lastX: number; lastY: number; moved: number }

export function useProjectPagesMapCanvas({
  graph,
  current,
  match,
  onPick
}: {
  graph: PagesGraph
  current: string | null
  match: Set<string> | null
  onPick: (node: PagesGraphNode) => void
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const sim = useRef<MapSim | null>(null)
  const view = useRef<MapView>({ x: 0, y: 0, k: 1 })
  const size = useRef({ width: 0, height: 0 })
  const palette = useRef<MapPalette | null>(null)
  const lit = useRef<Set<string> | null>(null)
  const hovered = useRef<string | null>(null)
  const drag = useRef<Drag | null>(null)
  // Re-fit once the first layout settles, unless the user has panned or zoomed.
  const autoFit = useRef(true)
  const frame = useRef<number | null>(null)
  const props = useRef({ graph, current, match, onPick })
  props.current = { graph, current, match, onPick }

  function paint(): void {
    frame.current = null
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    const layout = sim.current
    if (!canvas || !ctx || !layout) {
      return
    }
    tickMapSim(layout, 2)
    palette.current ??= readMapPalette(canvas)
    const dpr = window.devicePixelRatio || 1
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    drawMap(ctx, {
      sim: layout,
      view: view.current,
      ...size.current,
      palette: palette.current,
      lit: lit.current,
      match: props.current.match,
      current: props.current.current
    })
    if (layout.alpha > 0.004 || drag.current?.node) {
      kick()
    } else if (autoFit.current) {
      autoFit.current = false
      fit()
    }
  }

  function kick(): void {
    frame.current ??= requestAnimationFrame(paint)
  }

  function fit(): void {
    if (sim.current) {
      view.current = fitView(sim.current, size.current.width, size.current.height)
      kick()
    }
  }

  useEffect(() => {
    const before = sim.current
    const previous = before
      ? new Map(before.nodes.map((n) => [n.node.id, { x: n.x, y: n.y }]))
      : undefined
    sim.current = createMapSim(graph, previous)
    if (!before) {
      tickMapSim(sim.current, 220)
      fit()
    }
    kick()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph])

  useEffect(() => kick(), [current, match])

  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) {
      return
    }
    let fitted = false
    const resize = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1
      size.current = { width: wrap.clientWidth, height: wrap.clientHeight }
      canvas.width = Math.round(wrap.clientWidth * dpr)
      canvas.height = Math.round(wrap.clientHeight * dpr)
      if (!fitted && wrap.clientWidth > 0) {
        fitted = true
        fit()
      }
      kick()
    })
    resize.observe(wrap)
    const theme = new MutationObserver(() => {
      palette.current = null
      kick()
    })
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    // Wheel needs a non-passive listener to stop the page from scrolling.
    const wheel = (event: WheelEvent): void => {
      event.preventDefault()
      const rect = canvas.getBoundingClientRect()
      const sx = event.clientX - rect.left
      const sy = event.clientY - rect.top
      const old = view.current
      const k = Math.min(4, Math.max(0.15, old.k * Math.exp(-event.deltaY * 0.0015)))
      view.current = { k, x: sx - ((sx - old.x) / old.k) * k, y: sy - ((sy - old.y) / old.k) * k }
      autoFit.current = false
      kick()
    }
    canvas.addEventListener('wheel', wheel, { passive: false })
    return () => {
      resize.disconnect()
      theme.disconnect()
      canvas.removeEventListener('wheel', wheel)
      if (frame.current !== null) {
        cancelAnimationFrame(frame.current)
        frame.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function hit(event: React.PointerEvent): SimNode | null {
    const rect = event.currentTarget.getBoundingClientRect()
    const { x, y, k } = view.current
    const layout = sim.current
    return layout
      ? nodeAt(
          layout,
          (event.clientX - rect.left - x) / k,
          (event.clientY - rect.top - y) / k,
          4 / k
        )
      : null
  }

  const handlers = {
    onPointerDown: (event: React.PointerEvent<HTMLCanvasElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId)
      const node = hit(event)
      if (node) {
        node.pinned = true
      }
      drag.current = { node, lastX: event.clientX, lastY: event.clientY, moved: 0 }
    },
    onPointerMove: (event: React.PointerEvent<HTMLCanvasElement>) => {
      const active = drag.current
      if (active) {
        const dx = event.clientX - active.lastX
        const dy = event.clientY - active.lastY
        active.lastX = event.clientX
        active.lastY = event.clientY
        active.moved += Math.abs(dx) + Math.abs(dy)
        if (active.node && sim.current) {
          active.node.x += dx / view.current.k
          active.node.y += dy / view.current.k
          sim.current.alpha = Math.max(sim.current.alpha, 0.2)
        } else {
          view.current = { ...view.current, x: view.current.x + dx, y: view.current.y + dy }
          autoFit.current = false
        }
        kick()
        return
      }
      const node = hit(event)
      event.currentTarget.style.cursor = node ? 'pointer' : 'grab'
      const id = node?.node.id ?? null
      if (id !== hovered.current) {
        hovered.current = id
        lit.current = id ? neighboursOf(props.current.graph, id) : null
        kick()
      }
    },
    onPointerUp: () => {
      const active = drag.current
      drag.current = null
      if (active?.node) {
        active.node.pinned = false
        if (active.moved < 4) {
          props.current.onPick(active.node.node)
        }
      }
    },
    onPointerLeave: () => {
      if (!drag.current && hovered.current) {
        hovered.current = null
        lit.current = null
        kick()
      }
    }
  }

  return { wrapRef, canvasRef, handlers, fit }
}
