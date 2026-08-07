// Database snapshots for a site: what the pre-import safety net captured, plus manual snapshot
// and one-click restore. Restore overwrites the local database, so it confirms first.

import { DatabaseBackup, Loader2, RotateCcw, Trash2 } from 'lucide-react'
import type React from 'react'
import { useCallback, useEffect, useState } from 'react'
import type { SiteDbSnapshot } from '../../../../shared/site-db-snapshot-types'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import { useConfirmationDialog } from '@/components/confirmation-dialog'
import { formatRelativeTime } from '../right-sidebar/site-panel-controls'

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

export function SiteDbSnapshotsSection({ siteId }: { siteId: string }): React.JSX.Element | null {
  const confirm = useConfirmationDialog()
  const [snapshots, setSnapshots] = useState<SiteDbSnapshot[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async (): Promise<void> => {
    const result = await window.api.siteDbSnapshots.list(siteId)
    if (result.ok) {
      setSnapshots(result.value)
    }
  }, [siteId])

  useEffect(() => {
    void load()
  }, [load])

  const snapshotNow = async (): Promise<void> => {
    setBusy('create')
    setMessage(null)
    try {
      const result = await window.api.siteDbSnapshots.create(siteId)
      setMessage(
        result.ok
          ? translate('auto.components.sites.SiteDbSnapshots.created', 'Snapshot saved.')
          : result.error
      )
      await load()
    } finally {
      setBusy(null)
    }
  }

  const restore = async (snapshot: SiteDbSnapshot): Promise<void> => {
    const accepted = await confirm({
      title: translate('auto.components.sites.SiteDbSnapshots.restoreTitle', 'Restore database'),
      description: translate(
        'auto.components.sites.SiteDbSnapshots.restoreBody',
        "Replaces the local database '{{db}}' with the snapshot from {{when}}. Changes made since are lost.",
        { db: snapshot.dbName, when: new Date(snapshot.takenAt).toLocaleString() }
      ),
      confirmLabel: translate('auto.components.sites.SiteDbSnapshots.restoreConfirm', 'Restore'),
      confirmVariant: 'destructive'
    })
    if (!accepted) {
      return
    }
    setBusy(snapshot.id)
    setMessage(null)
    try {
      const result = await window.api.siteDbSnapshots.restore({ siteId, snapshotId: snapshot.id })
      setMessage(
        result.ok
          ? translate('auto.components.sites.SiteDbSnapshots.restored', 'Database restored.')
          : result.error
      )
    } finally {
      setBusy(null)
    }
  }

  const remove = async (snapshot: SiteDbSnapshot): Promise<void> => {
    setBusy(snapshot.id)
    try {
      await window.api.siteDbSnapshots.delete({ siteId, snapshotId: snapshot.id })
      await load()
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-medium text-muted-foreground">
          {translate('auto.components.sites.SiteDbSnapshots.heading', 'Database snapshots')}
        </h3>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={busy !== null}
          onClick={() => void snapshotNow()}
        >
          {busy === 'create' ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <DatabaseBackup className="size-3.5" />
          )}
          {translate('auto.components.sites.SiteDbSnapshots.snapshotNow', 'Snapshot now')}
        </Button>
      </div>

      {snapshots.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {translate(
            'auto.components.sites.SiteDbSnapshots.empty',
            'No snapshots yet. One is taken automatically before every database import.'
          )}
        </p>
      ) : (
        <ul className="space-y-1">
          {snapshots.map((snapshot) => (
            <li key={snapshot.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate">
                  {formatRelativeTime(snapshot.takenAt)} · {snapshot.dbName} ·{' '}
                  {formatSize(snapshot.sizeBytes)}
                </span>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {snapshot.reason === 'pre-import'
                    ? translate('auto.components.sites.SiteDbSnapshots.preImport', 'pre-import')
                    : translate('auto.components.sites.SiteDbSnapshots.manual', 'manual')}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 gap-1 px-2 text-[11px]"
                  disabled={busy !== null}
                  onClick={() => void restore(snapshot)}
                >
                  {busy === snapshot.id ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <RotateCcw className="size-3" />
                  )}
                  {translate('auto.components.sites.SiteDbSnapshots.restore', 'Restore')}
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={translate('auto.components.sites.SiteDbSnapshots.delete', 'Delete')}
                  disabled={busy !== null}
                  onClick={() => void remove(snapshot)}
                >
                  <Trash2 className="size-3" />
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
    </section>
  )
}
