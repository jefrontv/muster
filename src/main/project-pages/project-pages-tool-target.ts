// Which project and page an agent's pages tool call means, and whether it may reach them.
import { normalizeRuntimePathForComparison } from '../../shared/cross-platform-path'
import { ancestorsOf, childrenOf } from '../../shared/project-pages-tree'
import type { ProjectPageAuthor, ProjectPageMeta } from '../../shared/project-pages-types'
import { getRepoIdFromWorktreeId } from '../../shared/worktree-id'
import { ProjectPagesError } from './project-pages-store'

export type PagesToolRepo = { id: string; displayName: string; path: string }

export type ProjectPagesToolSource = {
  cwd: string
  agent: string
  worktreeId: string | null
  terminalHandle: string | null
}

function containsPath(parent: string, child: string): boolean {
  const root = normalizeRuntimePathForComparison(parent)
  const path = normalizeRuntimePathForComparison(child)
  return path === root || path.startsWith(`${root}/`)
}

/** The project the agent runs in: its Muster worktree first, else the folder holding its cwd. */
export function callerRepo(
  repos: readonly PagesToolRepo[],
  source: ProjectPagesToolSource
): PagesToolRepo | null {
  if (source.worktreeId) {
    const repoId = getRepoIdFromWorktreeId(source.worktreeId)
    const owner = repos.find((repo) => repo.id === repoId)
    if (owner) {
      return owner
    }
  }
  // Longest path first, so a nested project wins over its parent folder.
  return (
    repos
      .filter((repo) => containsPath(repo.path, source.cwd))
      .sort((left, right) => right.path.length - left.path.length)[0] ?? null
  )
}

function findRepo(repos: readonly PagesToolRepo[], selector: string): PagesToolRepo {
  const byId = repos.find((repo) => repo.id === selector)
  if (byId) {
    return byId
  }
  const path = normalizeRuntimePathForComparison(selector)
  const byPath = repos.find((repo) => normalizeRuntimePathForComparison(repo.path) === path)
  if (byPath) {
    return byPath
  }
  const byName = repos.filter((repo) => repo.displayName.toLowerCase() === selector.toLowerCase())
  if (byName.length === 1) {
    return byName[0]
  }
  throw new ProjectPagesError(
    'not_found',
    byName.length > 1
      ? `More than one project is named "${selector}". Pass its id.`
      : `No project matches "${selector}". Call list_projects to see them.`
  )
}

export function resolveTargetRepo(args: {
  repos: readonly PagesToolRepo[]
  selector: string
  caller: PagesToolRepo | null
  crossProjectAllowed: boolean
}): PagesToolRepo {
  const { caller, selector } = args
  if (!selector) {
    if (!caller) {
      throw new ProjectPagesError(
        'invalid',
        'No project contains the working directory. Pass `project`.'
      )
    }
    return caller
  }
  const target = findRepo(args.repos, selector)
  if (target.id !== caller?.id && !args.crossProjectAllowed) {
    throw new ProjectPagesError(
      'forbidden',
      `Pages of "${target.displayName}" are outside this agent's project. The user can allow other projects' pages in Muster's Agent Capabilities settings.`
    )
  }
  return target
}

export function pagePath(pages: readonly ProjectPageMeta[], pageId: string): string {
  return ancestorsOf([...pages], pageId)
    .map((page) => page.title || 'Untitled')
    .join('/')
}

/** A live page by id or by title path such as `Launch/Checklist`. */
export function resolvePageRef(pages: readonly ProjectPageMeta[], ref: string): ProjectPageMeta {
  const live = pages.filter((page) => page.archivedAt === null)
  const byId = live.find((page) => page.id === ref)
  if (byId) {
    return byId
  }
  let parentId: string | null = null
  let found: ProjectPageMeta | null = null
  for (const segment of ref.split('/').map((part) => part.trim().toLowerCase())) {
    const matches = childrenOf(live, parentId).filter(
      (page) => (page.title || 'Untitled').toLowerCase() === segment
    )
    if (matches.length !== 1) {
      throw new ProjectPagesError(
        matches.length > 1 ? 'invalid' : 'not_found',
        matches.length > 1
          ? `More than one page matches "${ref}". Use an id: ${matches.map((p) => p.id).join(', ')}.`
          : `No page "${ref}". Call list_pages to see them.`
      )
    }
    const [match] = matches
    found = match
    parentId = match.id
  }
  if (!found) {
    throw new ProjectPagesError('invalid', 'page is required.')
  }
  return found
}

function editor(author: ProjectPageAuthor): string {
  return author.kind === 'user' ? 'user' : author.agent
}

/** The page row agents get back from every pages tool. */
export function pageRow(
  pages: readonly ProjectPageMeta[],
  page: ProjectPageMeta
): Record<string, unknown> {
  return {
    id: page.id,
    path: pagePath(pages, page.id),
    revision: page.revision,
    edited_by: editor(page.editedBy),
    updated_at: new Date(page.updatedAt).toISOString()
  }
}

/** Pages under parentId, depth-first, down to depth levels. */
export function pagesBelow(
  pages: ProjectPageMeta[],
  parentId: string | null,
  depth: number
): ProjectPageMeta[] {
  const listed: ProjectPageMeta[] = []
  const walk = (id: string | null, level: number): void => {
    for (const child of childrenOf(pages, id)) {
      listed.push(child)
      if (level + 1 < depth) {
        walk(child.id, level + 1)
      }
    }
  }
  walk(parentId, 0)
  return listed
}
