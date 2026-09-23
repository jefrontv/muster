import type { RenderRow } from './worktree-list-virtual-rows'
import { folderWorkspaceKey } from '../../../../shared/workspace-scope'

export type WorktreeTreeNavItemKind = 'host' | 'header' | 'worktree' | 'folder-workspace'

export type WorktreeTreeNavItem = {
  kind: WorktreeTreeNavItemKind
  optionId: string
  renderRowIndex: number
  level: number
  parentIndex: number | null
  setSize: number
  posInSet: number
  /** Group key toggled by Left/Right/Enter; absent on leaves. */
  toggleKey?: string
  /** undefined marks a leaf. */
  expanded?: boolean
  worktreeId?: string
  rowKey?: string
}

export type WorktreeTreeItemAria = {
  'aria-level': number
  'aria-setsize': number
  'aria-posinset': number
  'aria-expanded'?: boolean
}

export type WorktreeTreeKeyAction =
  | { type: 'focus'; index: number }
  | { type: 'toggle'; index: number }
  | { type: 'activate'; index: number; key: 'Enter' | ' ' }

export function getWorktreeOptionId(rowKey: string): string {
  return `worktree-list-option-${encodeURIComponent(rowKey)}`
}

type PendingNavItem = Omit<WorktreeTreeNavItem, 'setSize' | 'posInSet'>

// Why: the virtualizer keeps the DOM flat, so tree depth lives in aria-level/setsize/posinset.
export function buildWorktreeTreeNavItems(
  rows: readonly RenderRow[],
  collapsedGroups: ReadonlySet<string>
): WorktreeTreeNavItem[] {
  const pending: PendingNavItem[] = []
  const lastIndexAtLevel: number[] = []
  let baseLevel = 0
  let headerLevel: number | null = null

  const push = (item: Omit<PendingNavItem, 'parentIndex'>): void => {
    const parentIndex = lastIndexAtLevel[item.level - 1] ?? null
    lastIndexAtLevel.length = item.level
    lastIndexAtLevel[item.level] = pending.length
    pending.push({ ...item, parentIndex })
  }

  rows.forEach((row, renderRowIndex) => {
    if (row.type === 'host-header') {
      baseLevel = 1
      headerLevel = null
      push({
        kind: 'host',
        optionId: getWorktreeOptionId(row.key),
        renderRowIndex,
        level: 1,
        toggleKey: row.key,
        expanded: !row.collapsed
      })
      return
    }
    if (row.type === 'header') {
      const level = baseLevel + 1 + (row.projectGroupDepth ?? 0)
      headerLevel = level
      const collapsible = row.count > 0
      push({
        kind: 'header',
        optionId: getWorktreeOptionId(row.key),
        renderRowIndex,
        level,
        toggleKey: collapsible ? row.key : undefined,
        expanded: collapsible ? !collapsedGroups.has(row.key) : undefined
      })
      return
    }
    const parentLevel = headerLevel ?? baseLevel
    if (row.type === 'folder-workspace') {
      const worktreeId = folderWorkspaceKey(row.folderWorkspace.id)
      push({
        kind: 'folder-workspace',
        optionId: getWorktreeOptionId(worktreeId),
        renderRowIndex,
        level: parentLevel + 1 + row.depth,
        worktreeId,
        rowKey: worktreeId
      })
      return
    }
    const itemRows = row.type === 'lineage-group' ? row.rows : row.type === 'item' ? [row] : []
    for (const itemRow of itemRows) {
      const hasLineageChildren = itemRow.lineageChildCount > 0 && Boolean(itemRow.lineageGroupKey)
      push({
        kind: 'worktree',
        optionId: getWorktreeOptionId(itemRow.rowKey),
        renderRowIndex,
        level: parentLevel + 1 + itemRow.depth,
        toggleKey: hasLineageChildren ? itemRow.lineageGroupKey : undefined,
        expanded: hasLineageChildren ? !itemRow.lineageCollapsed : undefined,
        worktreeId: itemRow.worktree.id,
        rowKey: itemRow.rowKey
      })
    }
  })

  const setSizeByParent = new Map<number | null, number>()
  for (const item of pending) {
    setSizeByParent.set(item.parentIndex, (setSizeByParent.get(item.parentIndex) ?? 0) + 1)
  }
  const positionByParent = new Map<number | null, number>()
  return pending.map((item) => {
    const posInSet = (positionByParent.get(item.parentIndex) ?? 0) + 1
    positionByParent.set(item.parentIndex, posInSet)
    return { ...item, posInSet, setSize: setSizeByParent.get(item.parentIndex) ?? 1 }
  })
}

export function getWorktreeTreeItemAria(
  item: WorktreeTreeNavItem | undefined
): WorktreeTreeItemAria | undefined {
  if (!item) {
    return undefined
  }
  return {
    'aria-level': item.level,
    'aria-setsize': item.setSize,
    'aria-posinset': item.posInSet,
    ...(item.expanded !== undefined ? { 'aria-expanded': item.expanded } : {})
  }
}

/** Maps an unmodified key to a tree action per the WAI-ARIA tree pattern (no wrap-around). */
export function resolveWorktreeTreeKeyAction(
  key: string,
  items: readonly WorktreeTreeNavItem[],
  currentIndex: number
): WorktreeTreeKeyAction | null {
  if (items.length === 0) {
    return null
  }
  const current = currentIndex >= 0 ? items[currentIndex] : undefined
  switch (key) {
    case 'ArrowDown':
      return { type: 'focus', index: current ? Math.min(currentIndex + 1, items.length - 1) : 0 }
    case 'ArrowUp':
      return { type: 'focus', index: current ? Math.max(currentIndex - 1, 0) : 0 }
    case 'Home':
      return { type: 'focus', index: 0 }
    case 'End':
      return { type: 'focus', index: items.length - 1 }
    case 'ArrowRight':
      if (!current) {
        return { type: 'focus', index: 0 }
      }
      if (current.expanded === false) {
        return { type: 'toggle', index: currentIndex }
      }
      if (current.expanded === true && items[currentIndex + 1]?.parentIndex === currentIndex) {
        return { type: 'focus', index: currentIndex + 1 }
      }
      return null
    case 'ArrowLeft':
      if (!current) {
        return { type: 'focus', index: 0 }
      }
      if (current.expanded === true) {
        return { type: 'toggle', index: currentIndex }
      }
      return current.parentIndex !== null ? { type: 'focus', index: current.parentIndex } : null
    case 'Enter':
    case ' ':
      if (!current) {
        return null
      }
      if (current.kind === 'host' || current.kind === 'header') {
        return current.toggleKey ? { type: 'toggle', index: currentIndex } : null
      }
      return { type: 'activate', index: currentIndex, key }
    default:
      return null
  }
}
