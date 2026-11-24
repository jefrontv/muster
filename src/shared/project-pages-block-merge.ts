// Three-way merge of page markdown at block level (paragraphs, list runs, fenced code).
// Used when an agent saved a page while the user still had unsaved edits on it.

/** Splits on blank lines, keeping fenced code blocks whole. */
export function splitMarkdownBlocks(markdown: string): string[] {
  const blocks: string[] = []
  let current: string[] = []
  let fence: string | null = null
  const flush = (): void => {
    if (current.length > 0) {
      blocks.push(current.join('\n'))
      current = []
    }
  }
  for (const line of markdown.replace(/\r\n/g, '\n').split('\n')) {
    const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/)?.[1]
    if (marker) {
      fence = fence === null ? marker[0] : fence === marker[0] ? null : fence
    }
    if (fence === null && !marker && line.trim() === '') {
      flush()
      continue
    }
    current.push(line.trimEnd())
  }
  flush()
  return blocks
}

/** Index pairs of a longest common subsequence, in order. */
function matchBlocks(a: readonly string[], b: readonly string[]): [number, number][] {
  const rows = a.length + 1
  const cols = b.length + 1
  const table = new Uint32Array(rows * cols)
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i * cols + j] =
        a[i] === b[j]
          ? table[(i + 1) * cols + j + 1] + 1
          : Math.max(table[(i + 1) * cols + j], table[i * cols + j + 1])
    }
  }
  const pairs: [number, number][] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      pairs.push([i, j])
      i += 1
      j += 1
    } else if (table[(i + 1) * cols + j] >= table[i * cols + j + 1]) {
      i += 1
    } else {
      j += 1
    }
  }
  return pairs
}

function same(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((block, index) => block === right[index])
}

function startsWith(blocks: readonly string[], prefix: readonly string[]): boolean {
  return same(blocks.slice(0, prefix.length), prefix)
}

function endsWith(blocks: readonly string[], suffix: readonly string[]): boolean {
  return blocks.length >= suffix.length && same(blocks.slice(blocks.length - suffix.length), suffix)
}

/** One hunk both sides touched. Blocks one side only added before or after the base survive. */
function resolveHunk(
  base: readonly string[],
  ours: readonly string[],
  theirs: readonly string[]
): string[] | null {
  if (same(ours, base)) {
    return [...theirs]
  }
  if (same(theirs, base) || same(ours, theirs)) {
    return [...ours]
  }
  if (startsWith(theirs, base)) {
    return [...ours, ...theirs.slice(base.length)]
  }
  if (startsWith(ours, base)) {
    return [...theirs, ...ours.slice(base.length)]
  }
  if (endsWith(theirs, base)) {
    return [...theirs.slice(0, theirs.length - base.length), ...ours]
  }
  if (endsWith(ours, base)) {
    return [...ours.slice(0, ours.length - base.length), ...theirs]
  }
  return null
}

// Beyond this the quadratic table costs too much; the caller falls back to the conflict banner.
const MAX_BLOCKS = 4000

export type BlockMergeResult = { ok: true; markdown: string } | { ok: false }

export function mergeMarkdownBlocks(base: string, ours: string, theirs: string): BlockMergeResult {
  if (ours === theirs || theirs === base) {
    return { ok: true, markdown: ours }
  }
  if (ours === base) {
    return { ok: true, markdown: theirs }
  }
  const [b, o, t] = [base, ours, theirs].map(splitMarkdownBlocks)
  if (Math.max(b.length, o.length, t.length) > MAX_BLOCKS) {
    return { ok: false }
  }
  const toOurs = new Map(matchBlocks(b, o))
  const toTheirs = new Map(matchBlocks(b, t))
  // Base blocks both sides kept, in order; everything between two of them is one hunk.
  const anchors: [number, number, number][] = []
  for (let i = 0; i < b.length; i += 1) {
    const oi = toOurs.get(i)
    const ti = toTheirs.get(i)
    const last = anchors.at(-1)
    if (oi !== undefined && ti !== undefined && (!last || (oi > last[1] && ti > last[2]))) {
      anchors.push([i, oi, ti])
    }
  }
  anchors.push([b.length, o.length, t.length])
  const merged: string[] = []
  let [bi, oi, ti] = [0, 0, 0]
  for (const [bEnd, oEnd, tEnd] of anchors) {
    const hunk = resolveHunk(b.slice(bi, bEnd), o.slice(oi, oEnd), t.slice(ti, tEnd))
    if (!hunk) {
      return { ok: false }
    }
    merged.push(...hunk)
    if (bEnd < b.length) {
      merged.push(b[bEnd])
    }
    ;[bi, oi, ti] = [bEnd + 1, oEnd + 1, tEnd + 1]
  }
  return { ok: true, markdown: merged.length > 0 ? `${merged.join('\n\n')}\n` : '' }
}
