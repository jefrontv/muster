// Muster Bots: the Bots tab. Hosts the bundled bots server's UI in a webview on the Bots
// partition, the only session that carries the server's owner token.
import { Loader2 } from 'lucide-react'
import type React from 'react'
import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { ChatModeToggle } from '../chat-mode/ChatModeToggle'
import { syncBotsHostTheme } from './bots-host-theme'
import { useBotsStatus } from './use-bots-status'

function useBotsWebview(
  containerRef: React.RefObject<HTMLDivElement | null>,
  url: string | null,
  partition: string | null
): void {
  const webviewRef = useRef<Electron.WebviewTag | null>(null)
  const stopThemeSyncRef = useRef<(() => void) | null>(null)
  useEffect(() => {
    const container = containerRef.current
    if (!container || !url || !partition) {
      return
    }
    const existing = webviewRef.current
    if (existing && existing.getAttribute('src') === url && existing.parentElement === container) {
      return
    }
    existing?.remove()
    const webview = document.createElement('webview') as Electron.WebviewTag
    // Partition first: Electron fixes the guest's session when src is set.
    webview.setAttribute('partition', partition)
    webview.setAttribute('src', url)
    webview.className = 'flex size-full border-0'
    container.appendChild(webview)
    webviewRef.current = webview
    stopThemeSyncRef.current?.()
    stopThemeSyncRef.current = syncBotsHostTheme(webview)
  }, [containerRef, url, partition])
  useEffect(
    () => () => {
      stopThemeSyncRef.current?.()
      webviewRef.current?.remove()
    },
    []
  )
}

function BotsNotice({
  title,
  detail,
  action
}: {
  title: string
  detail?: string
  action?: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      {detail ? (
        <p className="max-w-md text-xs whitespace-pre-line text-muted-foreground">{detail}</p>
      ) : null}
      {action}
    </div>
  )
}

export default function BotsPage({ active = true }: { active?: boolean }): React.JSX.Element {
  const { status, restart } = useBotsStatus()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const running = status.state === 'running' ? status : null
  useBotsWebview(containerRef, running?.url ?? null, running?.partition ?? null)
  const sidebarWidth = useAppStore((s) => s.sidebarWidth)

  return (
    <div className={cn('flex h-full min-h-0 flex-col bg-background', !active && 'hidden')}>
      <div className="flex shrink-0 items-center border-b border-border">
        {/* Sidebar width so the toggle matches Code mode's exactly. */}
        <div className="shrink-0 p-3" style={{ width: sidebarWidth }}>
          <ChatModeToggle mode="bots" />
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
        <div ref={containerRef} className={cn('absolute inset-0 flex', !running && 'hidden')} />
        {status.state === 'starting' || status.state === 'stopped' ? (
          <BotsNotice
            title={translate('auto.components.bots.BotsPage.starting', 'Starting Muster Bots…')}
            action={<Loader2 className="size-4 animate-spin text-muted-foreground" />}
          />
        ) : null}
        {status.state === 'missing' ? (
          <BotsNotice
            title={translate(
              'auto.components.bots.BotsPage.missing',
              'Muster Bots is not included in this build'
            )}
            detail={translate(
              'auto.components.bots.BotsPage.missingDetail',
              'In a development checkout, run pnpm fetch:muster-bots and reopen this tab.'
            )}
          />
        ) : null}
        {status.state === 'failed' ? (
          <BotsNotice
            title={translate('auto.components.bots.BotsPage.failed', 'Muster Bots stopped')}
            detail={status.error}
            action={
              <Button size="sm" variant="outline" onClick={restart}>
                {translate('auto.components.bots.BotsPage.restart', 'Restart')}
              </Button>
            }
          />
        ) : null}
      </div>
    </div>
  )
}
