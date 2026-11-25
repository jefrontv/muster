// "Add to Pages" in the plan review header: saves the review as a page and continues it there.
import { FilePlus } from 'lucide-react'
import type React from 'react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import type {
  PlanAnnotationRequest,
  PlanReviewPageRef
} from '../../../../shared/plan-annotation-types'
import { stripTitleHeading } from '../../../../shared/plan-page-heading'
import { pagesScopeKeyForRepo } from '../../../../shared/project-pages-space-key'
import type { ProjectPageMeta } from '../../../../shared/project-pages-types'
import { PAGE_COMMENT_LIMITS } from '../../../../shared/project-pages-comment-types'
import type { DraftNote } from './plan-annotation-notes'
import { matchPlanReviewWorktree } from './plan-review-worktree-match'
import { focusPlanReviewTab } from './use-plan-review-placement'

type FolderChoice = { id: string; path: string }

function folderPaths(pages: readonly ProjectPageMeta[]): FolderChoice[] {
  const byId = new Map(pages.map((p) => [p.id, p]))
  const pathOf = (page: ProjectPageMeta): string => {
    const parent = page.parentId ? byId.get(page.parentId) : undefined
    return parent ? `${pathOf(parent)} / ${page.title}` : page.title
  }
  return pages
    .filter((p) => p.folder && p.archivedAt === null && p.title.trim())
    .map((p) => ({ id: p.id, path: pathOf(p) }))
    .sort((a, b) => a.path.localeCompare(b.path))
}

/** Notes and edits made before the move become page comments and a page revision. */
async function carryDraft(
  page: PlanReviewPageRef,
  notes: readonly DraftNote[],
  editedContent: string | null
): Promise<void> {
  const api = window.api.projectPages
  if (editedContent !== null) {
    const doc = await api.read(page.scopeKey, page.pageId)
    if (doc.ok) {
      const markdown = stripTitleHeading(editedContent, doc.value.meta.title)
      await api.update(page.scopeKey, page.pageId, {
        baseRevision: doc.value.meta.revision,
        markdown
      })
    }
  }
  for (const note of notes) {
    const quote = note.quote.slice(0, PAGE_COMMENT_LIMITS.quote)
    await api.addComment(page.scopeKey, page.pageId, {
      anchor: note.kind === 'global' || !quote.trim() ? null : { quote, prefix: '', suffix: '' },
      body: note.body,
      ...(note.attachments?.length ? { attachments: note.attachments } : {})
    })
  }
}

export function PlanReviewAddToPages({
  request,
  notes,
  editedContent,
  onMoved
}: {
  request: PlanAnnotationRequest
  notes: readonly DraftNote[]
  editedContent: string | null
  onMoved: () => void
}): React.JSX.Element | null {
  const pagesOn = useAppStore((s) => s.settings?.experimentalProjectPages === true)
  const worktreesByRepo = useAppStore((s) => s.worktreesByRepo)
  const target = useMemo(() => {
    const worktrees = Object.values(worktreesByRepo).flat()
    const worktree = worktrees.find((w) => w.id === matchPlanReviewWorktree(request, worktrees))
    return worktree
      ? { worktreeId: worktree.id, scopeKey: pagesScopeKeyForRepo(worktree.repoId) }
      : null
  }, [request, worktreesByRepo])
  const [folders, setFolders] = useState<FolderChoice[]>([])
  const [busy, setBusy] = useState(false)
  if (!pagesOn || !target || request.page) {
    return null
  }
  const loadFolders = (open: boolean): void => {
    if (open) {
      void window.api.projectPages.list(target.scopeKey).then((result) => {
        setFolders(result.ok ? folderPaths(result.value.pages) : [])
      })
    }
  }
  const save = async (folder: string | null): Promise<void> => {
    setBusy(true)
    try {
      const page = await window.api.planAnnotation.saveToPages({
        requestId: request.requestId,
        folder
      })
      if (!page) {
        toast.error(
          translate(
            'auto.components.planAnnotation.addToPages.failed',
            "Couldn't save this plan to Pages."
          )
        )
        return
      }
      await carryDraft(page, notes, editedContent)
      onMoved()
      focusPlanReviewTab(target.worktreeId, { ...request, page, pageIsSource: false })
    } finally {
      setBusy(false)
    }
  }
  return (
    <DropdownMenu onOpenChange={loadFolders}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          disabled={busy}
          className="text-muted-foreground"
        >
          <FilePlus className="size-3.5" />
          {translate('auto.components.planAnnotation.addToPages.button', 'Add to Pages')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 min-w-56 overflow-y-auto">
        <DropdownMenuLabel>
          {translate('auto.components.planAnnotation.addToPages.label', 'Save to folder')}
        </DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => void save(null)}>
          {translate('auto.components.planAnnotation.addToPages.default', 'Plans (default)')}
        </DropdownMenuItem>
        {folders.some((folder) => folder.path !== 'Plans') ? <DropdownMenuSeparator /> : null}
        {folders
          .filter((folder) => folder.path !== 'Plans')
          .map((folder) => (
            <DropdownMenuItem key={folder.id} onSelect={() => void save(folder.id)}>
              <span className="truncate">{folder.path}</span>
            </DropdownMenuItem>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
