// A folder page's contents: its child pages as cards, plus buttons to add more.
import { FolderPlus, Plus, Workflow } from 'lucide-react'
import type React from 'react'
import { childrenOf } from '../../../../shared/project-pages-tree'
import type { ProjectPageMeta } from '../../../../shared/project-pages-types'
import { ROW_HOVER } from '@/components/ui/hover-fill-classes'
import { translate } from '@/i18n/i18n'
import { pageTitle } from './project-pages-tree-model'
import { ProjectPageKindIcon } from './ProjectPageKindIcon'

type Props = {
  folderId: string
  pages: ProjectPageMeta[]
  onOpenPage: (pageId: string) => void
  onCreate: (kind: 'page' | 'folder' | 'diagram') => void
}

const CARD =
  'flex min-h-20 flex-col gap-2 rounded-lg border border-border p-3 text-left text-sm transition-colors'

export function ProjectPagesFolderView({
  folderId,
  pages,
  onOpenPage,
  onCreate
}: Props): React.JSX.Element {
  const live = pages.filter((page) => page.archivedAt === null)
  const children = childrenOf(live, folderId)
  const counts = new Map<string, number>()
  for (const page of live) {
    if (page.parentId) {
      counts.set(page.parentId, (counts.get(page.parentId) ?? 0) + 1)
    }
  }
  return (
    <div className="mx-8 mt-4 mb-2 grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-2">
      {children.map((page) => {
        const inside = counts.get(page.id) ?? 0
        return (
          <button
            key={page.id}
            type="button"
            className={`${CARD} bg-card ${ROW_HOVER}`}
            onClick={() => onOpenPage(page.id)}
          >
            {page.icon ? (
              <span className="text-base leading-none">{page.icon}</span>
            ) : (
              <ProjectPageKindIcon page={page} className="size-4 text-muted-foreground" />
            )}
            <span className="line-clamp-2 font-medium">{pageTitle(page)}</span>
            <span className="mt-auto text-xs text-muted-foreground">
              {inside > 0
                ? translate('auto.components.projectPages.folderCount', '{{value0}} inside', {
                    value0: inside
                  })
                : new Date(page.updatedAt).toLocaleDateString(undefined, {
                    day: 'numeric',
                    month: 'short'
                  })}
            </span>
          </button>
        )
      })}
      <div className={`${CARD} justify-center border-dashed text-muted-foreground`}>
        <button
          type="button"
          className="flex items-center gap-1.5 hover:text-foreground"
          onClick={() => onCreate('page')}
        >
          <Plus className="size-3.5" />
          {translate('auto.components.projectPages.newPage', 'New page')}
        </button>
        <button
          type="button"
          className="flex items-center gap-1.5 hover:text-foreground"
          onClick={() => onCreate('diagram')}
        >
          <Workflow className="size-3.5" />
          {translate('auto.components.projectPages.newDiagram', 'New diagram')}
        </button>
        <button
          type="button"
          className="flex items-center gap-1.5 hover:text-foreground"
          onClick={() => onCreate('folder')}
        >
          <FolderPlus className="size-3.5" />
          {translate('auto.components.projectPages.newFolder', 'New folder')}
        </button>
      </div>
    </div>
  )
}
