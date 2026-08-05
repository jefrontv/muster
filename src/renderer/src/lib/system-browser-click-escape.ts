// Why: app-chrome link clicks reach the renderer through main's will-navigate /
// window-open interception, which carries no modifier state. Snapshot the last
// pointer-down modifiers so ⇧⌘/Shift+Ctrl-click can still force the system browser.

const ESCAPE_CLICK_MAX_AGE_MS = 2_000

let lastEscapeClickAt: number | null = null

export function installSystemBrowserClickEscapeTracking(): () => void {
  const onPointerDown = (event: PointerEvent | MouseEvent): void => {
    lastEscapeClickAt = event.shiftKey && (event.metaKey || event.ctrlKey) ? Date.now() : null
  }
  // Capture phase: app handlers may stop propagation before this would otherwise run.
  window.addEventListener('pointerdown', onPointerDown, true)
  return () => window.removeEventListener('pointerdown', onPointerDown, true)
}

export function consumeSystemBrowserClickEscape(): boolean {
  if (lastEscapeClickAt === null) {
    return false
  }
  const fresh = Date.now() - lastEscapeClickAt <= ESCAPE_CLICK_MAX_AGE_MS
  lastEscapeClickAt = null
  return fresh
}
