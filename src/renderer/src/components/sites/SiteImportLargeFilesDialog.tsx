// The pause before an import copies files: unusually large items found on the server, each one
// tickable to leave behind. App-wide, so it reaches the user whichever view they are on.

import { FileText, Folder, Loader2 } from 'lucide-react'
import type React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  formatImportSize,
  type SiteImportLargeEntry,
  type SiteImportLargeFilesPrompt
} from '../../../../shared/site-import-file-rules'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import {
  enclosingEntry,
  skippedBytes,
  skipPaths,
  splitEntryPath
} from './site-import-large-selection'

type Busy = 'skip' | 'copy' | 'cancel' | null

function EntryRow({
  entry,
  nested,
  checked,
  coveredByFolder,
  onToggle
}: {
  entry: SiteImportLargeEntry
  nested: boolean
  checked: boolean
  coveredByFolder: boolean
  onToggle: () => void
}): React.JSX.Element {
  const { name, parent } = splitEntryPath(entry.path)
  const id = `large-entry-${entry.path}`
  const Icon = entry.kind === 'folder' ? Folder : FileText
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex items-center gap-3 px-3 transition-colors',
        coveredByFolder ? 'cursor-default' : 'cursor-pointer hover:bg-accent',
        nested ? 'py-2 pl-10' : 'py-2.5'
      )}
      title={
        coveredByFolder
          ? translate(
              'auto.components.sites.SiteImportLargeFiles.withFolder',
              'Skipped with its folder'
            )
          : undefined
      }
    >
      <Checkbox
        id={id}
        checked={checked || coveredByFolder}
        disabled={coveredByFolder}
        onCheckedChange={onToggle}
      />
      <Icon
        className={cn('size-4 shrink-0 text-muted-foreground', coveredByFolder && 'opacity-50')}
        aria-hidden
      />
      <span className={cn('min-w-0 flex-1', coveredByFolder && 'opacity-50')}>
        <span className="block truncate text-[13px] font-medium">
          {name}
          {entry.kind === 'folder' ? '/' : ''}
        </span>
        {nested ? null : parent ? (
          <span className="block truncate font-mono text-[11px] text-muted-foreground">
            {`${parent}/`}
          </span>
        ) : (
          <span className="block truncate text-[11px] text-muted-foreground">
            {translate('auto.components.sites.SiteImportLargeFiles.webroot', 'Webroot')}
          </span>
        )}
      </span>
      <span
        className={cn(
          'shrink-0 text-xs tabular-nums text-muted-foreground',
          coveredByFolder && 'opacity-50'
        )}
      >
        {formatImportSize(entry.bytes)}
      </span>
    </label>
  )
}

export function SiteImportLargeFilesDialog({
  prompt,
  waitingAfter
}: {
  prompt: SiteImportLargeFilesPrompt
  /** Other imports queued behind this one. */
  waitingAfter: number
}): React.JSX.Element {
  const { entries } = prompt
  // Top-level items start ticked: what trips the check is nearly always a backup or a log.
  const [selected, setSelected] = useState<Set<string>>(
    () =>
      new Set(entries.filter((entry) => !enclosingEntry(entry, entries)).map((entry) => entry.path))
  )
  const [remember, setRemember] = useState(true)
  const [busy, setBusy] = useState<Busy>(null)
  const [error, setError] = useState<string | null>(null)
  const primaryRef = useRef<HTMLButtonElement>(null)

  const groups = useMemo(
    () =>
      entries
        .filter((entry) => !enclosingEntry(entry, entries))
        .map((top) => ({
          top,
          inside: entries.filter((entry) => enclosingEntry(entry, entries) === top)
        })),
    [entries]
  )
  const chosen = useMemo(() => skipPaths(entries, selected), [entries, selected])
  const bytes = useMemo(() => skippedBytes(entries, selected), [entries, selected])

  const toggle = (path: string): void => {
    setSelected((current) => {
      const next = new Set(current)
      if (!next.delete(path)) {
        next.add(path)
      }
      return next
    })
  }

  const answer = async (kind: 'skip' | 'copy'): Promise<void> => {
    setBusy(kind)
    const accepted = await window.api.siteImportLargeFiles.respond(prompt.promptId, {
      skip: kind === 'skip' ? chosen : [],
      remember
    })
    // A false answer means the import already moved on; the resolved event closes the dialog.
    if (!accepted) {
      setBusy(null)
    }
  }

  const cancelImport = async (): Promise<void> => {
    setBusy('cancel')
    const result = await window.api.siteRuns.cancel(prompt.runId)
    if (!result.ok) {
      setBusy(null)
      setError(result.error)
    }
  }

  return (
    <Dialog open>
      <DialogContent
        showCloseButton={false}
        className="gap-5 sm:max-w-xl"
        // The import is paused on this answer, so it never closes by accident.
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          primaryRef.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-base">
            {translate(
              'auto.components.sites.SiteImportLargeFiles.title',
              'Large files on {{environment}}',
              { environment: prompt.environment }
            )}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.sites.SiteImportLargeFiles.description',
              'Before copying {{site}}, Muster found these. Anything you skip stays on the server.',
              { site: prompt.siteName }
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <ul className="scrollbar-sleek max-h-[min(50vh,22rem)] divide-y divide-border overflow-y-auto rounded-xl border border-border bg-foreground/[0.03]">
            {groups.map(({ top, inside }) => (
              // A folder and the big files in it read as one item: no rule between them.
              <li key={top.path}>
                <EntryRow
                  entry={top}
                  nested={false}
                  checked={selected.has(top.path)}
                  coveredByFolder={false}
                  onToggle={() => toggle(top.path)}
                />
                {inside.length > 0 ? (
                  <ul className="pb-1">
                    {inside.map((entry) => (
                      <li key={entry.path}>
                        <EntryRow
                          entry={entry}
                          nested
                          checked={selected.has(entry.path)}
                          coveredByFolder={selected.has(top.path)}
                          onToggle={() => toggle(entry.path)}
                        />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {chosen.length > 0
              ? translate(
                  'auto.components.sites.SiteImportLargeFiles.summary',
                  '{{size}} will stay on the server.',
                  { size: formatImportSize(bytes) }
                )
              : translate(
                  'auto.components.sites.SiteImportLargeFiles.summaryNone',
                  'Nothing ticked, so everything is copied.'
                )}
          </p>
        </div>

        <label htmlFor="large-files-remember" className="flex cursor-pointer items-start gap-3">
          <Checkbox
            id="large-files-remember"
            className="mt-0.5"
            checked={remember}
            onCheckedChange={(value) => setRemember(value === true)}
          />
          <span className="space-y-0.5">
            <span className="block text-[13px] font-medium">
              {translate(
                'auto.components.sites.SiteImportLargeFiles.remember',
                'Remember for future imports of this site'
              )}
            </span>
            <span className="block text-xs text-muted-foreground">
              {translate(
                'auto.components.sites.SiteImportLargeFiles.rememberHint',
                "Later imports won't ask about these again. Edit the list on the site's page."
              )}
            </span>
          </span>
        </label>

        {error ? <p className="text-xs text-destructive">{error}</p> : null}

        <DialogFooter className="items-center sm:justify-between">
          <Button
            variant="ghost"
            className="text-muted-foreground"
            disabled={busy !== null}
            onClick={() => void cancelImport()}
          >
            {busy === 'cancel' ? <Loader2 className="size-4 animate-spin" /> : null}
            {translate('auto.components.sites.SiteImportLargeFiles.cancel', 'Cancel import')}
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
            {waitingAfter > 0 ? (
              <span className="text-xs text-muted-foreground sm:mr-1">
                {translate(
                  'auto.components.sites.SiteImportLargeFiles.queued',
                  '{{count}} more waiting',
                  { count: waitingAfter }
                )}
              </span>
            ) : null}
            <Button
              variant="secondary"
              disabled={busy !== null}
              onClick={() => void answer('copy')}
            >
              {busy === 'copy' ? <Loader2 className="size-4 animate-spin" /> : null}
              {translate('auto.components.sites.SiteImportLargeFiles.copyAll', 'Copy everything')}
            </Button>
            <Button
              ref={primaryRef}
              disabled={busy !== null || chosen.length === 0}
              onClick={() => void answer('skip')}
            >
              {busy === 'skip' ? <Loader2 className="size-4 animate-spin" /> : null}
              {translate(
                'auto.components.sites.SiteImportLargeFiles.skip',
                'Skip {{count}} selected',
                { count: chosen.length }
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Shows the oldest waiting prompt; the rest queue behind it. */
export function SiteImportLargeFilesHost(): React.JSX.Element | null {
  const [prompts, setPrompts] = useState<SiteImportLargeFilesPrompt[]>([])

  useEffect(() => {
    const api = window.api?.siteImportLargeFiles
    if (!api) {
      return
    }
    const add = (prompt: SiteImportLargeFilesPrompt): void =>
      setPrompts((current) =>
        current.some((item) => item.promptId === prompt.promptId) ? current : [...current, prompt]
      )
    const offPrompt = api.onPrompt(add)
    const offResolved = api.onResolved((promptId) =>
      setPrompts((current) => current.filter((item) => item.promptId !== promptId))
    )
    // Prompts raised before this window mounted (a reload mid-import).
    void api.listPending().then((pending) => pending.forEach(add))
    return () => {
      offPrompt()
      offResolved()
    }
  }, [])

  const [first] = prompts
  return first ? (
    <SiteImportLargeFilesDialog
      key={first.promptId}
      prompt={first}
      waitingAfter={prompts.length - 1}
    />
  ) : null
}
