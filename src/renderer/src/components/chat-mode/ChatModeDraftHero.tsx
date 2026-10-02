// Draft-first landing for the chat surface: a greeting over the same composer the
// thread uses (workspace chip, + menu, model/effort, mic). No thread exists until
// the prompt is submitted — then a thread is created and the text, with any staged
// files as references, becomes its first message (delivered by ChatThreadView).

import { FileText, X } from 'lucide-react'
import type React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { basename } from '@/lib/path'
import { formatNativeChatFileReference } from '../native-chat/native-chat-composer-target'
import { useNativeChatFileAttachmentActions } from '../native-chat/use-native-chat-file-attachment-actions'
import { useNativeChatPromptStash } from '../native-chat/use-native-chat-prompt-stash'
import { useNativeChatDictation } from '../native-chat/use-native-chat-dictation'
import { NATIVE_FILE_DROP_TARGET } from '../../../../shared/native-file-drop'
import { getVerifiedNativeChatCommands } from '../../../../shared/native-chat-agent-profiles'
import { NativeChatPickerMenu } from '../native-chat/NativeChatAutocompleteMenus'
import { useNativeChatPickerState } from '../native-chat/use-native-chat-picker-state'
import { ChatModeDraftHeroControls } from './ChatModeDraftHeroControls'
import { ChatModeHeroTaskShortcuts } from './ChatModeHeroTaskShortcuts'
import { useChatDraftPrewarm } from './use-chat-draft-prewarm'

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
  // Staged until the thread exists; they ride the first message as @ references.
  const [stagedPaths, setStagedPaths] = useState<string[]>([])
  const stagePaths = useCallback(
    (paths: string[]) => setStagedPaths((prev) => [...new Set([...prev, ...paths])]),
    []
  )
  const { pickAttachment } = useNativeChatFileAttachmentActions(stagePaths)
  const stash = useNativeChatPromptStash({ draft: text, setDraft: setText, setCaret, textareaRef })
  const dictation = useNativeChatDictation(textareaRef)

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
    const references = stagedPaths.map(formatNativeChatFileReference).join(' ')
    const prompt = [text.trim(), references].filter(Boolean).join('\n')
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
      setStagedPaths([])
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-8">
      <h1 className="mx-auto w-full max-w-3xl text-center text-2xl font-normal tracking-tight text-foreground sm:text-3xl">
        {greetingName
          ? translate('auto.components.chat.hero.greeting', 'Hey, {{value0}}', {
              value0: greetingName
            })
          : translate('components.chat-mode.hero.greetingNoName', 'Hey there')}
      </h1>
      <div
        className="relative w-full max-w-3xl rounded-lg border border-border bg-muted/50 p-1.5 shadow-xs dark:bg-input/40"
        data-contextual-tour-target="chat-thread-composer"
        data-native-file-drop-target={NATIVE_FILE_DROP_TARGET.composer}
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
        {stagedPaths.length > 0 ? (
          <div className="mb-2 flex flex-wrap items-center gap-2 px-1">
            {stagedPaths.map((path) => (
              <div
                key={path}
                className="flex max-w-full items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1.5 text-xs text-muted-foreground"
                title={path}
              >
                <FileText className="size-3.5 shrink-0" />
                <span className="max-w-56 truncate">{basename(path)}</span>
                <button
                  type="button"
                  onClick={() => setStagedPaths((prev) => prev.filter((p) => p !== path))}
                  aria-label={translate(
                    'components.native-chat.composer.removeAttachment',
                    'Remove attachment'
                  )}
                  className="flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
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
          placeholder={translate(
            'components.chat-mode.hero.placeholder',
            'How can I help you today?'
          )}
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
            if (stash.handleKeyDown(e)) {
              return
            }
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void submit()
            }
          }}
          className="scrollbar-sleek field-sizing-content max-h-64 min-h-16 w-full resize-none bg-transparent px-2 py-1 text-sm outline-none placeholder:text-muted-foreground/60 disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:min-h-20"
        />
        <ChatModeDraftHeroControls
          sendDisabled={(text.trim() === '' && stagedPaths.length === 0) || submitting}
          onSend={() => void submit()}
          stash={stash}
          onAttach={pickAttachment}
          dictation={dictation}
          workspaces={workspaces}
          selectedWorkspace={selectedWorkspace}
          onSelectWorkspace={setSelectedWorkspaceId}
          onCreateWorkspace={onCreateWorkspace}
        />
      </div>
      <ChatModeHeroTaskShortcuts />
    </div>
  )
}
