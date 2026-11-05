// The Bots guest reports, over its console, whether its sidebar has made room for Muster's mode toggle.
// The tag must match MUSTER_SIDEBAR_ROOM_TAG in the muster-bots fork (src/lib/embed-host.ts).
export const BOTS_SIDEBAR_ROOM_TAG = '__muster_bots_sidebar_room__'

/** Room for the toggle: 12px padding above and below a 36px toggle, the same inset Code mode uses. */
export const BOTS_TOGGLE_CHROME_TOP = 60

export function parseBotsSidebarRoom(message: string): boolean | null {
  if (!message.startsWith(BOTS_SIDEBAR_ROOM_TAG)) {
    return null
  }
  return message.slice(BOTS_SIDEBAR_ROOM_TAG.length) === '1'
}

/** Calls onChange with the guest's latest answer; a reload starts from "no room" until it answers again. */
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
  webview.addEventListener('did-start-loading', onNavigate)
  return () => {
    webview.removeEventListener('console-message', onMessage)
    webview.removeEventListener('did-start-loading', onNavigate)
  }
}
