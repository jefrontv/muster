// One quiet line above the composer for session state (starting, ended, failed,
// missing folder), so the transcript above it never gives way to a full-page state.

import type React from 'react'
import { useEffect, useState } from 'react'
import { FolderMinus, FolderOpen, FolderX, Loader2, RotateCcw, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { basename } from '@/lib/path'
import { cn } from '@/lib/utils'
import type { ChatWorkspace } from '../../../../shared/chat-mode-types'
import {
  relocateChatWorkspaceFolder,
  removeChatWorkspaceFolder
} from './chat-workspace-folder-relocate'

function NoticeRow({
  icon,
  tone = 'muted',
  title,
  detail,
  children
}: {
  icon: React.ReactNode
  tone?: 'muted' | 'error'
  title: string
  detail?: string | null
  children?: React.ReactNode
}): React.JSX.Element {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className="mx-auto mb-2 flex w-full max-w-3xl items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs"
    >
      <span
        className={cn(
          'flex shrink-0 items-center',
          tone === 'error' ? 'text-destructive' : 'text-muted-foreground'
        )}
        aria-hidden
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="font-medium text-foreground">{title}</span>
        {detail ? (
          <span className="ml-1.5 truncate text-muted-foreground" title={detail}>
            {detail}
          </span>
        ) : null}
      </span>
      {children ? <span className="flex shrink-0 items-center gap-1">{children}</span> : null}
    </div>
  )
}

/** A fast local start shows nothing; only a slow boot (cold CLI, SSH) earns the line. */
const STARTING_NOTICE_DELAY_MS = 800

export function ChatThreadStartingNotice(): React.JSX.Element | null {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), STARTING_NOTICE_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [])
  if (!visible) {
    return null
  }
  return (
    <NoticeRow
      icon={<Loader2 className="size-3.5 animate-spin" />}
      title={translate('auto.components.chat.thread.starting', 'Starting Claude…')}
    />
  )
}

/** The process died or never started; history stays above, Resume relaunches on demand. */
export function ChatThreadEndedNotice({
  failed,
  message,
  canResume,
  onResume
}: {
  failed: boolean
  message: string | null
  canResume: boolean
  onResume: () => void
}): React.JSX.Element {
  return (
    <NoticeRow
      icon={<TriangleAlert className="size-3.5" />}
      tone={failed ? 'error' : 'muted'}
      title={
        failed
          ? translate('auto.components.chat.thread.failed', 'The session could not start')
          : translate('auto.components.chat.thread.ended', 'This session ended')
      }
      detail={message}
    >
      <Button size="xs" variant="ghost" onClick={onResume}>
        <RotateCcw />
        {canResume
          ? translate('auto.components.chat.thread.resume', 'Resume chat')
          : translate('auto.components.chat.thread.retry', 'Try again')}
      </Button>
    </NoticeRow>
  )
}

/** The workspace folder moved or was deleted; locating it fixes every chat in it. */
export function ChatThreadFolderMissingNotice({
  folder,
  workspace,
  onResolved
}: {
  folder: string
  workspace: ChatWorkspace | null
  onResolved: () => void
}): React.JSX.Element {
  const [busy, setBusy] = useState(false)
  const run = async (action: () => Promise<boolean | void>): Promise<void> => {
    setBusy(true)
    try {
      if ((await action()) !== false) {
        onResolved()
      }
    } finally {
      setBusy(false)
    }
  }
  return (
    <NoticeRow
      icon={<FolderX className="size-3.5" />}
      tone="error"
      title={translate(
        'components.chat-mode.folderMissing.title',
        "This workspace's folder is missing"
      )}
      detail={basename(folder)}
    >
      {workspace ? (
        <>
          <Button
            size="xs"
            variant="ghost"
            disabled={busy}
            onClick={() => void run(() => relocateChatWorkspaceFolder(workspace, folder))}
          >
            <FolderOpen />
            {translate('components.chat-mode.folderMissing.locate', 'Locate folder')}
          </Button>
          <Button
            size="xs"
            variant="ghost"
            disabled={busy}
            onClick={() => void run(() => removeChatWorkspaceFolder(workspace, folder))}
          >
            <FolderMinus />
            {translate('components.chat-mode.folderMissing.remove', 'Remove folder')}
          </Button>
        </>
      ) : null}
    </NoticeRow>
  )
}
