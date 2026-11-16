// A Bots notification clicked while another tab is showing opens the thread inside the guest but left Muster on
// that tab. The guest's Notification is wrapped so a click also says so over the console, and Bots comes forward.
export const BOTS_NOTIFICATION_CLICK_TAG = '__muster_bots_notification_click__'

export const BOTS_NOTIFICATION_PATCH_SCRIPT = `(() => {
  const Base = window.Notification
  if (typeof Base !== 'function' || Base.__musterWrapped) return
  class MusterNotification extends Base {
    constructor(title, options) {
      super(title, options)
      this.addEventListener('click', () => console.log(${JSON.stringify(BOTS_NOTIFICATION_CLICK_TAG)}))
    }
  }
  MusterNotification.__musterWrapped = true
  window.Notification = MusterNotification
})(); void 0`

type BotsNotificationWebview = Pick<
  Electron.WebviewTag,
  'addEventListener' | 'removeEventListener' | 'executeJavaScript'
>

export function connectBotsNotifications(
  webview: BotsNotificationWebview,
  showBots: () => void
): () => void {
  const onDomReady = (): void => {
    webview.executeJavaScript(BOTS_NOTIFICATION_PATCH_SCRIPT).catch(() => {})
  }
  const onMessage = (event: Electron.ConsoleMessageEvent): void => {
    if (event.message === BOTS_NOTIFICATION_CLICK_TAG) {
      showBots()
    }
  }
  webview.addEventListener('dom-ready', onDomReady)
  webview.addEventListener('console-message', onMessage)
  return () => {
    webview.removeEventListener('dom-ready', onDomReady)
    webview.removeEventListener('console-message', onMessage)
  }
}
