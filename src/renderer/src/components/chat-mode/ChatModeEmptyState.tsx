// Empty states for the chat surface: no workspaces at all, or none selected.

import { FolderPlus, MessageCircle } from 'lucide-react'
import type React from 'react'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'

export function ChatModeEmptyState({
  hasWorkspaces,
  onCreateWorkspace
}: {
  hasWorkspaces: boolean
  onCreateWorkspace: () => void
}): React.JSX.Element {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
        <MessageCircle className="size-6 text-muted-foreground" />
      </div>
      {hasWorkspaces ? (
        <>
          <p className="text-sm font-medium">
            {translate('auto.components.chat.empty.pickThread', 'Pick a chat to continue')}
          </p>
          <p className="max-w-sm text-xs text-muted-foreground">
            {translate(
              'auto.components.chat.empty.pickThreadCopy',
              'Choose a chat from the sidebar, or start a new one inside a workspace.'
            )}
          </p>
        </>
      ) : (
        <>
          <p className="text-sm font-medium">
            {translate('auto.components.chat.empty.noWorkspaces', 'Create your first workspace')}
          </p>
          <p className="max-w-sm text-xs text-muted-foreground">
            {translate(
              'auto.components.chat.empty.noWorkspacesCopy',
              'A workspace is just a name and the folders Claude can work in. Chats live inside it.'
            )}
          </p>
          <Button size="sm" className="gap-1.5" onClick={onCreateWorkspace}>
            <FolderPlus className="size-3.5" />
            {translate('auto.components.chat.empty.createWorkspace', 'New workspace')}
          </Button>
        </>
      )}
    </div>
  )
}
