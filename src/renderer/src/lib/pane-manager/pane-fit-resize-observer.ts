import type { ManagedPane, ManagedPaneInternal } from './pane-manager-types'
import { cancelPendingSafeFitContinuations, safeFitAndThen } from './pane-tree-ops'

type ProposedDimensions = {
  cols: number
  rows: number
}

type StableFitPane = ManagedPane &
  Partial<Pick<ManagedPaneInternal, 'xtermContainer' | 'pendingObservedFitRafId'>>

const MAX_STABILITY_FRAMES = 8
const pendingStableFitRafIds = new WeakMap<StableFitPane, number>()
const stableFitCallbacks = new WeakMap<StableFitPane, Set<() => void>>()

function getPendingObservedFitRafId(pane: StableFitPane): number | null {
  return pane.pendingObservedFitRafId ?? pendingStableFitRafIds.get(pane) ?? null
}

function setPendingObservedFitRafId(pane: StableFitPane, id: number | null): void {
  if ('pendingObservedFitRafId' in pane) {
    pane.pendingObservedFitRafId = id
    return
  }
  if (id === null) {
    pendingStableFitRafIds.delete(pane)
  } else {
    pendingStableFitRafIds.set(pane, id)
  }
}

function getFitElement(pane: StableFitPane): HTMLElement {
  return pane.xtermContainer ?? pane.container
}

function getProposedDimensions(pane: StableFitPane): ProposedDimensions | null {
  try {
    return pane.fitAddon.proposeDimensions() ?? null
  } catch {
    return null
  }
}

function dimensionsEqual(a: ProposedDimensions | null, b: ProposedDimensions | null): boolean {
  return a?.cols === b?.cols && a?.rows === b?.rows
}

function terminalDimensionsEqual(pane: StableFitPane, dims: ProposedDimensions): boolean {
  return pane.terminal.cols === dims.cols && pane.terminal.rows === dims.rows
}

function hasVisibleFitGeometry(pane: StableFitPane): boolean {
  const rect = getFitElement(pane).getBoundingClientRect?.()
  return !rect || (rect.width > 0 && rect.height > 0)
}

function addStableFitCallback(pane: StableFitPane, callback: (() => void) | undefined): void {
  if (!callback) {
    return
  }
  const callbacks = stableFitCallbacks.get(pane) ?? new Set()
  callbacks.add(callback)
  stableFitCallbacks.set(pane, callbacks)
}

function flushStableFitCallbacks(pane: StableFitPane): void {
  const callbacks = stableFitCallbacks.get(pane)
  if (!callbacks) {
    return
  }
  stableFitCallbacks.delete(pane)
  for (const callback of callbacks) {
    callback()
  }
}

function finishStableFit(pane: StableFitPane): void {
  setPendingObservedFitRafId(pane, null)
  // Why: an equal grid still proves a restored pane is measurable, so it must
  // release reattach continuations that were parked while the tab was hidden.
  safeFitAndThen(pane, 'stable-pane-fit', () => flushStableFitCallbacks(pane))
}

export function requestStablePaneFit(pane: StableFitPane, onSettled?: () => void): void {
  addStableFitCallback(pane, onSettled)
  if (getPendingObservedFitRafId(pane) !== null) {
    return
  }
  if (!hasVisibleFitGeometry(pane)) {
    stableFitCallbacks.delete(pane)
    return
  }
  // Why: keep xterm fit work off the divider pointermove hot path and let
  // the browser coalesce drag-driven size changes the same way Superset does.
  //
  // Windows can report a short-lived one-column anchor/scrollbar wobble when
  // the right sidebar is open. Requiring a stable proposed grid before fitting
  // prevents Codex from receiving a rapid SIGWINCH loop and visibly vibrating.
  let previous = getProposedDimensions(pane)
  let frameCount = 0
  const waitForStableGrid = (): void => {
    setPendingObservedFitRafId(
      pane,
      requestAnimationFrame(() => {
        if (!hasVisibleFitGeometry(pane)) {
          setPendingObservedFitRafId(pane, null)
          stableFitCallbacks.delete(pane)
          return
        }
        const next = getProposedDimensions(pane)
        frameCount += 1

        if (!next) {
          finishStableFit(pane)
          return
        }

        if (terminalDimensionsEqual(pane, next)) {
          finishStableFit(pane)
          return
        }

        if (dimensionsEqual(previous, next)) {
          finishStableFit(pane)
          return
        }

        previous = next
        if (frameCount >= MAX_STABILITY_FRAMES) {
          finishStableFit(pane)
          return
        }

        waitForStableGrid()
      })
    )
  }
  waitForStableGrid()
}

/**
 * Coalescing fit for every pane, for triggers that arrive in BURSTS.
 *
 * A window show, a focus change and a continuous resize each wake several independent fit paths
 * (the container ResizeObserver's debounce, the focus rAF, the per-pane observer, visibility
 * resume). When those called `safeFit` directly they each fitted immediately, so a single gesture
 * reflowed xterm two or three times against different transient geometries — the terminal visibly
 * re-laid-out for about a second. Routing them here makes them join ONE per-pane stability loop:
 * the grid is measured across frames and the reflow happens once, when the size has stopped moving.
 *
 * Discrete, known-final layout changes (the sidebar toggle's pre-paint sync fit) deliberately keep
 * fitting synchronously: they have no burst to coalesce and a deferred fit would flash instead.
 */
export function requestFitAllPanesSettled(panes: Map<number, ManagedPaneInternal>): void {
  for (const pane of panes.values()) {
    requestStablePaneFit(pane)
  }
}

export function attachPaneFitResizeObserver(pane: ManagedPaneInternal): void {
  detachPaneFitResizeObserver(pane)

  if (typeof ResizeObserver === 'undefined') {
    return
  }

  const observer = new ResizeObserver(() => {
    requestStablePaneFit(pane)
  })

  observer.observe(pane.xtermContainer)
  pane.fitResizeObserver = observer
}

export function detachPaneFitResizeObserver(pane: ManagedPaneInternal): void {
  pane.fitResizeObserver?.disconnect()
  pane.fitResizeObserver = null

  const pendingObservedFitRafId = getPendingObservedFitRafId(pane)
  if (pendingObservedFitRafId !== null) {
    cancelAnimationFrame(pendingObservedFitRafId)
    setPendingObservedFitRafId(pane, null)
  }
  stableFitCallbacks.delete(pane)
  cancelPendingSafeFitContinuations(pane)
}
