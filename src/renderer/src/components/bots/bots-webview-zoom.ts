// Keeps the Bots webview at Muster's UI scale; a guest page doesn't inherit the host window's zoom.
import { currentUIZoomFactor, UI_ZOOM_APPLIED_EVENT } from '@/lib/ui-zoom'

type ZoomableWebview = Pick<
  Electron.WebviewTag,
  'setZoomFactor' | 'addEventListener' | 'removeEventListener'
>

export function syncBotsWebviewZoom(
  webview: ZoomableWebview,
  factor: () => number = currentUIZoomFactor,
  host: Pick<Window, 'addEventListener' | 'removeEventListener'> = window
): () => void {
  let ready = false
  const apply = (): void => {
    // setZoomFactor throws until the guest has attached.
    if (ready) {
      webview.setZoomFactor(factor())
    }
  }
  const onReady = (): void => {
    ready = true
    apply()
  }
  webview.addEventListener('dom-ready', onReady)
  host.addEventListener(UI_ZOOM_APPLIED_EVENT, apply)
  return () => {
    webview.removeEventListener('dom-ready', onReady)
    host.removeEventListener(UI_ZOOM_APPLIED_EVENT, apply)
  }
}
