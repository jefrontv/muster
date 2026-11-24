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
  createdRowProperties,
  isProjectPagesDatabaseOp,
  PROJECT_PAGES_DATABASE_OPS,
  runProjectPagesDatabaseOp
} from './project-pages-database-tool-ops'
import type { ProjectPagesActiveCollab } from './project-pages-activecollab-lookup'
import type { ProjectPagesAttachments } from './project-pages-attachments'
import type { DiagramWorker } from './project-pages-diagram-relay'
import type { ProjectPagesDiagrams } from './project-pages-diagram-store'
import {
  finishDiagramPage,
  isProjectPagesDiagramOp,
  PROJECT_PAGES_DIAGRAM_OPS,
  PROJECT_PAGES_DIAGRAM_READ_OPS,
  runProjectPagesDiagramOp
} from './project-pages-diagram-tool-ops'
import {
  isProjectPagesBlockOp,
  PROJECT_PAGES_BLOCK_OPS,
  runProjectPagesBlockOp
} from './project-pages-block-tool-ops'
import {
  isProjectPagesLinkOp,
  pageConnections,
  PROJECT_PAGES_LINK_OPS,
  runProjectPagesLinkOp
} from './project-pages-link-tool-ops'
import { tickChecklist } from './project-pages-checklist-ops'
import { appendMarkdown, readSection, replaceAnchor } from './project-pages-markdown-ops'
import type { ProjectPagesSearchIndex } from './project-pages-search-index'
import { ProjectPagesError, type ProjectPagesStore } from './project-pages-store'
import { toolCount, toolText, type ToolArgs } from './project-pages-tool-args'
import {
  callerRepo,
  pagePath,
  pageRow as row,
  pagesBelow,
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
  'check',
  'move',
  'archive',
  ...PROJECT_PAGES_DATABASE_OPS,
  ...PROJECT_PAGES_LINK_OPS,
  ...PROJECT_PAGES_BLOCK_OPS,
  ...PROJECT_PAGES_DIAGRAM_OPS
] as const
export type ProjectPagesToolOp = (typeof PROJECT_PAGES_TOOL_OPS)[number]
const READ_OPS: ReadonlySet<ProjectPagesToolOp> = new Set([
  'list',
  'search',
  'read',
  'query_database',
  'related',
  'tags',
  'blocks',
  ...PROJECT_PAGES_DIAGRAM_READ_OPS
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
  attachments?: ProjectPagesAttachments
  activeCollab?: ProjectPagesActiveCollab
  diagrams?: ProjectPagesDiagrams
  diagramWorker?: DiagramWorker
}

export async function runProjectPagesToolOp(
  deps: ProjectPagesToolDeps,
  op: ProjectPagesToolOp,
  args: ToolArgs,
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
    selector: toolText(args, 'project'),
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
  const page = (): ProjectPageMeta => resolvePageRef(pages(), toolText(args, 'page', true))
  const project = { id: repo.id, name: repo.displayName }
  const unlinked = new Set<string>()
  // Markdown from the agent with [[Title]] links resolved; misses are reported back.
  const md = (key: string, required = false): string => {
    const resolved = resolveWikiLinks(toolText(args, key, required), pages())
    resolved.unresolved.forEach((ref) => unlinked.add(ref))
    return resolved.markdown
  }
  const written = (meta: ProjectPageMeta): Record<string, unknown> => ({
    project,
    page: row(pages(), meta),
    ...(unlinked.size > 0 ? { unresolved_links: [...unlinked] } : {})
  })
  if (isProjectPagesBlockOp(op)) {
    return runProjectPagesBlockOp(op, { attachments: deps.attachments, scopeKey, project, args })
  }
  if (isProjectPagesLinkOp(op)) {
    return runProjectPagesLinkOp(op, {
      snapshot: deps.search.snapshot(scopeKey),
      project,
      pageId: () => page().id,
      pagePath: (id) => pagePath(pages(), id)
    })
  }

  const databaseContext = {
    databases: deps.databases,
    scopeKey,
    author,
    project,
    args,
    pageRef: (key: string) => resolvePageRef(pages(), toolText(args, key, true))
  }
  if (isProjectPagesDatabaseOp(op)) {
    return runProjectPagesDatabaseOp(op, databaseContext)
  }
  const diagramContext = {
    ...databaseContext,
    diagrams: deps.diagrams,
    worker: deps.diagramWorker,
    pages,
    row: (meta: ProjectPageMeta) => row(pages(), meta)
  }
  if (isProjectPagesDiagramOp(op)) {
    return runProjectPagesDiagramOp(op, diagramContext)
  }
  switch (op) {
    case 'list': {
      const all = pages().filter((p) => p.archivedAt === null)
      const parentRef = toolText(args, 'parent')
      const parentId = parentRef ? resolvePageRef(all, parentRef).id : null
      const listed = pagesBelow(all, parentId, toolCount(args, 'depth') ?? Number.POSITIVE_INFINITY)
      return { project, count: listed.length, pages: listed.map((p) => row(all, p)) }
    }
    case 'search': {
      const all = pages()
      const hits = deps.search
        .search(scopeKey, toolText(args, 'query', true))
        .map((hit) => ({ ...row(all, hit.page), snippet: hit.snippet }))
      return { project, count: hits.length, results: hits }
    }
    case 'read': {
      const doc = store.readPage(scopeKey, page().id)
      const section = toolText(args, 'section')
      const body = section ? readSection(doc.markdown, section) : doc.markdown
      const max = toolCount(args, 'max_chars') ?? 50_000
      const offset = toolCount(args, 'offset') ?? 0
      const activecollab = await deps.activeCollab?.describe(doc.markdown)
      return {
        project,
        page: row(pages(), doc.meta),
        title: doc.meta.title,
        markdown: body.slice(offset, offset + max),
        truncated: body.length > offset + max,
        linked_from: deps.search
          .backlinks(scopeKey, doc.meta.id)
          .map((p) => ({ id: p.id, path: pagePath(pages(), p.id) })),
        ...pageConnections(deps.search, scopeKey, doc.meta.id, pages()),
        ...(activecollab?.length ? { activecollab } : {})
      }
    }
    case 'create': {
      const title = toolText(args, 'title', true)
      const parentRef = toolText(args, 'parent')
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
      if (args.diagram === true) {
        return { created: true, ...(await finishDiagramPage(diagramContext, doc.meta)) }
      }
      const row = createdRowProperties(databaseContext, doc.meta)
      return { created: true, ...written(doc.meta), ...row }
    }
    case 'update': {
      const target = page()
      const baseRevision = toolCount(args, 'base_revision')
      if (baseRevision === undefined) {
        throw new ProjectPagesError('invalid', 'base_revision is required; read_page reports it.')
      }
      const title = args.title === undefined ? undefined : toolText(args, 'title')
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
    case 'append':
    case 'check': {
      const target = page()
      const current = store.readPage(scopeKey, target.id)
      const ticked = op === 'check' ? tickChecklist(current.markdown, args) : null
      const markdown = ticked
        ? ticked.markdown
        : op === 'edit'
          ? replaceAnchor(current.markdown, toolText(args, 'old_text', true), md('new_text'))
          : appendMarkdown(
              current.markdown,
              md('markdown', true),
              toolText(args, 'under_heading') || undefined
            )
      const meta = store.updatePage(
        scopeKey,
        target.id,
        { baseRevision: current.meta.revision, markdown },
        author
      ).meta
      return ticked
        ? { ...written(meta), checked: ticked.checked, unchecked: ticked.unchecked }
        : written(meta)
    }
    case 'move': {
      const target = page()
      const parentRef = toolText(args, 'parent')
      const parentId = parentRef ? resolvePageRef(pages(), parentRef).id : null
      const index = toolCount(args, 'index') ?? Number.MAX_SAFE_INTEGER
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
