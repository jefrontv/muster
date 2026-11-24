// The open project's pages in the right sidebar. Pages open in the project's Pages tab.
import { Maximize2 } from 'lucide-react'
import type React from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { lastPageIn, rememberPagesLocation } from './project-pages-location'
import { useAgentChangedPages } from './project-pages-seen'
import { buildProjectPagesTabId } from './project-pages-tab'
import { ProjectPagesSidebar } from './ProjectPagesSidebar'
import { useProjectPagesScopes } from './use-project-pages-scopes'
import { useProjectPagesTree } from './use-project-pages-tree'

export default function ProjectPagesRightSidebarPanel(): React.JSX.Element {
  const openPagesPage = useAppStore((s) => s.openPagesPage)
  const openProjectPagesTab = useAppStore((s) => s.openProjectPagesTab)
  const worktreeId = useAppStore((s) => s.activeWorktreeId)
  const tabPageId = useAppStore((s) =>
    s.activeWorktreeId
      ? s.openFiles.find((f) => f.id === buildProjectPagesTabId(s.activeWorktreeId!))?.projectPages
          ?.pageId
      : undefined
  )
  const { options, activeKey } = useProjectPagesScopes()
  const { pages, loaded } = useProjectPagesTree(activeKey)
  const changedIds = useAgentChangedPages(activeKey, pages, loaded)
  const projectName = options.find((option) => option.key === activeKey)?.label

  if (!activeKey) {
    return (
      <p className="p-4 text-xs text-muted-foreground">
        {translate('auto.components.projectPages.noProject', 'Open a project to see its pages.')}
      </p>
    )
  }

  const openFull = (pageId: string | null): void => {
    rememberPagesLocation(activeKey, pageId)
    openPagesPage()
  }
  // The full view when Settings says so, or with no worktree to hold a tab (e.g. a site with no checkout).
  const open = (pageId: string | null): void => {
    if (worktreeId && useAppStore.getState().settings?.projectPagesOpenIn !== 'page') {
      if (useAppStore.getState().activeView === 'pages') {
        useAppStore.getState().closePagesPage()
      }
      openProjectPagesTab(worktreeId, activeKey, pageId)
    } else {
      openFull(pageId)
    }
  }
  const report = (result: { ok: boolean; message?: string }): void => {
    if (!result.ok) {
      toast.error(result.message)
    }
  }
  const openLabel = translate('auto.components.projectPages.openFull', 'Open in Pages')

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 px-3 pt-3">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{projectName}</span>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground"
          aria-label={openLabel}
          title={openLabel}
          onClick={() => openFull(lastPageIn(activeKey) ?? null)}
        >
          <Maximize2 className="size-3.5" />
        </Button>
      </div>
      <ProjectPagesSidebar
        className="flex-1"
        pages={pages}
        loaded={loaded}
        changedIds={changedIds}
        selectedId={tabPageId ?? lastPageIn(activeKey) ?? null}
        onSelect={open}
        onCreate={(parentId, folder) =>
          void window.api.projectPages.create(activeKey, { parentId, folder }).then((result) => {
            if (result.ok) {
              open(result.value.meta.id)
            } else {
              report(result)
            }
          })
        }
        onTrash={(pageId) => void window.api.projectPages.archive(activeKey, pageId).then(report)}
        onRestore={(pageId) => void window.api.projectPages.restore(activeKey, pageId).then(report)}
        onMove={(pageId, move) =>
          void window.api.projectPages.move(activeKey, pageId, move).then(report)
        }
      />
    </div>
  )
}
