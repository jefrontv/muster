// Mermaid flowchart text to plain nodes, edges, and subgraphs, so Pages can turn it into an
// editable diagram. Styling lines (classDef, style, click, linkStyle) are skipped.

export type MermaidDirection = 'TB' | 'BT' | 'LR' | 'RL'
export type MermaidShape =
  | 'rect'
  | 'rounded'
  | 'stadium'
  | 'subroutine'
  | 'cylinder'
  | 'circle'
  | 'flag'
  | 'rhombus'
  | 'hexagon'
  | 'parallelogram'
  | 'trapezoid'
export type MermaidNode = { id: string; label: string; shape: MermaidShape; group?: string }
export type MermaidEdge = {
  from: string
  to: string
  label?: string
  dashed: boolean
  thick: boolean
  start: boolean
  end: 'arrow' | 'circle' | 'cross' | 'none'
}
export type MermaidGroup = { id: string; label: string; parent?: string }
export type MermaidFlowchart = {
  direction: MermaidDirection
  nodes: MermaidNode[]
  edges: MermaidEdge[]
  groups: MermaidGroup[]
}

// Longest openers first so "([" wins over "(".
const SHAPES: [string, string, MermaidShape][] = [
  ['([', '])', 'stadium'],
  ['[[', ']]', 'subroutine'],
  ['[(', ')]', 'cylinder'],
  ['((', '))', 'circle'],
  ['{{', '}}', 'hexagon'],
  ['[/', '\\]', 'trapezoid'],
  ['[/', '/]', 'parallelogram'],
  ['[\\', '\\]', 'parallelogram'],
  ['[', ']', 'rect'],
  ['(', ')', 'rounded'],
  ['{', '}', 'rhombus'],
  ['>', ']', 'flag']
]
const ID = /^[A-Za-z0-9_][\w.-]*/
const TEXT_EDGE = /^(<?)(--|==|-\.)\s+(.+?)\s+(-{2,}>|-{3,}|={2,}>|={3,}|\.-+>|\.-+)/
const EDGE = /^(<?)(-{2,}>|-{3,}|={2,}>|={3,}|-\.+->|-\.+-|--[ox]|==[ox])/

const unquote = (text: string): string =>
  text
    .trim()
    .replace(/^"(.*)"$/s, '$1')
    .replace(/<br\s*\/?>/gi, '\n')

class Scanner {
  constructor(
    public text: string,
    public at = 0
  ) {}
  rest(): string {
    return this.text.slice(this.at)
  }
  skip(): void {
    while (this.at < this.text.length && /\s/.test(this.text[this.at])) {
      this.at += 1
    }
  }
  take(re: RegExp): RegExpExecArray | null {
    this.skip()
    const m = re.exec(this.rest())
    if (m) {
      this.at += m[0].length
    }
    return m
  }
}

function nodeRef(s: Scanner): { id: string; label?: string; shape?: MermaidShape } | null {
  const id = s.take(ID)
  if (!id) {
    return null
  }
  const rest = s.rest()
  for (const [open, close, shape] of SHAPES) {
    if (!rest.startsWith(open)) {
      continue
    }
    const body = rest.slice(open.length)
    const quoted = body.trimStart().startsWith('"')
    const closeAt = quoted
      ? body.indexOf(close, body.indexOf('"', body.indexOf('"') + 1))
      : body.indexOf(close)
    if (closeAt < 0) {
      continue
    }
    s.at += open.length + closeAt + close.length
    return { id: id[0], label: unquote(body.slice(0, closeAt)), shape }
  }
  return { id: id[0] }
}

function edgeOp(s: Scanner): Omit<MermaidEdge, 'from' | 'to'> | null {
  const text = s.take(TEXT_EDGE)
  const op = text ?? s.take(EDGE)
  if (!op) {
    return null
  }
  const body = text ? text[2] + text[4] : op[2]
  let label = text ? unquote(text[3]) : undefined
  const piped = s.take(/^\|([^|]*)\|/)
  if (piped) {
    label = unquote(piped[1])
  }
  const last = body.at(-1)
  return {
    label: label || undefined,
    dashed: body.includes('.'),
    thick: body.includes('='),
    start: op[1] === '<',
    end: last === '>' ? 'arrow' : last === 'o' ? 'circle' : last === 'x' ? 'cross' : 'none'
  }
}

const SKIP = /^(classDef|class|style|click|linkStyle|direction)\b/

/** Parses a Mermaid `graph` or `flowchart`; throws on other diagram types. */
export function parseMermaidFlowchart(source: string): MermaidFlowchart {
  const lines = source
    .replace(/%%.*$/gm, '')
    .split(/\n|;/)
    .map((line) => line.trim())
    .filter(Boolean)
  const header = /^(?:graph|flowchart)\b\s*(TD|TB|BT|LR|RL)?/i.exec(lines[0] ?? '')
  if (!header) {
    throw new Error('Only Mermaid flowcharts (graph or flowchart) can become diagrams.')
  }
  const dir = (header[1] ?? 'TB').toUpperCase()
  const chart: MermaidFlowchart = {
    direction: (dir === 'TD' ? 'TB' : dir) as MermaidDirection,
    nodes: [],
    edges: [],
    groups: []
  }
  const nodes = new Map<string, MermaidNode>()
  const stack: string[] = []
  const touch = (ref: { id: string; label?: string; shape?: MermaidShape }): void => {
    const known = nodes.get(ref.id)
    if (known) {
      known.label = ref.label ?? known.label
      known.shape = ref.shape ?? known.shape
      // Mermaid moves a node into the latest subgraph that mentions it, unless it already sits deeper.
      const inner = stack.at(-1)
      if (inner && !nestedIn(chart, known.group, inner)) {
        known.group = inner
      }
      return
    }
    const node: MermaidNode = { id: ref.id, label: ref.label ?? ref.id, shape: ref.shape ?? 'rect' }
    if (stack.length) {
      node.group = stack.at(-1)
    }
    nodes.set(ref.id, node)
    chart.nodes.push(node)
  }
  for (const line of [lines[0].slice(header[0].length), ...lines.slice(1)]) {
    if (!line || SKIP.test(line)) {
      continue
    }
    const sub = /^subgraph\s+(.+)$/.exec(line)
    if (sub) {
      const named = /^([\w.-]+)\s*\[(.*)\]$/.exec(sub[1].trim())
      const id = named ? named[1] : `group${chart.groups.length + 1}`
      chart.groups.push({ id, label: unquote(named ? named[2] : sub[1]), parent: stack.at(-1) })
      stack.push(id)
      continue
    }
    if (line === 'end') {
      stack.pop()
      continue
    }
    parseStatement(new Scanner(line), touch, chart.edges)
  }
  return chart
}

function nestedIn(chart: MermaidFlowchart, group: string | undefined, ancestor: string): boolean {
  for (let id = group; id; id = chart.groups.find((g) => g.id === id)?.parent) {
    if (id === ancestor) {
      return true
    }
  }
  return false
}

function refList(s: Scanner, touch: (ref: { id: string }) => void): string[] {
  const ids: string[] = []
  do {
    const ref = nodeRef(s)
    if (!ref) {
      break
    }
    touch(ref)
    ids.push(ref.id)
  } while (s.take(/^&/))
  return ids
}

function parseStatement(
  s: Scanner,
  touch: (ref: { id: string }) => void,
  edges: MermaidEdge[]
): void {
  let from = refList(s, touch)
  for (let op = edgeOp(s); op && from.length; op = edgeOp(s)) {
    const to = refList(s, touch)
    for (const a of from) {
      for (const b of to) {
        edges.push({ from: a, to: b, ...op })
      }
    }
    from = to
  }
}
