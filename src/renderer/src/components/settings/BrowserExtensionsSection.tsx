import { useCallback, useEffect, useState } from 'react'
import { Puzzle, RefreshCw, Trash2, TriangleAlert } from 'lucide-react'
import type { BrowserExtensionStatus } from '../../../../shared/browser-extension-types'
import { Button } from '../ui/button'
import { SearchableSetting } from './SearchableSetting'
import { translate } from '@/i18n/i18n'

function ExtensionRow({
  status,
  onRemove,
  onConfigure
}: {
  status: BrowserExtensionStatus
  onRemove: (path: string) => void
  onConfigure: (status: BrowserExtensionStatus) => void
}): React.JSX.Element {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-border/50 px-3 py-2">
      <div className="min-w-0 space-y-0.5">
        <div className="flex items-center gap-2 text-sm">
          <Puzzle className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate font-medium">
            {status.name ?? status.path.split(/[/\\]/).pop()}
          </span>
          {status.version ? (
            <span className="shrink-0 text-xs text-muted-foreground">{status.version}</span>
          ) : null}
        </div>
        <div className="truncate text-xs text-muted-foreground" title={status.path}>
          {status.path}
        </div>
        {status.error ? (
          <div className="flex items-start gap-1.5 text-xs text-destructive">
            <TriangleAlert className="mt-0.5 size-3 shrink-0" />
            <span>{status.error}</span>
          </div>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {status.id && status.settingsPage ? (
          <Button type="button" variant="outline" size="sm" onClick={() => onConfigure(status)}>
            {translate('auto.components.settings.BrowserExtensionsSection.b7419fc2ad', 'Configure')}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={translate(
            'auto.components.settings.BrowserExtensionsSection.f47a2c1e08',
            'Remove extension'
          )}
          onClick={() => onRemove(status.path)}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}

export function BrowserExtensionsSection(): React.JSX.Element {
  const [statuses, setStatuses] = useState<BrowserExtensionStatus[]>([])
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const title = translate(
    'auto.components.settings.BrowserExtensionsSection.b8d3f5a219',
    'Browser Extensions'
  )
  const description = translate(
    'auto.components.settings.BrowserExtensionsSection.c9e1740b6d',
    'Load unpacked Chrome extensions into the in-app browser. Electron supports a subset of the extension APIs — content scripts and storage work, while background service workers and request blocking may not.'
  )

  useEffect(() => {
    void window.api.browser.extensions.list().then(setStatuses)
  }, [])

  const handleAdd = useCallback(async () => {
    setBusy(true)
    setNotice(null)
    try {
      const result = await window.api.browser.extensions.add()
      if (result.ok) {
        setStatuses(await window.api.browser.extensions.list())
        return
      }
      if (result.reason !== 'cancelled') {
        setNotice(result.message ?? 'Could not add that folder.')
      }
    } finally {
      setBusy(false)
    }
  }, [])

  // Why: Chromium will not render chrome-extension:// pages in a <webview> guest, so the
  // extension's own popup/options page opens in its own window instead of a browser tab.
  const handleConfigure = useCallback(async (status: BrowserExtensionStatus) => {
    if (!status.id || !status.settingsPage) {
      return
    }
    setNotice(null)
    const result = await window.api.browser.extensions.openSettingsPage({
      extensionId: status.id,
      page: status.settingsPage
    })
    if (!result.ok) {
      setNotice(result.message ?? 'Could not open the extension settings page.')
    }
  }, [])

  const handleRemove = useCallback((path: string) => {
    void window.api.browser.extensions.remove({ path }).then(setStatuses)
  }, [])

  const handleReload = useCallback(async () => {
    setBusy(true)
    try {
      setStatuses(await window.api.browser.extensions.reload())
    } finally {
      setBusy(false)
    }
  }, [])

  return (
    <SearchableSetting
      title={title}
      description={description}
      keywords={['browser', 'extension', 'extensions', 'chrome', 'unpacked', 'plugin', 'addon']}
      className="space-y-3 py-2"
    >
      <div className="space-y-1">
        <div className="text-sm font-medium">{title}</div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>

      {statuses.length > 0 ? (
        <div className="space-y-2">
          {statuses.map((status) => (
            <ExtensionRow
              key={status.path}
              status={status}
              onRemove={handleRemove}
              onConfigure={(status) => void handleConfigure(status)}
            />
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {translate(
            'auto.components.settings.BrowserExtensionsSection.d15c8ba304',
            'No extensions added. Point Muster at a folder containing a manifest.json.'
          )}
        </p>
      )}

      {notice ? <p className="text-xs text-destructive">{notice}</p> : null}

      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={handleAdd}>
          {translate(
            'auto.components.settings.BrowserExtensionsSection.a3f9026b7c',
            'Add Extension Folder'
          )}
        </Button>
        {statuses.length > 0 ? (
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={handleReload}>
            <RefreshCw className="size-3.5" />
            {translate('auto.components.settings.BrowserExtensionsSection.e6207bd94a', 'Reload')}
          </Button>
        ) : null}
      </div>
    </SearchableSetting>
  )
}
