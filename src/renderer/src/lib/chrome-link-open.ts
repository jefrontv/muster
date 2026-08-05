import { openHttpLink } from './http-link-routing'
import { getRuntimeEnvironmentIdForWorktree } from './worktree-runtime-owner'
import { consumeSystemBrowserClickEscape } from './system-browser-click-escape'
import { openFloatingWorkspaceBrowserUrl } from './floating-workspace-tab-creation'
import { isFloatingWorkspacePanelVisible } from './floating-workspace-terminal-actions'
import { TOGGLE_FLOATING_TERMINAL_EVENT } from './floating-terminal'
import type { GlobalSettings, TopLevelView } from '../../../shared/types'
import type { AppState } from '@/store/types'

type ChromeLinkSettings = Partial<
  Pick<
    GlobalSettings,
    | 'activeRuntimeEnvironmentId'
    | 'floatingTerminalEnabled'
    | 'openLinksInApp'
    | 'openLinksInFloatingBrowser'
  >
>

type ChromeLinkStore = Parameters<typeof getRuntimeEnvironmentIdForWorktree>[0] &
  Pick<AppState, 'activeGroupIdByWorktree' | 'browserDefaultUrl' | 'createBrowserTab'> & {
    activeWorktreeId: string | null
    activeView: TopLevelView
    setActiveView: (view: TopLevelView) => void
    settings?: ChromeLinkSettings | null
  }

function shouldUseFloatingBrowser(settings: ChromeLinkSettings | null | undefined): boolean {
  return (
    settings?.openLinksInApp === true &&
    settings?.openLinksInFloatingBrowser === true &&
    settings?.floatingTerminalEnabled === true
  )
}

/**
 * Routes an http(s) link clicked in app chrome (task panels, sidebars) that main intercepted
 * via will-navigate / window-open, where no source browser page exists.
 */
export function openChromeHttpLink(store: ChromeLinkStore, url: string): void {
  const forceSystemBrowser = consumeSystemBrowserClickEscape()

  // The floating panel is local-only and overlays every view, so it needs no worktree
  // and no view switch — which also makes it the one in-app target that works while a
  // remote-runtime workspace is active.
  if (!forceSystemBrowser && shouldUseFloatingBrowser(store.settings)) {
    openFloatingWorkspaceBrowserUrl(store, url)
    // Why: owning a tab only mounts the panel — its open state is separate, so a collapsed
    // panel would swallow the new tab. Toggle only when hidden; toggling a visible panel closes it.
    if (!isFloatingWorkspacePanelVisible()) {
      window.dispatchEvent(new Event(TOGGLE_FLOATING_TERMINAL_EVENT))
    }
    return
  }

  const worktreeId = store.activeWorktreeId
  // Remote-runtime workspaces cannot host a local guest, so they fall back to the system browser.
  const routableWorktreeId =
    worktreeId && !getRuntimeEnvironmentIdForWorktree(store, worktreeId) ? worktreeId : null

  const destination = openHttpLink(url, {
    worktreeId: routableWorktreeId,
    forceSystemBrowser
  })

  // Why: chrome links are clicked from Tasks/Activity/Settings, where the workspace panes are
  // hidden — without this the tab opens behind the current view and the click looks ignored.
  if (destination === 'in-app-browser' && store.activeView !== 'terminal') {
    store.setActiveView('terminal')
  }
}
