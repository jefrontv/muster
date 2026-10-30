// Ported from the muster-bots fork (src/components/ChatView.tsx header, RenameTitle.tsx), Apache-2.0.
// A pill over the transcript: the workspace avatar and the chat title, renamed in place.

import { useEffect, useRef, useState } from 'react'
import type React from 'react'
import { MoreHorizontal, Pencil, Pin, PinOff } from 'lucide-react'
import type { ChatThread, ChatWorkspace } from '../../../../shared/chat-mode-types'
import {
  deriveChatThreadTitle,
  isChatWorkspaceBriefTitle
} from '../../../../shared/chat-workspace-site-info'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { regenerateChatThreadTitle } from '@/components/chat-mode/chat-thread-auto-title'
import { useChatEngineMeta } from '@/components/chat-thread/use-chat-engine-thread'
import { ChatWorkspaceAvatar } from './ChatWorkspaceAvatar'

const ICON_BUTTON_CLASS =
  'flex shrink-0 items-center justify-center rounded-full text-chat-ink-secondary transition-colors duration-100 ease-chat hover:bg-chat-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chat-accent data-[state=open]:bg-chat-hover'

function TitleEditor(props: { value: string; onDone: (next: string | null) => void }) {
  const [draft, setDraft] = useState(props.value)
  const inputRef = useRef<HTMLInputElement>(null)
  // Not autoFocus: opened from the menu, focus must land after the menu has let go of it.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
    return () => cancelAnimationFrame(frame)
  }, [])
  const finish = (save: boolean): void => {
    const next = draft.trim()
    props.onDone(save && next && next !== props.value ? next : null)
  }
  return (
    <input
      ref={inputRef}
      value={draft}
      aria-label={translate('components.chat-conversation.renameTitle', 'Chat title')}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
          event.preventDefault()
          finish(true)
        }
        if (event.key === 'Escape') {
          event.preventDefault()
          finish(false)
        }
      }}
      className="h-7 w-[220px] min-w-0 rounded-full bg-chat-hover px-2.5 text-sm font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-chat-accent"
    />
  )
}

function HeaderMenu(props: { thread: ChatThread; onRename: () => void }): React.JSX.Element {
  const { thread } = props
  const updateChatThread = useAppStore((s) => s.updateChatThread)
  const renamingRef = useRef(false)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={`${ICON_BUTTON_CLASS} pointer-events-auto size-8`}
          aria-label={translate('auto.components.chat.sidebar.threadMenu', 'Chat menu')}
        >
          <MoreHorizontal className="size-4" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        onCloseAutoFocus={(event) => {
          // Focus returning to the trigger would blur, and so commit, the title field.
          if (renamingRef.current) {
            renamingRef.current = false
            event.preventDefault()
          }
        }}
      >
        <DropdownMenuItem
          onSelect={() => {
            renamingRef.current = true
            props.onRename()
          }}
        >
          {translate('auto.components.chat.sidebar.renameThread', 'Rename')}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => void updateChatThread(thread.id, { pinned: thread.pinned !== true })}
        >
          {thread.pinned === true ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
          {thread.pinned === true
            ? translate('auto.components.chat.sidebar.unpinThread', 'Unpin')
            : translate('auto.components.chat.sidebar.pinThread', 'Pin to top')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void regenerateChatThreadTitle(thread.id)}>
          {translate('auto.components.chat.sidebar.regenerateTitle', 'Regenerate title')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => void updateChatThread(thread.id, { archived: thread.archived !== true })}
        >
          {thread.archived === true
            ? translate('auto.components.chat.sidebar.unarchiveThread', 'Unarchive')
            : translate('auto.components.chat.sidebar.archiveThread', 'Archive')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function ChatConversationHeader(props: {
  thread: ChatThread
  workspace: ChatWorkspace | null
}): React.JSX.Element {
  const { thread } = props
  const working = useChatEngineMeta(thread.id)?.status === 'working'
  const updateChatThread = useAppStore((s) => s.updateChatThread)
  const [editing, setEditing] = useState(false)
  const title = isChatWorkspaceBriefTitle(thread.title)
    ? deriveChatThreadTitle(thread.title)
    : thread.title
  return (
    // Three columns so the pill centres on the column whatever the trailing controls hold.
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,auto)_minmax(max-content,1fr)] items-center gap-2 py-3">
      <div
        className="pointer-events-auto col-start-2 flex h-9 min-w-0 items-center gap-2 rounded-full bg-chat-raised py-0.5 pr-1 pl-1.5 shadow-chat-soft"
        title={props.workspace?.name}
      >
        <ChatWorkspaceAvatar workspace={props.workspace} size={24} working={working} />
        {editing ? (
          <TitleEditor
            value={thread.title}
            onDone={(next) => {
              setEditing(false)
              if (next) {
                void updateChatThread(thread.id, { title: next })
              }
            }}
          />
        ) : (
          <>
            <span className="min-w-0 truncate text-sm font-medium text-foreground">{title}</span>
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label={translate('components.chat-conversation.renameNamed', 'Rename {{name}}', {
                name: title
              })}
              title={translate('auto.components.chat.sidebar.renameThread', 'Rename')}
              className={`${ICON_BUTTON_CLASS} size-7`}
            >
              <Pencil className="size-3" aria-hidden />
            </button>
          </>
        )}
      </div>
      <div className="col-start-3 flex justify-self-end">
        <HeaderMenu thread={thread} onRename={() => setEditing(true)} />
      </div>
      <span role="status" className="sr-only">
        {working ? translate('auto.components.chat.sidebar.statusWorking', 'Working') : ''}
      </span>
    </div>
  )
}
