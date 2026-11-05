// "Undo changes" on a finished turn: a dry run names the files, a confirm rewrites them.

import { useState } from 'react'
import type React from 'react'
import { Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { translate } from '@/i18n/i18n'
import { CHAT_MESSAGE_ACTION_CLASS } from './ChatMessageTray'
import { parseRewindPreview } from './chat-turn-undo'

const SHOWN_FILES = 5

const basename = (path: string): string => path.split(/[\\/]/).findLast(Boolean) ?? path

export function ChatUndoTurnAction(props: {
  threadId: string
  userMessageId: string | null
}): React.JSX.Element {
  const [files, setFiles] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)
  const { threadId, userMessageId } = props
  const label = translate('components.chat-conversation.undo.action', 'Undo changes')
  const failed = (reason: string): void => {
    toast.error(translate('components.chat-conversation.undo.failed', 'Could not undo changes'), {
      description: reason
    })
  }
  const rewind = async (dryRun: boolean): Promise<string[] | null> => {
    if (!userMessageId) {
      return null
    }
    const result = await window.api.chatEngine
      .control(threadId, { action: 'rewind', userMessageId, dryRun })
      .catch((error: unknown) => ({ ok: false as const, error: String(error) }))
    if (!result.ok) {
      failed(result.error)
      return null
    }
    const preview = parseRewindPreview(result.value)
    if (!preview.canRewind) {
      failed(preview.error ?? '')
      return null
    }
    return preview.files
  }
  const preview = async (): Promise<void> => {
    setBusy(true)
    setFiles(await rewind(true))
    setBusy(false)
  }
  const confirm = async (): Promise<void> => {
    setBusy(true)
    const done = await rewind(false)
    setBusy(false)
    setFiles(null)
    if (done) {
      toast.success(translate('components.chat-conversation.undo.done', 'Changes undone'))
    }
  }
  const shown = files?.slice(0, SHOWN_FILES) ?? []
  const more = (files?.length ?? 0) - shown.length
  return (
    <>
      <button
        type="button"
        aria-label={label}
        title={
          userMessageId
            ? label
            : translate(
                'components.chat-conversation.undo.unavailable',
                'This turn has no checkpoint to undo to'
              )
        }
        disabled={!userMessageId || busy}
        onClick={() => void preview()}
        className={CHAT_MESSAGE_ACTION_CLASS}
      >
        <Undo2 aria-hidden />
      </button>
      <Dialog open={files !== null} onOpenChange={(open) => !open && setFiles(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {translate('components.chat-conversation.undo.title', "Undo this turn's changes?")}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {translate(
                'components.chat-conversation.undo.body',
                'Files go back to how they were before this message. The chat itself stays.'
              )}
            </DialogDescription>
          </DialogHeader>
          {shown.length > 0 && (
            <ul className="space-y-0.5 rounded-md border border-border/70 bg-muted/35 px-3 py-2 text-xs">
              {shown.map((file) => (
                <li key={file} title={file} className="truncate font-mono">
                  {basename(file)}
                </li>
              ))}
              {more > 0 && (
                <li className="text-muted-foreground">
                  {translate('components.chat-conversation.undo.more', 'and {{count}} more', {
                    count: more
                  })}
                </li>
              )}
            </ul>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setFiles(null)}>
              {translate('components.chat-conversation.undo.cancel', 'Keep changes')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => void confirm()}
            >
              {label}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
