// The Bots partition: the only Electron session that carries the bots server's owner token.
// Other sessions need no block of their own: the server answers 401 to any browser request
// without the token, and Muster's browser sessions already own their onBeforeRequest hook.
import { session, shell, type Session, type WebContents } from 'electron'
import { BOTS_PARTITION } from '../../shared/bots-types'
import type { KeybindingOverrides } from '../../shared/keybindings'
import type { UIZoomDirection } from '../../shared/ui-zoom-level'
import { resolveZoomShortcut } from '../window/zoom-shortcut-input'
import { BOTS_OWNER_HEADER, botsOwnerCapability } from './bots-sidecar'

// Clipboard and notifications are what the Bots UI asks for; mic, camera and the rest stay denied.
const ALLOWED_PERMISSIONS = new Set(['clipboard-sanitized-write', 'notifications', 'fullscreen'])

let botsSession: Session | null = null

function targetsBotsServer(url: string, port: number): boolean {
  try {
    const target = new URL(url)
    return (
      (target.protocol === 'http:' || target.protocol === 'ws:') &&
      target.hostname === '127.0.0.1' &&
      Number(target.port || 80) === port
    )
  } catch {
    return false
  }
}

export function installBotsSession(): void {
  if (botsSession) {
    return
  }
  const bots = session.fromPartition(BOTS_PARTITION)
  botsSession = bots
  bots.webRequest.onBeforeSendHeaders((details, callback) => {
    const owner = botsOwnerCapability()
    const owns = owner !== null && targetsBotsServer(details.url, owner.port)
    callback({
      requestHeaders: owns
        ? { ...details.requestHeaders, [BOTS_OWNER_HEADER]: owner.token }
        : details.requestHeaders
    })
  })
  bots.setPermissionRequestHandler((_contents, permission, callback) => {
    callback(ALLOWED_PERMISSIONS.has(permission))
  })
  bots.setPermissionCheckHandler((_contents, permission) => ALLOWED_PERMISSIONS.has(permission))
}

/** Whether a webview may attach: the Bots partition, pointed at the running bots server only. */
export function isBotsWebviewAttach(partition: string, src: string): boolean {
  const owner = botsOwnerCapability()
  return partition === BOTS_PARTITION && owner !== null && targetsBotsServer(src, owner.port)
}

/** Before install no guest can be a Bots guest: attach requires the running server. */
export function isBotsGuest(guest: WebContents): boolean {
  return botsSession !== null && guest.session === botsSession
}

/** Keeps the Bots guest on the bots server; links elsewhere open in the user's browser. */
export function attachBotsGuestPolicies(
  guest: WebContents,
  zoom: {
    onZoom?: (direction: UIZoomDirection) => void
    getKeybindings?: () => KeybindingOverrides | undefined
  } = {}
): void {
  // Why: keys typed in the guest skip the main window's before-input-event, so zoom chords never reached Muster.
  const { onZoom } = zoom
  if (onZoom) {
    guest.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') {
        return
      }
      const direction = resolveZoomShortcut(input, zoom.getKeybindings?.())
      if (direction) {
        event.preventDefault()
        onZoom(direction)
      }
    })
  }
  const openOutside = (url: string): void => {
    if (/^https?:\/\//i.test(url)) {
      void shell.openExternal(url)
    }
  }
  guest.setWindowOpenHandler(({ url }) => {
    const owner = botsOwnerCapability()
    if (!owner || !targetsBotsServer(url, owner.port)) {
      openOutside(url)
    }
    return { action: 'deny' }
  })
  guest.on('will-navigate', (event, url) => {
    const owner = botsOwnerCapability()
    if (!owner || !targetsBotsServer(url, owner.port)) {
      event.preventDefault()
      openOutside(url)
    }
  })
}
