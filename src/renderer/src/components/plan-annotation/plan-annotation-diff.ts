// Unified diff of a reviewer's direct edits to the plan.
//
// Why send a diff rather than the whole rewritten document: the agent needs to see WHICH lines the
// reviewer changed. Handed a full replacement it cannot tell an intentional edit from an unrelated
// paragraph it should leave alone, and it loses the reason the edit was made.

/** Longest-common-subsequence table over lines, which is what makes the diff minimal. */
function lcsLengths(before: readonly string[], after: readonly string[]): number[][] {
  const table: number[][] = Array.from({ length: before.length + 1 }, () =>
    Array.from<number>({ length: after.length + 1 }).fill(0)
  )
  for (let i = before.length - 1; i >= 0; i -= 1) {
    for (let j = after.length - 1; j >= 0; j -= 1) {
      table[i]![j] =
        before[i] === after[j]
          ? table[i + 1]![j + 1]! + 1
          : Math.max(table[i + 1]![j]!, table[i]![j + 1]!)
    }
  }
  return table
}

type Op = {
  sign: ' ' | '-' | '+'
  text: string
  beforeLine: number
  afterLine: number
}

function diffOps(before: readonly string[], after: readonly string[]): Op[] {
  const table = lcsLengths(before, after)
  const ops: Op[] = []
  let i = 0
  let j = 0
  while (i < before.length && j < after.length) {
    if (before[i] === after[j]) {
      ops.push({
        sign: ' ',
        text: before[i]!,
        beforeLine: i + 1,
        afterLine: j + 1
      })
      i += 1
      j += 1
    } else if (table[i + 1]![j]! >= table[i]![j + 1]!) {
      ops.push({
        sign: '-',
        text: before[i]!,
        beforeLine: i + 1,
        afterLine: j + 1
      })
      i += 1
    } else {
      ops.push({
        sign: '+',
        text: after[j]!,
        beforeLine: i + 1,
        afterLine: j + 1
      })
      j += 1
    }
  }
  while (i < before.length) {
    ops.push({
      sign: '-',
      text: before[i]!,
      beforeLine: i + 1,
      afterLine: j + 1
    })
    i += 1
  }
  while (j < after.length) {
    ops.push({
      sign: '+',
      text: after[j]!,
      beforeLine: i + 1,
      afterLine: j + 1
    })
    j += 1
  }
  return ops
}

const CONTEXT = 3

/**
 * Renders a unified diff, or an empty string when nothing changed.
 *
 * Hunks carry three lines of context for the same reason `git diff` does: an agent applying the
 * edit needs enough surrounding text to locate it after its own earlier revisions moved things.
 */
export function unifiedPlanDiff(beforeText: string, afterText: string): string {
  if (beforeText === afterText) {
    return ''
  }
  const before = beforeText.split('\n')
  const after = afterText.split('\n')
  const ops = diffOps(before, after)

  const changed = ops
    .map((op, index) => (op.sign === ' ' ? -1 : index))
    .filter((index) => index >= 0)
  if (changed.length === 0) {
    return ''
  }

  // Group changes that are within 2*CONTEXT of each other into one hunk, so adjacent edits do not
  // produce a wall of near-duplicate headers.
  const groups: { start: number; end: number }[] = []
  for (const index of changed) {
    const last = groups.at(-1)
    if (last && index - last.end <= CONTEXT * 2) {
      last.end = index
    } else {
      groups.push({ start: index, end: index })
    }
  }

  const lines: string[] = []
  for (const group of groups) {
    const from = Math.max(0, group.start - CONTEXT)
    const to = Math.min(ops.length - 1, group.end + CONTEXT)
    const slice = ops.slice(from, to + 1)
    const beforeCount = slice.filter((op) => op.sign !== '+').length
    const afterCount = slice.filter((op) => op.sign !== '-').length
    const beforeStart = slice[0]?.beforeLine ?? 1
    const afterStart = slice[0]?.afterLine ?? 1
    lines.push(`@@ -${beforeStart},${beforeCount} +${afterStart},${afterCount} @@`)
    for (const op of slice) {
      lines.push(`${op.sign}${op.text}`)
    }
  }
  return lines.join('\n')
}
