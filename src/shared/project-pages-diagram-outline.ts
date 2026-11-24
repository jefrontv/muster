// Text outline of a diagram: the page body, so search, backlinks, and agents can read it cheaply.
import type { DiagramCell } from './project-pages-diagram-xml'

const ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'"
}

/** A cell's visible text: HTML labels lose their tags, whitespace collapses. */
export function diagramLabel(cell: Pick<DiagramCell, 'value'>): string {
  return (cell.value ?? '')
    .replace(/<(br|\/div|\/p|\/li)\b[^>]*>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&(nbsp|amp|lt|gt|quot|#39);/g, (m) => ENTITIES[m] ?? m)
    .replace(/\s+/g, ' ')
    .trim()
}

function shapeName(cell: DiagramCell): string {
  const shape = cell.style?.shape ?? cell.style?.baseStyleNames?.[0]
  if (typeof shape === 'string') {
    return shape
  }
  return cell.style?.rounded ? 'rounded box' : 'box'
}

/** Markdown outline: shapes nested under their containers, then connections with labels. */
export function diagramOutlineText(cells: DiagramCell[]): string {
  const byId = new Map(cells.map((c) => [c.id, c]))
  const children = new Map<string, DiagramCell[]>()
  const edgeLabels = new Map<string, string[]>()
  for (const cell of cells) {
    const parent = cell.parent ? byId.get(cell.parent) : undefined
    if (cell.vertex && parent?.edge) {
      const text = diagramLabel(cell)
      if (text) {
        edgeLabels.set(parent.id, [...(edgeLabels.get(parent.id) ?? []), text])
      }
    } else if (cell.vertex && cell.parent) {
      children.set(cell.parent, [...(children.get(cell.parent) ?? []), cell])
    }
  }
  const name = (id: string | undefined): string => {
    const cell = id ? byId.get(id) : undefined
    return cell ? diagramLabel(cell) || `(${shapeName(cell)})` : '(loose end)'
  }
  const shapes: string[] = []
  const walk = (parentId: string, depth: number): void => {
    for (const cell of children.get(parentId) ?? []) {
      shapes.push(`${'  '.repeat(depth)}- ${name(cell.id)}`)
      walk(cell.id, depth + 1)
    }
  }
  // Layers are the root's children; shapes hang off layers.
  for (const layer of cells.filter((c) => c.parent && !byId.get(c.parent)?.parent && !c.vertex)) {
    walk(layer.id, 0)
  }
  const edges = cells
    .filter((c) => c.edge)
    .map((edge) => {
      const label = [diagramLabel(edge), ...(edgeLabels.get(edge.id) ?? [])]
        .filter(Boolean)
        .join(' ')
      return `- ${name(edge.source)} → ${name(edge.target)}${label ? `: ${label}` : ''}`
    })
  const sections: string[] = []
  if (shapes.length) {
    sections.push(`Shapes:\n${shapes.join('\n')}`)
  }
  if (edges.length) {
    sections.push(`Connections:\n${edges.join('\n')}`)
  }
  return sections.join('\n\n') || 'Empty diagram.'
}
