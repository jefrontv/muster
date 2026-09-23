import type { RenderRow } from './worktree-list-virtual-rows'

export type WorktreeTreeBranch = 'first' | 'middle' | 'last' | 'only'

function getBranchRowKey(row: RenderRow): string | null {
  if (row.type === 'item') {
    return row.rowKey
  }
  if (row.type === 'lineage-group') {
    return row.rows[0]?.rowKey ?? null
  }
  return null
}

/**
 * Where each top-level card sits in the run of cards under its header, so the sidebar can draw
 * the connector from the header glyph (spine + elbow). Any header ends the run.
 */
export function buildWorktreeTreeBranches(
  rows: readonly RenderRow[]
): Map<string, WorktreeTreeBranch> {
  const branches = new Map<string, WorktreeTreeBranch>()
  let run: string[] = []
  const flush = (): void => {
    run.forEach((rowKey, index) => {
      const isFirst = index === 0
      const isLast = index === run.length - 1
      branches.set(
        rowKey,
        isFirst && isLast ? 'only' : isFirst ? 'first' : isLast ? 'last' : 'middle'
      )
    })
    run = []
  }
  for (const row of rows) {
    if (row.type === 'header' || row.type === 'host-header') {
      flush()
      continue
    }
    const rowKey = getBranchRowKey(row)
    if (rowKey !== null) {
      run.push(rowKey)
    }
  }
  flush()
  return branches
}
