import { shell, type WebContents } from 'electron'
import { is } from '@electron-toolkit/utils'
import { normalizeExternalBrowserUrl } from '../../shared/browser-url'

type PrivilegedWindowNavigationOptions = {
  /** Renderers without Orca's worktree/tab model (dashboard popout) must hand links straight to the OS. */
  routeLinksToRenderer?: boolean
}

/** Keep remote documents from inheriting an Orca window's privileged preload. */
export function installPrivilegedWindowNavigationPolicy(
  contents: WebContents,
  options: PrivilegedWindowNavigationOptions = {}
): void {
  const routeLinksToRenderer = options.routeLinksToRenderer !== false

  // Why: the renderer owns the tab model and the openLinksInApp preference, and falls
  // back to shell.openExternal itself, so main forwards instead of deciding here.
  const openLink = (externalUrl: string): void => {
    if (routeLinksToRenderer && !contents.isDestroyed()) {
      contents.send('browser:open-link-in-orca-tab', { browserPageId: null, url: externalUrl })
      return
    }
    void shell.openExternal(externalUrl)
  }

  contents.setWindowOpenHandler(({ url }) => {
    const externalUrl = normalizeExternalBrowserUrl(url)
    if (externalUrl) {
      openLink(externalUrl)
    }
    return { action: 'deny' }
  })

  contents.on('will-navigate', (event, url) => {
    const externalUrl = normalizeExternalBrowserUrl(url)
    if (externalUrl) {
      if (is.dev && process.env.ELECTRON_RENDERER_URL) {
        try {
          const target = new URL(externalUrl)
          const allowed = new URL(process.env.ELECTRON_RENDERER_URL)
          if (target.origin === allowed.origin) {
            return
          }
        } catch {
          // Fall through and block malformed navigation targets.
        }
      }
      openLink(externalUrl)
    }
    event.preventDefault()
  })
}
