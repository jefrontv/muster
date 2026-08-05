import type { KeybindingActionId } from '../../../../shared/keybindings'
import type { AppState } from '@/store/types'
import { canShowRightSidebarForView } from '@/lib/right-sidebar-visibility'
import { TOGGLE_FLOATING_TERMINAL_EVENT } from '@/lib/floating-terminal'
import { TOGGLE_QUICK_COMMANDS_MENU_EVENT } from '@/lib/quick-commands-menu-events'
import { OPEN_WORKSPACE_BOARD_EVENT } from '@/components/sidebar/useWorkspaceBoardPanel'
import { requestScrollToCurrentWorkspaceRevealAndRename } from '@/lib/scroll-to-current-workspace-status'

export type ActionPaletteInvoker = (state: AppState) => void

function revealRightSidebarTab(state: AppState, tab: 'source-control' | 'checks' | 'ports'): void {
  if (!canShowRightSidebarForView(state.activeView)) {
    return
  }
  state.setRightSidebarTab(tab)
  state.setRightSidebarOpen(true)
}

/**
 * Chords whose effect is reachable from store state alone. Every entry mirrors the
 * handler the same action already runs in App.tsx or useIpcEvents, so the palette
 * adds a second trigger rather than a second behavior. Pane-scoped chords (terminal,
 * editor, browser, file explorer) are deliberately absent — they need the focus the
 * palette just took away, so those rows reveal the shortcut in Settings instead.
 */
export const ACTION_PALETTE_INVOKERS: Partial<Record<KeybindingActionId, ActionPaletteInvoker>> = {
  'app.settings': (state) => state.openSettingsPage(),
  'worktree.quickOpen': (state) => {
    if (state.activeView === 'terminal' && state.activeWorktreeId !== null) {
      state.openModal('quick-open')
    }
  },
  'worktree.palette': (state) => state.openModal('worktree-palette'),
  'workspace.rename': (state) => {
    state.setSidebarOpen(true)
    requestScrollToCurrentWorkspaceRevealAndRename()
  },
  'workspace.openBoard': (state) => {
    state.setSidebarOpen(true)
    window.dispatchEvent(new CustomEvent(OPEN_WORKSPACE_BOARD_EVENT))
  },
  'view.tasks': (state) => state.openTaskPage(),
  'sidebar.left.toggle': (state) => state.toggleSidebar(),
  'sidebar.right.toggle': (state) => {
    if (canShowRightSidebarForView(state.activeView)) {
      state.toggleRightSidebar()
    }
  },
  'sidebar.explorer.toggle': (state) => {
    if (canShowRightSidebarForView(state.activeView)) {
      state.showRightSidebarFiles()
    }
  },
  'sidebar.search.toggle': (state) => {
    if (canShowRightSidebarForView(state.activeView)) {
      state.showRightSidebarSearch()
    }
  },
  'sidebar.sourceControl.toggle': (state) => revealRightSidebarTab(state, 'source-control'),
  'sidebar.checks.toggle': (state) => revealRightSidebarTab(state, 'checks'),
  'sidebar.ports.toggle': (state) => revealRightSidebarTab(state, 'ports'),
  'sidebar.sleepingWorkspaces.toggle': (state) => {
    const next = !state.showSleepingWorkspaces
    state.setShowSleepingWorkspaces(next)
    if (next) {
      state.setSidebarOpen(true)
    }
  },
  'sourceControl.sendReviewNotes': (state) => {
    state.openDiffNotesSendMenuForActiveWorktree()
  },
  'floatingTerminal.toggle': () => {
    window.dispatchEvent(new CustomEvent(TOGGLE_FLOATING_TERMINAL_EVENT))
  },
  'tab.openQuickCommandsMenu': () => {
    window.dispatchEvent(new CustomEvent(TOGGLE_QUICK_COMMANDS_MENU_EVENT))
  }
}

export function isActionPaletteCommandInvocable(actionId: KeybindingActionId): boolean {
  return ACTION_PALETTE_INVOKERS[actionId] !== undefined
}
