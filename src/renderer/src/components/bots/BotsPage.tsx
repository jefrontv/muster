// Muster Bots: the Bots tab. Hosts the bundled bots server's UI in a webview on the Bots
// partition, the only session that carries the server's owner token.
import { Loader2 } from 'lucide-react'
import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { ChatModeToggle } from '../chat-mode/ChatModeToggle'
import { BotsCommentDraftsPanel } from './BotsCommentDraftsPanel'
import { BotsFailedActions } from './BotsFailedActions'
import { BotsIntroDialog } from './BotsIntroDialog'
import { connectBotsDictation } from './bots-dictation-bridge'
import { botsDictationHost } from './bots-dictation-host'
import { BOTS_TOGGLE_CHROME_TOP, watchBotsSidebarRoom } from './bots-guest-layout'
import { syncBotsHostTheme } from './bots-host-theme'
import { syncBotsWebviewZoom } from './bots-webview-zoom'
import { useBotsStatus } from './use-bots-status'
import { useBotsCommentDrafts } from './use-bots-comment-drafts'
import { useBotsCommentDraftsPanel, useBotsDraftsOverlay } from './use-bots-comment-drafts-panel'

function useBotsWebview(
  containerRef: React.RefObject<HTMLDivElement | null>,
  url: string | null,
  partition: string | null
): boolean {
  const webviewRef = useRef<Electron.WebviewTag | null>(null)
  const stopThemeSyncRef = useRef<(() => void) | null>(null)
  const [sidebarRoom, setSidebarRoom] = useState(false)
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
    setSidebarRoom(false)
    const stopTheme = syncBotsHostTheme(webview, {
      get: () => ({
        sidebarWidth: useAppStore.getState().sidebarWidth,
        chromeTop: BOTS_TOGGLE_CHROME_TOP
      }),
      subscribe: (onChange) =>
        useAppStore.subscribe((state, prev) => {
          if (state.sidebarWidth !== prev.sidebarWidth) {
            onChange()
          }
        })
    })
    const stopRoom = watchBotsSidebarRoom(webview, setSidebarRoom)
    const stopDictation = connectBotsDictation(webview, botsDictationHost)
    const stopZoom = syncBotsWebviewZoom(webview)
    stopThemeSyncRef.current = () => {
      stopTheme()
      stopRoom()
      stopDictation()
      stopZoom()
    }
  }, [containerRef, url, partition])
  useEffect(
    () => () => {
      stopThemeSyncRef.current?.()
      webviewRef.current?.remove()
    },
    []
  )
  return sidebarRoom
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

const MUSTER_RELEASES_URL = 'https://github.com/jefrontv/muster/releases/latest'

export default function BotsPage({ active = true }: { active?: boolean }): React.JSX.Element {
  const { status, restart } = useBotsStatus()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const running = status.state === 'running' ? status : null
  const sidebarRoom = useBotsWebview(containerRef, running?.url ?? null, running?.partition ?? null)
  // Once the guest's sidebar leaves room, the toggle sits where Code mode has it and no band shifts the page.
  const floatToggle = Boolean(running) && sidebarRoom
  const sidebarWidth = useAppStore((s) => s.sidebarWidth)
  const drafts = useBotsCommentDrafts(Boolean(running))
  const draftsPanel = useBotsCommentDraftsPanel(drafts.loaded ? drafts.drafts.length : null)
  const [contentRow, setContentRow] = useState<HTMLDivElement | null>(null)
  const draftsOverlay = useBotsDraftsOverlay(contentRow)

  return (
    <div className={cn('flex h-full min-h-0 flex-col bg-background', !active && 'hidden')}>
      {floatToggle ? null : (
        <div className="flex shrink-0 items-center border-b border-border">
          {/* Sidebar width so the toggle matches Code mode's exactly. */}
          <div className="shrink-0 p-3" style={{ width: sidebarWidth }}>
            <ChatModeToggle mode="bots" />
          </div>
        </div>
      )}
      <div ref={setContentRow} className="relative flex min-h-0 flex-1">
        <div className="relative min-h-0 min-w-0 flex-1">
          {floatToggle ? (
            <div className="absolute top-0 left-0 z-10 p-3" style={{ width: sidebarWidth }}>
              <ChatModeToggle mode="bots" />
            </div>
          ) : null}
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
                "Muster Bots isn't part of this build."
              )}
              detail={
                import.meta.env.DEV
                  ? translate(
                      'auto.components.bots.BotsPage.missingDetail',
                      'In a development checkout, run pnpm fetch:muster-bots and reopen this tab.'
                    )
                  : translate(
                      'auto.components.bots.BotsPage.missingReleaseDetail',
                      'Install the latest Muster release to get it.'
                    )
              }
              action={
                import.meta.env.DEV ? null : (
                  <Button size="sm" variant="outline" asChild>
                    <a href={MUSTER_RELEASES_URL} target="_blank" rel="noopener noreferrer">
                      {translate(
                        'auto.components.bots.BotsPage.getLatest',
                        'Get the latest Muster'
                      )}
                    </a>
                  </Button>
                )
              }
            />
          ) : null}
          {status.state === 'failed' ? (
            <BotsNotice
              title={translate('auto.components.bots.BotsPage.failed', 'Muster Bots stopped')}
              detail={status.error}
              action={<BotsFailedActions error={status.error} onRestart={restart} />}
            />
          ) : null}
        </div>
        {running ? (
          <BotsCommentDraftsPanel
            state={drafts}
            open={draftsPanel.open}
            overlay={draftsOverlay}
            onOpenChange={draftsPanel.setOpen}
          />
        ) : null}
      </div>
      {/* Over the starting state on purpose: the server starts while the intro is read. */}
      <BotsIntroDialog active={active} />
    </div>
  )
}
