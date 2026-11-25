let activeTabStripPointerGestureCount = 0
let lastPointerActivationAt = 0

const POINTER_ACTIVATION_WINDOW_MS = 400

export function beginTabStripPointerGesture(): () => void {
  activeTabStripPointerGestureCount += 1
  let released = false

  return () => {
    if (released) {
      return
    }
    released = true
    activeTabStripPointerGestureCount = Math.max(0, activeTabStripPointerGestureCount - 1)
  }
}

export function isTabStripPointerGestureActive(): boolean {
  return activeTabStripPointerGestureCount > 0
}

export function markTabStripPointerActivation(now = performance.now()): void {
  lastPointerActivationAt = now
}

/** True once for an activation that came from a click on a tab, so scroll policy can stay put. */
export function takeTabStripPointerActivation(now = performance.now()): boolean {
  const recent = now - lastPointerActivationAt <= POINTER_ACTIVATION_WINDOW_MS
  lastPointerActivationAt = 0
  return recent
}
