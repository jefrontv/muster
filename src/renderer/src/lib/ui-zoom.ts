const isMac = navigator.userAgent.includes('Mac')

// Webviews keep their own zoom, so hosts listen for this to follow the UI scale.
export const UI_ZOOM_APPLIED_EVENT = 'muster:ui-zoom-applied'

export function currentUIZoomFactor(): number {
  return Math.pow(1.2, window.api.ui.getZoomLevel())
}

/**
 * Apply a UI zoom level change: sets webFrame zoom via the preload API,
 * updates the CSS variable used to compensate the traffic-light pad,
 * and repositions the native macOS traffic lights to stay aligned.
 */
export function applyUIZoom(level: number): void {
  const zoomFactor = Math.pow(1.2, level)
  window.api.ui.setZoomLevel(level)
  document.documentElement.style.setProperty('--ui-zoom-factor', String(zoomFactor))
  if (isMac) {
    window.api.ui.syncTrafficLights(zoomFactor)
  }
  window.dispatchEvent(new CustomEvent(UI_ZOOM_APPLIED_EVENT, { detail: { zoomFactor } }))
}

/**
 * Sync the CSS variable with the current webFrame zoom level.
 * Call on startup after the main process has restored the zoom.
 */
export function syncZoomCSSVar(): void {
  const level = window.api.ui.getZoomLevel()
  const zoomFactor = Math.pow(1.2, level)
  document.documentElement.style.setProperty('--ui-zoom-factor', String(zoomFactor))
  if (isMac) {
    window.api.ui.syncTrafficLights(zoomFactor)
  }
}
