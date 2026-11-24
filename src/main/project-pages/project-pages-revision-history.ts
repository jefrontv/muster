// Bodies of earlier revisions. history/<page>/<n>.md holds the body revision n had when a later
// save replaced it; title-only saves write nothing, so a revision's body is the next kept one.
import { PROJECT_PAGE_LIMITS } from '../../shared/project-pages-types'
import type { createProjectPagesFiles } from './project-pages-files'

type Files = ReturnType<typeof createProjectPagesFiles>

export function bodyAtRevision(
  files: Files,
  dir: string,
  pageId: string,
  revision: number,
  current: { revision: number; markdown: string }
): string | null {
  if (revision > current.revision || revision < 1) {
    return null
  }
  const kept = files.listHistory(dir, pageId).map((entry) => entry.revision)
  const pruned = kept.length >= PROJECT_PAGE_LIMITS.historyPerPage
  if (pruned && revision < Math.min(...kept)) {
    return null
  }
  const next = kept.filter((n) => n >= revision && n < current.revision).sort((a, b) => a - b)[0]
  return next === undefined ? current.markdown : files.readHistory(dir, pageId, next)
}
