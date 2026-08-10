// Which folders Muster sources sites from — the ocsites "Projects dir 1/2/…" settings rows.
//
// It lives on the Sites page rather than in Settings because this list is the input to exactly one
// screen, and the question it answers ("why don't I see my sites?") is asked while looking at that
// screen. ocsites put it in settings only because its picker had no header to hang an action on.
//
// Order is meaningful: it is the scan order, and the first reachable entry is where a new clone
// lands, which is why the rows move rather than sort.

import { ArrowDown, ArrowUp, FolderPlus, TriangleAlert, X } from 'lucide-react'
import type React from 'react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { SiteRootEntry } from '../../../../shared/site-discovery-types'
import type { SiteResult } from '../../../../shared/site-types'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'

type SiteRootsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The roots in effect. With nothing configured these are the derived ones, shown as such. */
  effectiveRoots: readonly string[]
}

export function SiteRootsDialog({
  open,
  onOpenChange,
  effectiveRoots
}: SiteRootsDialogProps): React.JSX.Element {
  const [entries, setEntries] = useState<SiteRootEntry[]>([])
  const [busy, setBusy] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    const result = await window.api.siteRoots?.configured()
    if (result?.ok) {
      setEntries(result.value)
    }
  }, [])

  useEffect(() => {
    if (!open) {
      return
    }
    void load()
    // Reopening re-reads rather than trusting the last render: a missing root becomes reachable the
    // moment its volume is remounted, and nothing pushes that.
  }, [open, load])

  // Every writer answers with the new list, so one helper covers add, remove and reorder — and a
  // rejected write leaves the rows exactly as they were instead of half-applying.
  const apply = async (
    write: () => Promise<SiteResult<SiteRootEntry[]> | undefined>
  ): Promise<void> => {
    setBusy(true)
    try {
      const result = await write()
      if (!result) {
        // No roots surface at all (the web build stubs it out); there is nothing to report.
        return
      }
      if (result.ok) {
        setEntries(result.value)
        return
      }
      toast.error(result.error)
    } finally {
      setBusy(false)
    }
  }

  const addFolder = async (): Promise<void> => {
    const picked = await window.api.repos.pickDirectory()
    if (picked) {
      await apply(async () => window.api.siteRoots?.add(picked))
    }
  }

  const move = (entry: SiteRootEntry, toIndex: number): void => {
    void apply(async () => window.api.siteRoots?.reorder({ path: entry.path, toIndex }))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {translate('auto.components.sites.SiteRootsDialog.title', 'Site folders')}
          </DialogTitle>
          <DialogDescription>
            {/* The old wording promised clones land in the first listed folder. True once you
                choose folders; untrue while Muster is inferring them, where the order is
                alphabetical and the destination is the folder holding the most projects. */}
            {translate(
              'auto.components.sites.SiteRootsDialog.description',
              'Sites are listed from these folders. Choose one to decide where new clones land — the first reachable folder wins.'
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Capped: a full list is SITE_ROOTS_MAX rows, which outgrows a short viewport. */}
        <div className="scrollbar-sleek max-h-[40vh] space-y-1 overflow-y-auto">
          {entries.map((entry, index) => (
            <div
              key={entry.path}
              className="flex items-center gap-2 rounded-md border border-border px-3 py-2"
            >
              <span className="min-w-0 flex-1 break-all font-mono text-xs">{entry.path}</span>
              {entry.missing ? (
                <span className="flex shrink-0 items-center gap-1 text-xs text-destructive">
                  <TriangleAlert className="size-3.5" />
                  {translate('auto.components.sites.SiteRootsDialog.missing', 'Missing')}
                </span>
              ) : null}
              <Button
                variant="ghost"
                size="icon-xs"
                disabled={busy || index === 0}
                aria-label={translate('auto.components.sites.SiteRootsDialog.moveUp', 'Move up')}
                onClick={() => move(entry, index - 1)}
              >
                <ArrowUp />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                disabled={busy || index === entries.length - 1}
                aria-label={translate(
                  'auto.components.sites.SiteRootsDialog.moveDown',
                  'Move down'
                )}
                onClick={() => move(entry, index + 1)}
              >
                <ArrowDown />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                disabled={busy}
                aria-label={translate('auto.components.sites.SiteRootsDialog.remove', 'Remove')}
                onClick={() => void apply(async () => window.api.siteRoots?.remove(entry.path))}
              >
                <X />
              </Button>
            </div>
          ))}

          {/* Why spell out the derived roots: an empty list is a working state, not a broken one,
              and without naming the folders it reads as "Muster is looking nowhere". They are a
              list, not a sentence — inlining a dozen paths into prose was unreadable, and the
              count is the part that tells the user whether adding one is worth it. */}
          {entries.length === 0 ? (
            <div className="space-y-1.5 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              {effectiveRoots.length > 0 ? (
                <>
                  <p>
                    {translate(
                      'auto.components.sites.SiteRootsDialog.derived',
                      'No folders chosen, so Muster is scanning the {{count}} folders your existing projects sit in. Add one to take over.',
                      { count: effectiveRoots.length }
                    )}
                  </p>
                  <ul className="scrollbar-sleek max-h-32 space-y-0.5 overflow-y-auto">
                    {effectiveRoots.map((root) => (
                      <li key={root} className="truncate font-mono text-[11px]" title={root}>
                        {root}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p>
                  {translate(
                    'auto.components.sites.SiteRootsDialog.none',
                    'No folders chosen, and there are no projects to infer one from. Add the folder your sites live in.'
                  )}
                </p>
              )}
            </div>
          ) : null}
        </div>

        <div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={busy}
            onClick={() => void addFolder()}
          >
            <FolderPlus className="size-3.5" />
            {translate('auto.components.sites.SiteRootsDialog.add', 'Add folder')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default SiteRootsDialog
