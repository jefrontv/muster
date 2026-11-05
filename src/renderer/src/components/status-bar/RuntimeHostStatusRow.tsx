import { useCallback, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { useMountedRef } from '@/hooks/useMountedRef'

export type RuntimeHostConnectionState = 'connected' | 'checking' | 'reconnecting' | 'disconnected'

function runtimeStatusLabel(state: RuntimeHostConnectionState): string {
  switch (state) {
    case 'connected':
      return translate('auto.components.status.bar.SshStatusSegment.runtime_online', 'Connected')
    case 'checking':
      return translate('auto.components.status.bar.SshStatusSegment.runtime_checking', 'Checking')
    case 'reconnecting':
      return translate(
        'auto.components.status.bar.SshStatusSegment.runtime_reconnecting',
        'Reconnecting'
      )
    case 'disconnected':
      return translate(
        'auto.components.status.bar.SshStatusSegment.runtime_unavailable',
        'Disconnected'
      )
  }
}

function runtimeDotColor(state: RuntimeHostConnectionState): string {
  switch (state) {
    case 'connected':
      return 'bg-status-success'
    case 'checking':
    case 'reconnecting':
      return 'bg-status-attention'
    case 'disconnected':
      return 'bg-muted-foreground/40'
  }
}

function runtimeStatusTone(state: RuntimeHostConnectionState): string {
  if (state === 'checking' || state === 'reconnecting') {
    return 'text-status-attention'
  }
  return 'text-muted-foreground'
}

function runtimeActionLabel(state: RuntimeHostConnectionState): string | null {
  switch (state) {
    case 'connected':
      return translate('auto.components.status.bar.SshStatusSegment.59b553e2aa', 'Disconnect')
    case 'disconnected':
      return translate('auto.components.status.bar.SshStatusSegment.63f36455cc', 'Connect')
    case 'checking':
    case 'reconnecting':
      return null
  }
}

export function RuntimeHostStatusRow({
  label,
  state,
  detail,
  onConnect,
  onDisconnect
}: {
  label: string
  state: RuntimeHostConnectionState
  detail?: string
  onConnect?: () => Promise<void>
  onDisconnect?: () => Promise<void>
}): React.JSX.Element {
  const [busy, setBusy] = useState(false)
  const mountedRef = useMountedRef()
  const actionLabel = runtimeActionLabel(state)

  const handleAction = useCallback(async () => {
    const action = state === 'connected' ? onDisconnect : onConnect
    if (!action) {
      return
    }
    setBusy(true)
    try {
      await action()
    } finally {
      if (mountedRef.current) {
        setBusy(false)
      }
    }
  }, [mountedRef, onConnect, onDisconnect, state])

  return (
    <div className="flex items-center gap-2.5 px-2 py-1.5">
      <span className={`size-1.5 shrink-0 rounded-full ${runtimeDotColor(state)}`} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12px] font-medium">{label}</div>
        <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
          <span>
            {translate(
              'auto.components.status.bar.SshStatusSegment.remote_server',
              'Remote server'
            )}
          </span>
          <span aria-hidden="true">·</span>
          <span className={`inline-flex min-w-0 items-center gap-1 ${runtimeStatusTone(state)}`}>
            {state === 'checking' || state === 'reconnecting' ? (
              <Loader2 className="size-2.5 shrink-0 animate-spin" />
            ) : null}
            <span className="truncate">{runtimeStatusLabel(state)}</span>
          </span>
          {detail ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="truncate">{detail}</span>
            </>
          ) : null}
        </div>
      </div>
      {busy ? (
        <Loader2 className="size-3 shrink-0 animate-spin text-muted-foreground" />
      ) : actionLabel && (state === 'connected' ? onDisconnect : onConnect) ? (
        <button
          type="button"
          onClick={() => void handleAction()}
          className="shrink-0 rounded-full px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-foreground/[0.07] hover:text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  )
}
