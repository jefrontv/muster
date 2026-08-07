// One thread row in the chat sidebar: title, live status dot, and the row menu
// (rename/delete). Rename edits inline so the list keeps its place.

import { MoreHorizontal } from 'lucide-react'
import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import type { ChatThread } from '../../../../shared/chat-mode-types'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'

/** T3-style attention colors: amber = needs you, sky pulse = in motion, plain = resting. */
function ThreadStatusDot({ threadId }: { threadId: string }): React.JSX.Element | null {
  const state = useAppStore((s) => {
    const session = s.chatThreadSessions[threadId]
    return session ? s.agentStatusByPaneKey[session.paneKey]?.state : undefined
  })
  if (state === 'working') {
    return <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-sky-400" />
  }
  if (state === 'blocked' || state === 'waiting') {
    return <span className="size-1.5 shrink-0 rounded-full bg-amber-400" />
  }
  return null
}

export function ChatThreadRow({ thread }: { thread: ChatThread }): React.JSX.Element {
  const activeChatThreadId = useAppStore((s) => s.activeChatThreadId)
  const setActiveChatThread = useAppStore((s) => s.setActiveChatThread)
  const updateChatThread = useAppStore((s) => s.updateChatThread)
  const deleteChatThread = useAppStore((s) => s.deleteChatThread)
  const [renaming, setRenaming] = useState(false)
  const [draftTitle, setDraftTitle] = useState(thread.title)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (renaming) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [renaming])

  const commitRename = (): void => {
    const title = draftTitle.trim()
    setRenaming(false)
    if (title && title !== thread.title) {
      void updateChatThread(thread.id, { title })
    }
  }

  if (renaming) {
    return (
      <li className="flex items-center px-0.5 py-0.5">
        <Input
          ref={inputRef}
          value={draftTitle}
          className="h-7 text-sm"
          onChange={(event) => setDraftTitle(event.target.value)}
          onBlur={commitRename}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              commitRename()
            }
            if (event.key === 'Escape') {
              setDraftTitle(thread.title)
              setRenaming(false)
            }
          }}
        />
      </li>
    )
  }

  return (
    <li className="group/thread flex items-center">
      <button
        type="button"
        className={cn(
          'flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm',
          thread.id === activeChatThreadId
            ? 'bg-accent text-accent-foreground'
            : 'text-foreground/90 hover:bg-muted/60'
        )}
        onClick={() => setActiveChatThread(thread.id)}
      >
        <span className="min-w-0 flex-1 truncate">{thread.title}</span>
        <ThreadStatusDot threadId={thread.id} />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            className="opacity-0 transition-opacity group-hover/thread:opacity-100"
            aria-label={translate('auto.components.chat.sidebar.threadMenu', 'Chat menu')}
          >
            <MoreHorizontal className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() => {
              setDraftTitle(thread.title)
              setRenaming(true)
            }}
          >
            {translate('auto.components.chat.sidebar.renameThread', 'Rename')}
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => void deleteChatThread(thread.id)}>
            {translate('auto.components.chat.sidebar.deleteThread', 'Delete chat')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  )
}
