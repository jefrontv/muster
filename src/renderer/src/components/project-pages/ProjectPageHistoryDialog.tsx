// Earlier versions of a page, with a preview and restore. Restoring saves a new revision.
import type React from 'react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { translate } from '@/i18n/i18n'
import type { ProjectPageMeta, ProjectPageRevision } from '../../../../shared/project-pages-types'

type Props = {
  scopeKey: string
  page: ProjectPageMeta
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ProjectPageHistoryDialog({
  scopeKey,
  page,
  open,
  onOpenChange
}: Props): React.JSX.Element {
  const [revisions, setRevisions] = useState<ProjectPageRevision[]>([])
  const [chosen, setChosen] = useState<number | null>(null)
  const [preview, setPreview] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }
    setChosen(null)
    setPreview(null)
    void window.api.projectPages.history(scopeKey, page.id).then((result) => {
      setRevisions(result.ok ? result.value : [])
    })
  }, [open, scopeKey, page.id])

  const choose = (revision: number): void => {
    setChosen(revision)
    setPreview(null)
    void window.api.projectPages.readRevision(scopeKey, page.id, revision).then((result) => {
      setPreview(result.ok ? result.value : '')
    })
  }

  const restore = async (): Promise<void> => {
    if (preview === null) {
      return
    }
    const result = await window.api.projectPages.update(scopeKey, page.id, {
      baseRevision: page.revision,
      markdown: preview
    })
    if (result.ok) {
      onOpenChange(false)
    } else {
      toast.error(result.message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {translate('auto.components.projectPages.history', 'Page history')}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.projectPages.historyHint',
              'The last 20 versions are kept. Restoring saves the old text as a new version.'
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="flex h-96 min-h-0 gap-3">
          <ul className="scrollbar-sleek w-48 shrink-0 space-y-0.5 overflow-auto">
            {revisions.length === 0 ? (
              <li className="px-2 py-1 text-xs text-muted-foreground">
                {translate('auto.components.projectPages.noHistory', 'No earlier versions yet.')}
              </li>
            ) : null}
            {revisions.map((entry) => (
              <li key={entry.revision}>
                <button
                  type="button"
                  className={`w-full rounded-md px-2 py-1 text-left text-xs hover:bg-accent ${
                    chosen === entry.revision ? 'bg-accent text-accent-foreground' : ''
                  }`}
                  onClick={() => choose(entry.revision)}
                >
                  <span className="font-medium">#{entry.revision}</span>{' '}
                  <span className="text-muted-foreground">
                    {new Date(entry.savedAt).toLocaleString()}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <pre className="scrollbar-sleek min-w-0 flex-1 overflow-auto rounded-md border border-border bg-muted/30 p-3 text-xs whitespace-pre-wrap">
            {preview ?? ''}
          </pre>
        </div>
        <div className="flex justify-end">
          <Button disabled={preview === null} onClick={() => void restore()}>
            {translate('auto.components.projectPages.restoreVersion', 'Restore this version')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
