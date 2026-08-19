// Draft-first landing for the chat surface: a centered hero headline with a
// workspace picker plus a composer-styled textarea. No thread exists until the
// prompt is submitted — then a thread is created and the text becomes its first
// message (delivered by ChatThreadView once the session is up).

import { ChevronDown, FolderPlus } from 'lucide-react'
import type React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
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
import { getVerifiedNativeChatCommands } from '../../../../shared/native-chat-agent-profiles'
import { NativeChatPickerMenu } from '../native-chat/NativeChatAutocompleteMenus'
import { useNativeChatPickerState } from '../native-chat/use-native-chat-picker-state'
import { ChatModeDraftHeroControls } from './ChatModeDraftHeroControls'
import { ChatModeHeroTaskShortcuts } from './ChatModeHeroTaskShortcuts'
import { useChatDraftPrewarm } from './use-chat-draft-prewarm'

/** Radio value for the standalone (no-workspace) chat option. */
const STANDALONE = ''

/** Fetched once per app run; undefined = not asked yet (distinct from "no name"). */
let greetingNameCache: string | null | undefined

function useGreetingName(): string | null {
  const [name, setName] = useState<string | null>(greetingNameCache ?? null)
  useEffect(() => {
    if (greetingNameCache !== undefined) {
      return
    }
    let cancelled = false
    void window.api.chatMode
      .getGreetingName?.()
      .then((resolved) => {
        greetingNameCache = resolved
        if (!cancelled) {
          setName(resolved)
        }
      })
      .catch(() => {
        greetingNameCache = null
      })
    return () => {
      cancelled = true
    }
  }, [])
  return name
}

export function ChatModeDraftHero({
  onCreateWorkspace
}: {
  onCreateWorkspace: () => void
}): React.JSX.Element {
  const workspaces = useAppStore((s) => s.chatWorkspaces)
  const activeChatWorkspaceId = useAppStore((s) => s.activeChatWorkspaceId)
  const createChatThread = useAppStore((s) => s.createChatThread)
  const setChatThreadFirstMessage = useAppStore((s) => s.setChatThreadFirstMessage)
  const setActiveChatThread = useAppStore((s) => s.setActiveChatThread)
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(
    () => activeChatWorkspaceId ?? workspaces[0]?.id ?? null
  )
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const greetingName = useGreetingName()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [caret, setCaret] = useState(0)
  const [activeSuggestion, setActiveSuggestion] = useState(0)
  // Boots the agent while the draft is still being typed; submit adopts it.
  const prewarm = useChatDraftPrewarm({ draft: text, workspaceId: selectedWorkspaceId })

  // Same slash-command/skill picker as the thread composer. New threads always
  // launch Claude, and the draft has no pane yet, so skills scan the home roots.
  // Completing an item only inserts text — the command runs as the thread's
  // first message once the session is up, exactly as if typed there.
  const agentCommands = useMemo(() => getVerifiedNativeChatCommands('claude'), [])
  const picker = useNativeChatPickerState({
    agent: 'claude',
    terminalTabId: '',
    draftScopeKey: 'chat-draft-hero',
    draft: text,
    caret,
    agentCommands,
    textareaRef,
    setDraft: setText,
    setCaret,
    setActiveSuggestion,
    skillScope: 'home'
  })
  const { autocomplete } = picker
  const pickerOpen = autocomplete.mode === 'slash' || autocomplete.mode === 'skill'

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
      // The pre-warmed thread already has a session running; falling back keeps
      // a failed or not-yet-ready warm-up from blocking the send.
      const warmed = prewarm.claim()
      const thread = warmed ?? (await createChatThread(selectedWorkspace?.id ?? null))
      if (!thread) {
        return
      }
      if (warmed) {
        setActiveChatThread(warmed.id)
      }
      // Delivered (and echoed) by ChatThreadView once the session launches.
      setChatThreadFirstMessage(thread.id, prompt)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-8">
      <div className="flex w-full flex-col gap-1.5">
        {greetingName ? (
          <p className="mx-auto w-full max-w-2xl text-center text-2xl font-normal tracking-tight text-muted-foreground sm:text-3xl">
            {translate('auto.components.chat.hero.greeting', 'Hey, {{value0}}', {
              value0: greetingName
            })}
          </p>
        ) : null}
        <h1 className="mx-auto w-full max-w-4xl text-center text-2xl font-normal tracking-tight text-foreground sm:text-3xl">
          {translate('auto.components.chat.hero.headlinePrefix', 'What should we work on in')}{' '}
          <span className="whitespace-nowrap">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <span
                  className="cursor-pointer border-b border-dotted border-foreground/60 text-foreground outline-none transition-colors hover:border-foreground/80 focus:outline-none focus-visible:outline-none"
                  title={selectedWorkspace?.name}
                >
                  {selectedWorkspace?.name ??
                    translate('auto.components.chat.hero.noWorkspace', 'a new chat')}
                  <ChevronDown className="ml-1 inline size-4 align-baseline text-muted-foreground" />
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="max-h-80 w-64 overflow-y-auto">
                <DropdownMenuRadioGroup
                  value={selectedWorkspace?.id ?? STANDALONE}
                  onValueChange={(value) =>
                    setSelectedWorkspaceId(value === STANDALONE ? null : value)
                  }
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
          </span>
        </h1>
      </div>
      <div
        className="relative w-full max-w-2xl rounded-xl border border-border bg-muted/50 p-1.5 shadow-xs backdrop-blur dark:bg-input/40"
        data-contextual-tour-target="chat-thread-composer"
      >
        {pickerOpen ? (
          <NativeChatPickerMenu
            autocomplete={autocomplete}
            activeIndex={activeSuggestion}
            listboxId={picker.listboxId}
            onChoose={picker.completeItem}
            onRetry={picker.retrySkills}
          />
        ) : null}
        <textarea
          ref={textareaRef}
          value={text}
          rows={3}
          autoFocus
          disabled={submitting}
          role="combobox"
          aria-expanded={pickerOpen}
          aria-controls={pickerOpen ? picker.listboxId : undefined}
          placeholder={translate('auto.components.chat.hero.placeholder', 'Ask anything…')}
          onChange={(e) => {
            setText(e.target.value)
            const nextCaret = e.target.selectionStart ?? e.target.value.length
            setCaret(nextCaret)
            picker.handleDraftOrCaretChange(e.target.value, nextCaret)
            setActiveSuggestion(0)
          }}
          onSelect={(e) => {
            const el = e.currentTarget
            const nextCaret = el.selectionStart ?? el.value.length
            setCaret(nextCaret)
            picker.handleDraftOrCaretChange(el.value, nextCaret)
            setActiveSuggestion(0)
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing || e.keyCode === 229) {
              // IME Enter confirms composition; falling through would accept a
              // picker row or submit a partial draft.
              if (e.key === 'Enter') {
                e.preventDefault()
              }
              return
            }
            if (pickerOpen) {
              const items = autocomplete.items
              if (e.key === 'ArrowDown' && items.length > 0) {
                e.preventDefault()
                setActiveSuggestion((index) => (index + 1) % items.length)
                return
              }
              if (e.key === 'ArrowUp' && items.length > 0) {
                e.preventDefault()
                setActiveSuggestion((index) => (index - 1 + items.length) % items.length)
                return
              }
              if ((e.key === 'Enter' || e.key === 'Tab') && items.length > 0) {
                e.preventDefault()
                picker.completeItem(items[activeSuggestion] ?? items[0])
                return
              }
              if (e.key === 'Escape') {
                e.preventDefault()
                picker.dismiss(autocomplete.triggerKey)
                return
              }
            }
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void submit()
            }
          }}
          className="scrollbar-sleek field-sizing-content max-h-64 min-h-16 w-full resize-none bg-transparent px-2 py-1 text-sm outline-none placeholder:text-muted-foreground/60 disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:min-h-20"
        />
        <ChatModeDraftHeroControls
          sendDisabled={text.trim() === '' || submitting}
          onSend={() => void submit()}
        />
      </div>
      <ChatModeHeroTaskShortcuts />
    </div>
  )
}
