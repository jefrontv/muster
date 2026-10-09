import {
  getSourceControlTreeNavCommand,
  type SourceControlTreeNavCommand
} from './source-control-tree-navigation'

export const SOURCE_CONTROL_TREE_ROW_ATTRIBUTE = 'data-source-control-tree-row'

export type SourceControlTreeKeyCommand =
  | { type: 'navigate'; command: SourceControlTreeNavCommand }
  | { type: 'context-menu' }
  | { type: 'open' }
  | { type: 'toggle-index' }
  | { type: 'discard' }

type KeyInput = Pick<KeyboardEvent, 'key' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>

export function resolveSourceControlTreeKeyCommand(
  event: KeyInput,
  isMac: boolean
): SourceControlTreeKeyCommand | null {
  if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
    return { type: 'context-menu' }
  }
  // Why: modified keys belong to app shortcuts and selection gestures, not tree moves.
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return null
  }
  const navCommand = getSourceControlTreeNavCommand(event.key)
  if (navCommand) {
    return { type: 'navigate', command: navCommand }
  }
  switch (event.key) {
    case 'Enter':
      return { type: 'open' }
    case ' ':
      return { type: 'toggle-index' }
    case 'Delete':
      return { type: 'discard' }
    case 'Backspace':
      // Why: Mac keyboards have no forward Delete key; Backspace is the native "delete item" key there.
      return isMac ? { type: 'discard' } : null
    default:
      return null
  }
}

export function isSourceControlTreeMacPlatform(): boolean {
  return typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac')
}

export function openSourceControlTreeRowContextMenu(element: HTMLElement): void {
  const rect = element.getBoundingClientRect()
  // Why: Radix positions the context menu at the event's client point; anchor it under the row start.
  element.dispatchEvent(
    new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      button: 2,
      clientX: rect.left + 16,
      clientY: rect.bottom
    })
  )
}

/**
 * Which row a tree keydown targets. rowId null means the parked container
 * (act on the tab-stop row); null overall means the event is not the tree's.
 */
export function resolveSourceControlTreeKeyTarget(
  target: HTMLElement,
  container: HTMLElement
): { rowId: string | null; onNestedControl: boolean } | null {
  if (target.isContentEditable || target.closest('input, textarea, select')) {
    return null
  }
  if (target === container) {
    return { rowId: null, onNestedControl: false }
  }
  const rowElement = target.closest<HTMLElement>(`[${SOURCE_CONTROL_TREE_ROW_ATTRIBUTE}]`)
  if (!rowElement) {
    return null
  }
  return {
    rowId: rowElement.getAttribute(SOURCE_CONTROL_TREE_ROW_ATTRIBUTE),
    onNestedControl: rowElement !== target
  }
}
