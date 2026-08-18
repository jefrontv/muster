// In-app confirm for destructive muster-MCP tool calls (Claude asking to
// delete chats). Server-side gate: full-access permission mode cannot skip it.
// Self-contained — subscribes to confirm requests and answers them itself.

import { useEffect, useState } from 'react'
import { Trash } from 'lucide-react'
import type React from 'react'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import type { ChatConnectorConfirmRequest } from '../../../../shared/chat-connector-types'

export function ChatConnectorConfirmDialog(): React.JSX.Element | null {
  const [queue, setQueue] = useState<ChatConnectorConfirmRequest[]>([])
  useEffect(
    () =>
      window.api.chatConnector.onConfirmRequest((request) =>
        setQueue((pending) => [...pending, request])
      ),
    []
  )
  const current = queue[0] ?? null
  const threadTitle = useAppStore((s) =>
    current ? (s.chatThreads.find((t) => t.id === current.threadId)?.title ?? null) : null
  )
  if (!current) {
    return null
  }
  const respond = (confirmed: boolean): void => {
    void window.api.chatConnector
      .respondConfirm({ requestId: current.requestId, confirmed })
      .catch(() => undefined)
    setQueue((pending) => pending.slice(1))
  }
  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) {
          respond(false)
        }
      }}
    >
      {/* Agent-initiated destruction: Radix's default Cancel focus stays, so a
          stray Enter declines instead of approving something unseen. */}
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">
            {translate('auto.components.chat.connector.confirmTitle', 'Delete chats?')}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {threadTitle
              ? translate(
                  'auto.components.chat.connector.confirmDescriptionNamed',
                  'Claude in "{{value0}}" is asking to delete chats. This cannot be undone.',
                  { value0: threadTitle }
                )
              : translate(
                  'auto.components.chat.connector.confirmDescription',
                  'Claude is asking to delete chats. This cannot be undone.'
                )}
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-md border border-border/70 bg-muted/35 px-3 py-2 text-xs text-muted-foreground">
          {current.summary}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => respond(false)}>
            {translate('auto.components.chat.connector.confirmCancel', 'Cancel')}
          </Button>
          <Button type="button" variant="destructive" onClick={() => respond(true)}>
            <Trash className="size-4" />
            {translate('auto.components.chat.connector.confirmDelete', 'Delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
