/**
 * Pure keyboard navigation over the source-control tree's flat visible-row
 * model (section headers, folders, files in render order).
 */

export type SourceControlTreeNavRow = {
  id: string
  /** 1-based aria-level. */
  level: number
  /** undefined marks a leaf; true/false an expandable row. */
  expanded?: boolean
}

export type SourceControlTreeNavCommand =
  | 'previous'
  | 'next'
  | 'first'
  | 'last'
  | 'collapse'
  | 'expand'

export type SourceControlTreeNavOutcome =
  | { type: 'focus'; id: string }
  | { type: 'expand'; id: string }
  | { type: 'collapse'; id: string }
  | null

const NAV_COMMAND_BY_KEY: Record<string, SourceControlTreeNavCommand> = {
  ArrowUp: 'previous',
  ArrowDown: 'next',
  Home: 'first',
  End: 'last',
  ArrowLeft: 'collapse',
  ArrowRight: 'expand'
}

export function getSourceControlTreeNavCommand(key: string): SourceControlTreeNavCommand | null {
  return NAV_COMMAND_BY_KEY[key] ?? null
}

export function findSourceControlTreeParentIndex(
  rows: readonly SourceControlTreeNavRow[],
  index: number
): number {
  const level = rows[index]?.level
  if (level === undefined) {
    return -1
  }
  for (let i = index - 1; i >= 0; i--) {
    if (rows[i].level < level) {
      return i
    }
  }
  return -1
}

function focusRow(row: SourceControlTreeNavRow | undefined): SourceControlTreeNavOutcome {
  return row ? { type: 'focus', id: row.id } : null
}

export function resolveSourceControlTreeNavigation(
  rows: readonly SourceControlTreeNavRow[],
  currentId: string | null,
  command: SourceControlTreeNavCommand
): SourceControlTreeNavOutcome {
  if (rows.length === 0) {
    return null
  }
  const index = currentId === null ? -1 : rows.findIndex((row) => row.id === currentId)
  if (command === 'first') {
    return focusRow(rows[0])
  }
  if (command === 'last') {
    return focusRow(rows.at(-1))
  }
  if (index === -1) {
    return focusRow(rows[0])
  }
  const row = rows[index]
  switch (command) {
    case 'previous':
      return focusRow(rows[index - 1])
    case 'next':
      return focusRow(rows[index + 1])
    case 'expand': {
      if (row.expanded === false) {
        return { type: 'expand', id: row.id }
      }
      const child = rows[index + 1]
      return row.expanded === true && child && child.level > row.level ? focusRow(child) : null
    }
    case 'collapse': {
      if (row.expanded === true) {
        return { type: 'collapse', id: row.id }
      }
      return focusRow(rows[findSourceControlTreeParentIndex(rows, index)])
    }
  }
}

/**
 * The single tabbable row. Keeps the preferred row while it is visible;
 * otherwise falls back to whatever now sits at its old index, so staging the
 * focused file lands on its neighbour instead of jumping to the top.
 */
export function resolveSourceControlTreeTabStop(
  rows: readonly SourceControlTreeNavRow[],
  preferredId: string | null,
  fallbackIndex: number
): string | null {
  if (rows.length === 0) {
    return null
  }
  if (preferredId !== null && rows.some((row) => row.id === preferredId)) {
    return preferredId
  }
  const clamped = Math.min(Math.max(fallbackIndex, 0), rows.length - 1)
  return rows[clamped].id
}

export type SourceControlTreeSetPosition = { posInSet: number; setSize: number }

// Why: virtualised sections only mount a window of rows, so screen readers
// cannot count siblings from the DOM; aria-posinset/setsize must be explicit.
export function computeSourceControlTreeSetPositions(
  rows: readonly SourceControlTreeNavRow[]
): SourceControlTreeSetPosition[] {
  const positions: SourceControlTreeSetPosition[] = Array.from({ length: rows.length })
  const openGroups: { level: number; members: number[] }[] = []
  const closeGroup = (group: { members: number[] }): void => {
    group.members.forEach((rowIndex, position) => {
      positions[rowIndex] = { posInSet: position + 1, setSize: group.members.length }
    })
  }
  rows.forEach((row, index) => {
    while (openGroups.length > 0 && openGroups.at(-1)!.level > row.level) {
      closeGroup(openGroups.pop()!)
    }
    const top = openGroups.at(-1)
    if (top && top.level === row.level) {
      top.members.push(index)
    } else {
      openGroups.push({ level: row.level, members: [index] })
    }
  })
  while (openGroups.length > 0) {
    closeGroup(openGroups.pop()!)
  }
  return positions
}
