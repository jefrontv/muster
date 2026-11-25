// The diagram tools of the pages catalog; site-mcp-pages-tools.ts passes in its tool factory.
import type { ProjectPagesToolOp } from '../../project-pages/project-pages-tool-ops'
import type { SiteMcpTool } from './site-mcp-context'

type PagesToolFactory = (
  name: string,
  op: ProjectPagesToolOp,
  description: string,
  properties: Record<string, unknown>,
  required?: string[]
) => SiteMcpTool

const STRINGS = { type: 'array', items: { type: 'string' } }
const ROWS = (description: string) => ({ type: 'array', items: { type: 'object' }, description })
const DIAGRAM_EDIT = {
  add: ROWS('[{label, shape?, id?, in?, x?, y?, color?, link?}]; no x/y: placed by its links.'),
  connect: ROWS('[{from, to, label?, dashed?, arrow?: end|both|none}]'),
  update: ROWS('[{target, label?, shape?, color?, link?, dashed?, arrow?}]'),
  move: ROWS('[{target, x?, y?, dx?, dy?, width?, height?, in?}]'),
  remove: STRINGS,
  layout: { type: 'string', description: 'down|right|tree|organic|circle' },
  mermaid: { type: 'string', description: 'Mermaid flowchart to add.' }
}

export function sitePagesDiagramTools(
  pagesTool: PagesToolFactory,
  pageProperty: object
): SiteMcpTool[] {
  return [
    pagesTool(
      'diagram_shapes',
      'diagram_shapes',
      'Shape names, colours and layouts for diagrams.',
      {}
    ),
    pagesTool(
      'read_diagram',
      'read_diagram',
      'A diagram as shape rows and connector rows.',
      { page: pageProperty, detail: { type: 'boolean', description: 'Add geometry.' } },
      ['page']
    ),
    pagesTool(
      'edit_diagram',
      'edit_diagram',
      'Edit a diagram in one call: remove, add, connect, update, move, layout. Shapes go by id or label, even ones added in the same call.',
      { page: pageProperty, ...DIAGRAM_EDIT },
      ['page']
    ),
    pagesTool(
      'render_diagram',
      'render_diagram',
      'PNG of a diagram, to check for overlaps before finishing.',
      { page: pageProperty, scale: { type: 'number', description: '1 or 2' } },
      ['page']
    )
  ]
}
