// Draft-first landing for the chat surface: a centered hero headline with a
// workspace picker plus a composer-styled textarea. No thread exists until the
// prompt is submitted — then a thread is created and the text becomes its first
// message (delivered by ChatThreadView once the session is up).

import { ChevronDown, FolderPlus } from 'lucide-react'
import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import { translate } from '@/i18n/i18n'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useAppStore } from '@/store'
import { ChatModeDraftHeroControls } from './ChatModeDraftHeroControls'

/** Radio value for the standalone (no-workspace) chat option. */
const STANDALONE = ''

export function ChatModeDraftHero({
  onCreateWorkspace
}: {
  onCreateWorkspace: () => void
}): React.JSX.Element {
  const workspaces = useAppStore((s) => s.chatWorkspaces)
  const activeChatWorkspaceId = useAppStore((s) => s.activeChatWorkspaceId)
  const createChatThread = useAppStore((s) => s.createChatThread)
  const setChatThreadFirstMessage = useAppStore((s) => s.setChatThreadFirstMessage)
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(
    () => activeChatWorkspaceId ?? workspaces[0]?.id ?? null
  )
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Follow the sidebar selection and newly created workspaces; drop a stale pick.
  useEffect(() => {
    if (activeChatWorkspaceId) {
      setSelectedWorkspaceId(activeChatWorkspaceId)
    }
  }, [activeChatWorkspaceId])
  useEffect(() => {
    if (selectedWorkspaceId && !workspaces.some((w) => w.id === selectedWorkspaceId)) {
      setSelectedWorkspaceId(workspaces[0]?.id ?? null)
    }
  }, [workspaces, selectedWorkspaceId])

  const selectedWorkspace = workspaces.find((w) => w.id === selectedWorkspaceId) ?? null

  const submit = async (): Promise<void> => {
    const prompt = text.trim()
    if (prompt === '' || submitting) {
      return
    }
    setSubmitting(true)
    try {
      const thread = await createChatThread(selectedWorkspace?.id ?? null)
      if (thread) {
        // Delivered (and echoed) by ChatThreadView once the session launches.
        setChatThreadFirstMessage(thread.id, prompt)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-8">
      <h1 className="mx-auto w-full max-w-2xl text-center text-2xl font-normal tracking-tight text-foreground sm:text-3xl">
        {translate('auto.components.chat.hero.headlinePrefix', 'What should we build in')}{' '}
        <DropdownMenu>
          <DropdownMenuTrigger
            className="inline-block max-w-64 cursor-pointer truncate border-b border-dotted border-foreground/60 align-bottom text-foreground transition-colors hover:border-foreground/80 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title={selectedWorkspace?.name}
          >
            {selectedWorkspace?.name ??
              translate('auto.components.chat.hero.noWorkspace', 'a new chat')}
            <ChevronDown className="ml-1 inline size-4 align-middle text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="max-h-80 w-64 overflow-y-auto">
            <DropdownMenuRadioGroup
              value={selectedWorkspace?.id ?? STANDALONE}
              onValueChange={(value) => setSelectedWorkspaceId(value === STANDALONE ? null : value)}
            >
              {workspaces.map((workspace) => (
                <DropdownMenuRadioItem key={workspace.id} value={workspace.id}>
                  <span className="min-w-0 truncate">{workspace.name}</span>
                </DropdownMenuRadioItem>
              ))}
              <DropdownMenuRadioItem value={STANDALONE}>
                {translate('auto.components.chat.hero.standalone', 'No workspace')}
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onCreateWorkspace}>
              <FolderPlus className="size-4" />
              {translate('auto.components.chat.hero.newWorkspace', 'New workspace…')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        ?
      </h1>
      <div className="w-full max-w-2xl rounded-xl border border-border bg-muted/50 p-1.5 shadow-xs backdrop-blur dark:bg-input/40">
        <textarea
          ref={textareaRef}
          value={text}
          rows={3}
          autoFocus
          disabled={submitting}
          placeholder={translate('auto.components.chat.hero.placeholder', 'Ask anything…')}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              void submit()
            }
          }}
          className="scrollbar-sleek max-h-40 min-h-16 w-full resize-none bg-transparent px-2 py-1 text-sm outline-none placeholder:text-muted-foreground/60 disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:min-h-20"
        />
        <ChatModeDraftHeroControls
          sendDisabled={text.trim() === '' || submitting}
          onSend={() => void submit()}
        />
      </div>
    </div>
  )
}
