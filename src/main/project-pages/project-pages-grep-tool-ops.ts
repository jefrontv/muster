// The grep_pages op: argument parsing over project-pages-grep.
import type { ProjectPageMeta } from '../../shared/project-pages-types'
import type { ProjectPagesComments } from './project-pages-comments'
import type { ProjectPagesDatabases } from './project-pages-database-store'
import { GREP_LIMITS, grepPages } from './project-pages-grep'
import type { ProjectPagesSearchIndex } from './project-pages-search-index'
import { ProjectPagesError } from './project-pages-store'
import { toolCount, toolText, type ToolArgs } from './project-pages-tool-args'
import { resolvePageRef } from './project-pages-tool-target'

export const PROJECT_PAGES_GREP_OPS = ['grep'] as const
type GrepOp = (typeof PROJECT_PAGES_GREP_OPS)[number]

export function isProjectPagesGrepOp(op: string): op is GrepOp {
  return PROJECT_PAGES_GREP_OPS.includes(op as GrepOp)
}

export async function runProjectPagesGrepOp(ctx: {
  search: ProjectPagesSearchIndex
  databases?: ProjectPagesDatabases
  comments?: ProjectPagesComments
  scopeKey: string
  project: { id: string; name: string }
  args: ToolArgs
  pages: () => ProjectPageMeta[]
}): Promise<unknown> {
  const { args, scopeKey } = ctx
  const query = toolText(args, 'query', true)
  if (!query.trim()) {
    throw new ProjectPagesError('invalid', 'query is required.')
  }
  const folder = toolText(args, 'folder')
  const result = await grepPages(
    {
      snapshot: ctx.search.snapshot(scopeKey),
      database: ctx.databases
        ? (pageId) => {
            try {
              return ctx.databases!.readDatabase(scopeKey, pageId)
            } catch {
              return null
            }
          }
        : undefined,
      comments: ctx.comments ? (pageId) => ctx.comments!.list(scopeKey, pageId) : undefined
    },
    {
      query,
      regex: args.regex === true,
      caseSensitive: args.case_sensitive === true,
      folderId: folder ? resolvePageRef(ctx.pages(), folder).id : null,
      tag: toolText(args, 'tag') || null,
      limit: Math.min(Math.max(toolCount(args, 'limit') ?? 50, 1), GREP_LIMITS.hits),
      context: Math.min(toolCount(args, 'context') ?? 1, GREP_LIMITS.context),
      comments: args.comments === true
    }
  )
  return { project: ctx.project, ...result }
}
