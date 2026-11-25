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
    'Use the page tools (list_pages, search_pages, grep_pages, read_page, create_page, edit_page, append_to_page, check_page_items, update_page, move_page, archive_page, restore_page) and pass page ids from the outline below. Find facts with search_pages before reading whole pages; grep_pages finds exact text with line numbers, and read_page from_line/to_line jumps to them. Read one section of a long page. Prefer edit_page, append_to_page or check_page_items over rewriting a whole page. Draw diagrams with create_page (diagram: true), edit_diagram, read_diagram and render_diagram, never raw XML.',
    'A [[Title]] link resolves by itself once that page exists, and the page text keeps [[Title]] on purpose. Never re-save a page to fix links; read_page unresolved_links is the list to trust.'
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
          ...(omitted > 0
            ? [`(${omitted} more pages; list_pages with parent and depth, or compact: true)`]
            : [])
        ].join('\n')
      : 'This project has no pages yet.'
  )
  return parts.join('\n\n')
}
