// Destructive confirm for bulk chat deletion — standalone chats or one
// workspace's chats. Mirrors the source-control discard dialog's focus rule.

import { useRef } from 'react'
import { Trash } from 'lucide-react'
import type React from 'react'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'

export function ChatClearAllDialog({
  open,
  count,
  workspaceName,
  onCancel,
  onConfirm
}: {
  open: boolean
  /** How many chats the confirm will delete. */
  count: number
  /** Present for a workspace scope; absent for standalone chats. */
  workspaceName?: string
  onCancel: () => void
  onConfirm: () => void
}): React.JSX.Element {
  const confirmButtonRef = useRef<HTMLButtonElement>(null)
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onCancel()
        }
      }}
    >
      <DialogContent
        className="max-w-md"
        onOpenAutoFocus={(event) => {
          if (confirmButtonRef.current) {
            // Why: Radix otherwise focuses Cancel first, making Enter dismiss this destructive confirm.
            event.preventDefault()
            confirmButtonRef.current.focus()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-sm">
            {workspaceName
              ? translate(
                  'auto.components.chat.sidebar.clearWorkspaceChatsTitle',
                  'Delete all chats in {{value0}}?',
                  { value0: workspaceName }
                )
              : translate('auto.components.chat.sidebar.clearChatsTitle', 'Delete all chats?')}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {workspaceName
              ? translate(
                  'auto.components.chat.sidebar.clearWorkspaceChatsDescription',
                  'Every chat in this workspace is deleted, including settled ones. The workspace itself stays. This cannot be undone.'
                )
              : translate(
                  'auto.components.chat.sidebar.clearChatsDescription',
                  'Every chat outside your workspaces is deleted, including settled ones. Workspace chats stay. This cannot be undone.'
                )}
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-md border border-border/70 bg-muted/35 px-3 py-2 text-xs text-muted-foreground">
          {count === 1
            ? translate('auto.components.chat.sidebar.clearChatsCountOne', '1 chat')
            : translate('auto.components.chat.sidebar.clearChatsCount', '{{value0}} chats', {
                value0: String(count)
              })}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            {translate('auto.components.chat.sidebar.clearChatsCancel', 'Cancel')}
          </Button>
          <Button
            ref={confirmButtonRef}
            type="button"
            variant="destructive"
            autoFocus
            onClick={onConfirm}
          >
            <Trash className="size-4" />
            {translate('auto.components.chat.sidebar.clearChatsConfirm', 'Delete all')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
