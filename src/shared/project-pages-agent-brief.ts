// Text appended to an agent's system prompt so it knows this project's pages without a lookup.
import { childrenOf } from './project-pages-tree'
import type { ProjectPageMeta } from './project-pages-types'

const MAX_OUTLINE_PAGES = 80

export type ProjectPagesBriefInput = {
  projectName: string
  pages: ProjectPageMeta[]
  openPage?: Pick<ProjectPageMeta, 'id' | 'title'> | null
}

function outline(pages: ProjectPageMeta[]): { lines: string[]; omitted: number } {
  const live = pages.filter((page) => page.archivedAt === null)
  const lines: string[] = []
  const walk = (parentId: string | null, depth: number): void => {
    for (const page of childrenOf(live, parentId)) {
      if (lines.length >= MAX_OUTLINE_PAGES) {
        return
      }
      lines.push(`${'  '.repeat(depth)}- ${page.title.trim() || 'Untitled'} (id: ${page.id})`)
      walk(page.id, depth + 1)
    }
  }
  walk(null, 0)
  return { lines, omitted: Math.max(0, live.length - lines.length) }
}

export function buildProjectPagesAgentBrief(input: ProjectPagesBriefInput): string {
  const { lines, omitted } = outline(input.pages)
  const parts = [
    `You are helping with the "${input.projectName}" project's pages in Muster. Pages are markdown notes the team keeps for this project.`,
    'Use the page tools (list_pages, search_pages, read_page, create_page, edit_page, append_to_page, check_page_items, update_page, move_page, archive_page) and pass page ids from the outline below. Find facts with search_pages before reading whole pages, and read one section of a long page. Prefer edit_page, append_to_page or check_page_items over rewriting a whole page.'
  ]
  if (input.openPage) {
    parts.push(
      `The user has "${input.openPage.title.trim() || 'Untitled'}" (id: ${input.openPage.id}) open. "This page" means that one.`
    )
  }
  parts.push(
    lines.length > 0
      ? [
          'Page outline:',
          ...lines,
          ...(omitted > 0 ? [`(${omitted} more pages; use list_pages)`] : [])
        ].join('\n')
      : 'This project has no pages yet.'
  )
  return parts.join('\n\n')
}
