// Tooltip text for a Trash row: what kind of page it was, what went with it, and when.
import { i18n, translate } from '@/i18n/i18n'
import type { ProjectPageMeta } from '../../../../shared/project-pages-types'

const formatters = new Map<string, Intl.RelativeTimeFormat>()

/** Relative times in the app's language, not the system's. */
function relativeFormat(): Intl.RelativeTimeFormat {
  const language = i18n.language || 'en'
  let formatter = formatters.get(language)
  if (!formatter) {
    try {
      formatter = new Intl.RelativeTimeFormat(language, { numeric: 'auto' })
    } catch {
      formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
    }
    formatters.set(language, formatter)
  }
  return formatter
}

function deletedAgo(archivedAt: number, now: number): string {
  const relative = relativeFormat()
  const minutes = Math.round((archivedAt - now) / 60_000)
  if (Math.abs(minutes) < 60) {
    return relative.format(minutes, 'minute')
  }
  const hours = Math.round(minutes / 60)
  return Math.abs(hours) < 24
    ? relative.format(hours, 'hour')
    : relative.format(Math.round(hours / 24), 'day')
}

/** Pages that went into the Trash along with this one. */
function trashedInside(page: ProjectPageMeta, pages: readonly ProjectPageMeta[]): number {
  const byId = new Map(pages.map((p) => [p.id, p]))
  const isInside = (candidate: ProjectPageMeta): boolean => {
    for (let parent = candidate.parentId; parent; parent = byId.get(parent)?.parentId ?? null) {
      if (parent === page.id) {
        return true
      }
    }
    return false
  }
  return pages.filter((p) => p.archivedAt === page.archivedAt && isInside(p)).length
}

function kindLabel(page: ProjectPageMeta): string {
  if (page.folder) {
    return translate('auto.components.projectPages.trashKind.folder', 'Folder')
  }
  return page.diagram
    ? translate('auto.components.projectPages.trashKind.diagram', 'Diagram')
    : translate('auto.components.projectPages.trashKind.page', 'Page')
}

export function trashRowDetail(
  page: ProjectPageMeta,
  pages: readonly ProjectPageMeta[],
  now = Date.now()
): string {
  const inside = trashedInside(page, pages)
  const parts = [kindLabel(page)]
  if (inside > 0) {
    parts.push(
      inside === 1
        ? translate('auto.components.projectPages.trashInsideOne', '1 page inside')
        : translate('auto.components.projectPages.trashInside', '{{value0}} pages inside', {
            value0: inside
          })
    )
  }
  const archivedAt = page.archivedAt ?? now
  // Intl's "this minute" reads oddly for something just trashed.
  parts.push(
    Math.abs(now - archivedAt) < 60_000
      ? translate('auto.components.projectPages.trashDeletedJustNow', 'Deleted just now')
      : translate('auto.components.projectPages.trashDeleted', 'Deleted {{value0}}', {
          value0: deletedAgo(archivedAt, now)
        })
  )
  return parts.join(' · ')
}
