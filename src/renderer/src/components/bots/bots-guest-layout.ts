// The Bots guest reports, over its console, whether its sidebar has made room for Muster's mode toggle.
// The tag must match MUSTER_SIDEBAR_ROOM_TAG in the muster-bots fork (src/lib/embed-host.ts).
export const BOTS_SIDEBAR_ROOM_TAG = '__muster_bots_sidebar_room__'

/** Room for the toggle: 12px padding above and below a 36px toggle, the same inset Code mode uses. */
export const BOTS_TOGGLE_CHROME_TOP = 60

type BotsGuestLayoutStore = {
  getWidth: () => number
  subscribeWidth: (onChange: () => void) => () => void
}

/** Layout pushed to the guest. It pads for the toggle only while the toggle floats, or the band and the padding stack. */
export function createBotsGuestLayout(store: BotsGuestLayoutStore): {
  get: () => { sidebarWidth: number; chromeTop: number }
  subscribe: (onChange: () => void) => () => void
  setRoom: (room: boolean) => void
} {
  let room = false
  let changed = (): void => {}
  return {
    get: () => ({ sidebarWidth: store.getWidth(), chromeTop: room ? BOTS_TOGGLE_CHROME_TOP : 0 }),
    subscribe: (onChange) => {
      changed = onChange
      const stop = store.subscribeWidth(onChange)
      return () => {
        changed = () => {}
        stop()
      }
    },
    setRoom: (next) => {
      if (next !== room) {
        room = next
        changed()
      }
    }
  }
}

export function parseBotsSidebarRoom(message: string): boolean | null {
  if (!message.startsWith(BOTS_SIDEBAR_ROOM_TAG)) {
    return null
  }
  return message.slice(BOTS_SIDEBAR_ROOM_TAG.length) === '1'
}

/** Calls onChange with the guest's latest answer; a main-frame navigation starts from "no room" until it answers again. */
export function watchBotsSidebarRoom(
  webview: Electron.WebviewTag,
  onChange: (room: boolean) => void
): () => void {
  const onMessage = (event: Electron.ConsoleMessageEvent): void => {
    const room = parseBotsSidebarRoom(event.message)
    if (room !== null) {
      onChange(room)
    }
  }
  const onNavigate = (): void => onChange(false)
  webview.addEventListener('console-message', onMessage)
  // did-navigate is main frame only; did-start-loading also fires for subframes and would drop the answer.
  webview.addEventListener('did-navigate', onNavigate)
  return () => {
    webview.removeEventListener('console-message', onMessage)
    webview.removeEventListener('did-navigate', onNavigate)
  }
}
