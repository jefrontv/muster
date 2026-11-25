// Every pages tool op, and which of them only read.
import { PROJECT_PAGES_BLOCK_OPS } from './project-pages-block-tool-ops'
import {
  PROJECT_PAGES_COMMENT_OPS,
  PROJECT_PAGES_COMMENT_READ_OPS
} from './project-pages-comment-tool-ops'
import { PROJECT_PAGES_DATABASE_OPS } from './project-pages-database-tool-ops'
import {
  PROJECT_PAGES_DIAGRAM_OPS,
  PROJECT_PAGES_DIAGRAM_READ_OPS
} from './project-pages-diagram-tool-ops'
import { PROJECT_PAGES_LINK_OPS } from './project-pages-link-tool-ops'

export const PROJECT_PAGES_TOOL_OPS = [
  'list',
  'search',
  'read',
  'create',
  'update',
  'edit',
  'append',
  'check',
  'move',
  'archive',
  'restore',
  ...PROJECT_PAGES_DATABASE_OPS,
  ...PROJECT_PAGES_LINK_OPS,
  ...PROJECT_PAGES_BLOCK_OPS,
  ...PROJECT_PAGES_DIAGRAM_OPS,
  ...PROJECT_PAGES_COMMENT_OPS
] as const
export type ProjectPagesToolOp = (typeof PROJECT_PAGES_TOOL_OPS)[number]
export const PROJECT_PAGES_READ_OPS: ReadonlySet<ProjectPagesToolOp> = new Set([
  'list',
  'search',
  'read',
  'query_database',
  'related',
  'tags',
  'blocks',
  ...PROJECT_PAGES_DIAGRAM_READ_OPS,
  ...PROJECT_PAGES_COMMENT_READ_OPS
])

export function isProjectPagesToolOp(value: unknown): value is ProjectPagesToolOp {
  return PROJECT_PAGES_TOOL_OPS.includes(value as ProjectPagesToolOp)
}
