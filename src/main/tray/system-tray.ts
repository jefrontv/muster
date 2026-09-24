import { Menu, Tray, type NativeImage } from 'electron'
import { createAppIconImage } from '../app-icon'
import { translateMain } from '../i18n/main-i18n'
import { composeTrayAttentionIcon } from './tray-attention-icon'

export type SystemTrayOptions = {
  /** App icon id from settings; the tray reuses the app icon image. */
  appIcon: unknown
  /** True for dev/unpackaged instances; shows a DEV marker in the tooltip. */
  isDevInstance: boolean
  /** Worktree/branch label identifying the dev instance, when known. */
  devInstanceLabel: string | null
  /** Restore + show + focus the main window (recreating it if needed). */
  onOpen: () => void
  /** Quit Muster for real (caller must set the quitting latch before quitting). */
  onQuit: () => void
}

// Why: Electron's Tray is GC-collected and its icon vanishes if no live
// reference is kept, so hold it at module scope for the app's lifetime.
let tray: Tray | null = null

// Why: hold the plain (dot-free) icon so we can toggle the attention dot on and
// off with tray.setImage without rebuilding the icon from the app-icon PNG.
let baseTrayImage: NativeImage | null = null

// Why: an attention event can fire while the tray is still being created
// (creation is deferred ~ready-to-show); remember the desired state so a
// freshly created tray reflects it immediately.
let attentionActive = false

// Why: dev instances share the production app icon, so remember dev-ness at
// module scope; tooltip rebuilds (attention on/off) must keep the marker.
let devIndicator: { label: string | null } | null = null

// Why: multiple dev instances can run side by side (one per worktree); the
// tooltip carries the worktree/branch label so hovering tells them apart.
function baseTooltip(): string {
  if (!devIndicator) {
    return 'Muster'
  }
  return devIndicator.label ? `Muster DEV (${devIndicator.label})` : 'Muster DEV'
}

// Why: the Windows notification area expects a 16px icon; the app icon PNG is
// larger, so downscale to avoid a cropped/blurry tray glyph.
const TRAY_ICON_SIZE = 16

// Why: collapse bursts (rapid show/hide) into one repaint; the deferred pass reads
// current module state, so a dropped schedule can never land a stale icon.
let trayImageRepaintPending = false

// Why: tray.setImage drives a synchronous Shell_NotifyIcon update, so run it on a
// fresh turn rather than mutating the icon re-entrantly from a native callback.
function scheduleTrayImage(): void {
  if (trayImageRepaintPending) {
    return
  }
  trayImageRepaintPending = true
  setTimeout(() => {
    trayImageRepaintPending = false
    if (!tray || tray.isDestroyed() || !baseTrayImage) {
      return
    }
    tray.setImage(attentionActive ? composeTrayAttentionIcon(baseTrayImage) : baseTrayImage)
  }, 0)
}

// Why: Electron Menu/Tray click callbacks are plain event listeners (not
// promise-wrapped like ipcMain.handle), so an uncaught throw here is fatal to
// the main process; contain it to a logged, failed menu action instead.
function safeMenuAction(action: () => void): () => void {
  return () => {
    try {
      action()
    } catch (error) {
      console.error('[system-tray] menu action failed', error)
    }
  }
}

/**
 * Creates the Windows notification icon. No-op on macOS (the Dock is the only
 * presence there) and on Linux. Idempotent: repeated calls never stack
 * duplicate icons.
 */
export function createSystemTray(opts: SystemTrayOptions): Tray | null {
  if (process.platform !== 'win32') {
    return null
  }
  if (tray && !tray.isDestroyed()) {
    return tray
  }

  devIndicator = opts.isDevInstance ? { label: opts.devInstanceLabel } : null
  baseTrayImage = createAppIconImage(opts.appIcon).resize({
    width: TRAY_ICON_SIZE,
    height: TRAY_ICON_SIZE
  })

  tray = new Tray(baseTrayImage)
  // Why: reflect any attention event that fired before the tray existed.
  tray.setImage(attentionActive ? composeTrayAttentionIcon(baseTrayImage) : baseTrayImage)

  const menu = Menu.buildFromTemplate([
    ...(devIndicator
      ? ([
          // Why: several dev instances (one per worktree) can show trays at
          // once; the disabled header ties this one to its worktree/branch.
          { label: baseTooltip(), enabled: false },
          { type: 'separator' }
        ] as Electron.MenuItemConstructorOptions[])
      : []),
    {
      label: translateMain('tray.openOrca', 'Open Muster'),
      click: safeMenuAction(() => opts.onOpen())
    },
    { type: 'separator' },
    { label: translateMain('tray.quit', 'Quit'), click: safeMenuAction(() => opts.onQuit()) }
  ])
  tray.setContextMenu(menu)
  tray.setToolTip(baseTooltip())
  // Why: a left-click on the tray icon is the conventional Windows gesture to
  // restore a minimized-to-tray app.
  tray.on(
    'click',
    safeMenuAction(() => opts.onOpen())
  )
  return tray
}

/**
 * Shows or hides a red/amber attention dot on the tray icon. Call with `true`
 * when a terminal bell or agent completion fires while the window is
 * minimized/hidden, and `false` once the window is shown again. Safe to call
 * before the tray is created or on macOS/Linux where no tray is available.
 */
export function setTrayAttention(active: boolean): void {
  if (attentionActive === active) {
    return
  }
  // Why: the dedup latch must settle synchronously or rapid show/hide mis-dedupes;
  // only the native icon mutation moves off the caller's stack.
  attentionActive = active
  scheduleTrayImage()
}

/** Destroys the tray icon if present. Safe to call repeatedly or with no tray. */
export function destroySystemTray(): void {
  if (tray && !tray.isDestroyed()) {
    tray.destroy()
  }
  tray = null
  baseTrayImage = null
  // Why: attention is owned by the notification/visibility flow, and must
  // survive a hide/show toggle so a re-shown icon keeps its dot.
}
