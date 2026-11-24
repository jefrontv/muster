// Agent pages tools, answered in the GUI process. Transport-agnostic: the site bridge calls it
// today and the chat connector can serve the same ops later.
import {
  isCrossProjectPagesAllowed,
  projectPagesAgentAccess
} from '../../shared/agent-capabilities'
import { pagesScopeKeyForRepo } from '../../shared/project-pages-space-key'
import { childrenOf } from '../../shared/project-pages-tree'
import type { ProjectPageAuthor, ProjectPageMeta } from '../../shared/project-pages-types'
import type { GlobalSettings } from '../../shared/types'
import type { ProjectPagesDatabases } from './project-pages-database-store'
import {
  isProjectPagesDatabaseOp,
  PROJECT_PAGES_DATABASE_OPS,
  runProjectPagesDatabaseOp
} from './project-pages-database-tool-ops'
import {
  isProjectPagesLinkOp,
  pageConnections,
  PROJECT_PAGES_LINK_OPS,
  runProjectPagesLinkOp
} from './project-pages-link-tool-ops'
import { appendMarkdown, readSection, replaceAnchor } from './project-pages-markdown-ops'
import type { ProjectPagesSearchIndex } from './project-pages-search-index'
import { ProjectPagesError, type ProjectPagesStore } from './project-pages-store'
import {
  callerRepo,
  pagePath,
  resolvePageRef,
  resolveTargetRepo,
  type PagesToolRepo,
  type ProjectPagesToolSource
} from './project-pages-tool-target'
import { resolveWikiLinks } from './project-pages-wiki-links'

export const PROJECT_PAGES_TOOL_OPS = [
  'list',
  'search',
  'read',
  'create',
  'update',
  'edit',
  'append',
  'move',
  'archive',
  ...PROJECT_PAGES_DATABASE_OPS,
  ...PROJECT_PAGES_LINK_OPS
] as const
export type ProjectPagesToolOp = (typeof PROJECT_PAGES_TOOL_OPS)[number]
const READ_OPS: ReadonlySet<ProjectPagesToolOp> = new Set([
  'list',
  'search',
  'read',
  'query_database',
  'related',
  'tags'
])

export function isProjectPagesToolOp(value: unknown): value is ProjectPagesToolOp {
  return PROJECT_PAGES_TOOL_OPS.includes(value as ProjectPagesToolOp)
}

export type ProjectPagesToolDeps = {
  store: ProjectPagesStore
  search: ProjectPagesSearchIndex
  repos: () => readonly PagesToolRepo[]
  settings: () => GlobalSettings | null | undefined
  databases?: ProjectPagesDatabases
}

type Args = Record<string, unknown>

function text(args: Args, key: string, required = false): string {
  const value = args[key]
  if (value === undefined || value === null || value === '') {
    if (required) {
      throw new ProjectPagesError('invalid', `${key} is required.`)
    }
    return ''
  }
  if (typeof value !== 'string') {
    throw new ProjectPagesError('invalid', `${key} must be a string.`)
  }
  return value
}

function count(args: Args, key: string): number | undefined {
  const value = args[key]
  if (value === undefined || value === null) {
    return undefined
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new ProjectPagesError('invalid', `${key} must be a whole number.`)
  }
  return value
}

function editor(author: ProjectPageAuthor): string {
  return author.kind === 'user' ? 'user' : author.agent
}

function row(pages: readonly ProjectPageMeta[], page: ProjectPageMeta): Record<string, unknown> {
  return {
    id: page.id,
    path: pagePath(pages, page.id),
    revision: page.revision,
    edited_by: editor(page.editedBy),
    updated_at: new Date(page.updatedAt).toISOString()
  }
}

export async function runProjectPagesToolOp(
  deps: ProjectPagesToolDeps,
  op: ProjectPagesToolOp,
  args: Args,
  source: ProjectPagesToolSource
): Promise<unknown> {
  const settings = deps.settings()
  const access = projectPagesAgentAccess(settings)
  if (access === 'off' || (access === 'read' && !READ_OPS.has(op))) {
    throw new ProjectPagesError(
      'forbidden',
      access === 'off'
        ? 'Pages are off for agents in Muster settings.'
        : 'Agents may only read pages. The user can allow writes in Agent Capabilities.'
    )
  }
  const repos = deps.repos()
  const repo = resolveTargetRepo({
    repos,
    selector: text(args, 'project'),
    caller: callerRepo(repos, source),
    crossProjectAllowed: isCrossProjectPagesAllowed(settings)
  })
  const scopeKey = pagesScopeKeyForRepo(repo.id)
  const author: ProjectPageAuthor = {
    kind: 'agent',
    agent: source.agent,
    worktreeId: source.worktreeId,
    terminalHandle: source.terminalHandle
  }
  const { store } = deps
  const pages = (): ProjectPageMeta[] => store.listPages(scopeKey).pages
  const page = (): ProjectPageMeta => resolvePageRef(pages(), text(args, 'page', true))
  const project = { id: repo.id, name: repo.displayName }
  const unlinked = new Set<string>()
  // Markdown from the agent with [[Title]] links resolved; misses are reported back.
  const md = (key: string, required = false): string => {
    const resolved = resolveWikiLinks(text(args, key, required), pages())
    resolved.unresolved.forEach((ref) => unlinked.add(ref))
    return resolved.markdown
  }
  const written = (meta: ProjectPageMeta): Record<string, unknown> => ({
    project,
    page: row(pages(), meta),
    ...(unlinked.size > 0 ? { unresolved_links: [...unlinked] } : {})
  })
  if (isProjectPagesLinkOp(op)) {
    return runProjectPagesLinkOp(op, {
      snapshot: deps.search.snapshot(scopeKey),
      project,
      pageId: () => page().id,
      pagePath: (id) => pagePath(pages(), id)
    })
  }

  if (isProjectPagesDatabaseOp(op)) {
    return runProjectPagesDatabaseOp(op, {
      databases: deps.databases,
      scopeKey,
      author,
      project,
      args,
      pageRef: (key) => resolvePageRef(pages(), text(args, key, true))
    })
  }
  switch (op) {
    case 'list': {
      const all = pages().filter((p) => p.archivedAt === null)
      const parentRef = text(args, 'parent')
      const depth = count(args, 'depth') ?? Number.POSITIVE_INFINITY
      const listed: ProjectPageMeta[] = []
      const walk = (parentId: string | null, level: number): void => {
        for (const child of childrenOf(all, parentId)) {
          listed.push(child)
          if (level + 1 < depth) {
            walk(child.id, level + 1)
          }
        }
      }
      walk(parentRef ? resolvePageRef(all, parentRef).id : null, 0)
      return { project, count: listed.length, pages: listed.map((p) => row(all, p)) }
    }
    case 'search': {
      const all = pages()
      const hits = deps.search
        .search(scopeKey, text(args, 'query', true))
        .map((hit) => ({ ...row(all, hit.page), snippet: hit.snippet }))
      return { project, count: hits.length, results: hits }
    }
    case 'read': {
      const doc = store.readPage(scopeKey, page().id)
      const section = text(args, 'section')
      const body = section ? readSection(doc.markdown, section) : doc.markdown
      const max = count(args, 'max_chars') ?? 50_000
      return {
        project,
        page: row(pages(), doc.meta),
        title: doc.meta.title,
        markdown: body.slice(0, max),
        truncated: body.length > max,
        linked_from: deps.search
          .backlinks(scopeKey, doc.meta.id)
          .map((p) => ({ id: p.id, path: pagePath(pages(), p.id) })),
        ...pageConnections(deps.search, scopeKey, doc.meta.id, pages())
      }
    }
    case 'create': {
      const title = text(args, 'title', true)
      const parentRef = text(args, 'parent')
      const parentId = parentRef ? resolvePageRef(pages(), parentRef).id : null
      const existing = childrenOf(
        pages().filter((p) => p.archivedAt === null),
        parentId
      ).find((p) => p.title.toLowerCase() === title.trim().toLowerCase())
      if (existing && args.allow_duplicate !== true) {
        return { created: false, ...written(existing) }
      }
      const input = { parentId, title, markdown: md('markdown'), folder: args.folder === true }
      const doc = store.createPage(scopeKey, input, author)
      return { created: true, ...written(doc.meta) }
    }
    case 'update': {
      const target = page()
      const baseRevision = count(args, 'base_revision')
      if (baseRevision === undefined) {
        throw new ProjectPagesError('invalid', 'base_revision is required; read_page reports it.')
      }
      const title = args.title === undefined ? undefined : text(args, 'title')
      const markdown = args.markdown === undefined ? undefined : md('markdown')
      try {
        return written(
          store.updatePage(scopeKey, target.id, { baseRevision, title, markdown }, author).meta
        )
      } catch (error) {
        if (error instanceof ProjectPagesError && error.code === 'conflict') {
          throw new ProjectPagesError(
            'conflict',
            `${error.message} Re-read the page, or use edit_page or append_to_page, which do not need a revision.`,
            error.revision
          )
        }
        throw error
      }
    }
    case 'edit':
    case 'append': {
      const target = page()
      const current = store.readPage(scopeKey, target.id)
      const markdown =
        op === 'edit'
          ? replaceAnchor(current.markdown, text(args, 'old_text', true), md('new_text'))
          : appendMarkdown(
              current.markdown,
              md('markdown', true),
              text(args, 'under_heading') || undefined
            )
      return written(
        store.updatePage(
          scopeKey,
          target.id,
          { baseRevision: current.meta.revision, markdown },
          author
        ).meta
      )
    }
    case 'move': {
      const target = page()
      const parentRef = text(args, 'parent')
      const parentId = parentRef ? resolvePageRef(pages(), parentRef).id : null
      const index = count(args, 'index') ?? Number.MAX_SAFE_INTEGER
      store.movePage(scopeKey, target.id, { parentId, index }, author)
      return written(store.readPage(scopeKey, target.id).meta)
    }
    case 'archive': {
      const target = page()
      store.archivePage(scopeKey, target.id, author)
      return { project, archived: target.id, note: 'Only the user can restore it, from Trash.' }
    }
  }
}
