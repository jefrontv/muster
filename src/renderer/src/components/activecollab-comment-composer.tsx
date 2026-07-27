import React, {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import { LoaderCircle, Send } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  getCommentBodySubmitState,
  hasBoundedCommentBodyText
} from '@/lib/comment-body-submit-state'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import type { ActiveCollabUser } from '../../../shared/activecollab-types'
import { ActiveCollabMentionMenu } from './activecollab-comment-mention-menu'
import {
  acceptActiveCollabMention,
  activeCollabCommentBodyHtml,
  activeCollabMentionPeople,
  activeCollabMentionSuggestions,
  activeCollabMentionToken,
  withActiveCollabMentionPick,
  type ActiveCollabMentionPeople,
  type ActiveCollabMentionPick
} from './activecollab-comment-mentions'

/**
 * The reply box, with @mention autocomplete.
 *
 * Enter is deliberately NOT a submit key and is only intercepted while the menu is open: this is a
 * multi-line composer whose Post action is the button, so a plain Enter has to keep typing a
 * newline. The menu takes Up/Down/Enter/Tab/Escape and nothing else.
 *
 * `projectId` narrows the suggestions to the people on the task's project — seven, against the 176
 * accounts on the instance — falling back to the full roster when that membership cannot be read.
 */
export function ActiveCollabCommentComposer({
  projectId,
  disabled,
  busy,
  onSubmit
}: {
  projectId: number | null
  disabled: boolean
  busy: boolean
  onSubmit: (bodyHtml: string) => void
}): React.JSX.Element {
  const [draft, setDraft] = useState('')
  const [caret, setCaret] = useState(0)
  const [picked, setPicked] = useState<readonly ActiveCollabMentionPick[]>([])
  const [people, setPeople] = useState<ActiveCollabMentionPeople>({ users: [], scoped: true })
  const [activeIndex, setActiveIndex] = useState(0)
  const [dismissedAt, setDismissedAt] = useState<number | null>(null)

  const listProjectMembers = useAppStore((s) => s.listActiveCollabProjectMembers)
  const listUsers = useAppStore((s) => s.listActiveCollabUsers)
  const currentUserId = useAppStore((s) => s.activeCollabStatus.connection?.userId ?? null)

  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const pendingCaret = useRef<number | null>(null)
  /** Which project the people list was last asked for; `undefined` until the first `@`. */
  const requestedFor = useRef<number | null | undefined>(undefined)
  const listboxId = useId()

  const token = useMemo(
    () => activeCollabMentionToken(draft, caret, picked),
    [draft, caret, picked]
  )
  const suggestions = useMemo(() => {
    if (token === null || token.at === dismissedAt) {
      return []
    }
    return activeCollabMentionSuggestions({
      users: people.users,
      query: token.query,
      currentUserId
    })
  }, [token, dismissedAt, people, currentUserId])
  const highlighted = Math.min(activeIndex, Math.max(suggestions.length - 1, 0))

  // The people list is fetched on the FIRST `@` and never on mount: a comment written without a
  // mention must not cost a request at all. One attempt per PROJECT — retrying a refused read on
  // every keystroke would turn one failure into a request storm, and leaving the pane is the retry
  // — but the pane reuses this component across tasks, so a new project must be read afresh rather
  // than offering the previous task's colleagues.
  useEffect(() => {
    if (token === null || requestedFor.current === projectId) {
      return
    }
    requestedFor.current = projectId
    let live = true
    void activeCollabMentionPeople({
      projectId,
      listProjectMembers: (id) => listProjectMembers(id),
      listUsers: () => listUsers()
    }).then((resolved) => {
      if (live) {
        setPeople(resolved)
      }
    })
    return () => {
      live = false
    }
  }, [token, projectId, listProjectMembers, listUsers])

  // A narrowed list must not leave the highlight pointing at whoever now occupies the old row.
  const tokenKey = token === null ? null : `${token.at}:${token.query}`
  useEffect(() => {
    setActiveIndex(0)
  }, [tokenKey])

  // React restores the caret to the end of a programmatic value change, which after a pick would
  // drop it past the rest of the draft instead of after the inserted name.
  useLayoutEffect(() => {
    const restoreTo = pendingCaret.current
    if (restoreTo === null) {
      return
    }
    pendingCaret.current = null
    const element = textareaRef.current
    if (element !== null) {
      element.focus()
      element.setSelectionRange(restoreTo, restoreTo)
    }
  }, [draft])

  const pick = useCallback(
    (user: ActiveCollabUser) => {
      if (token === null) {
        return
      }
      const next = acceptActiveCollabMention({ draft, caret, at: token.at, name: user.name })
      setDraft(next.draft)
      setCaret(next.caret)
      setPicked((current) => withActiveCollabMentionPick(current, user))
      setDismissedAt(null)
      pendingCaret.current = next.caret
    },
    [draft, caret, token]
  )

  const submit = useCallback(() => {
    const state = getCommentBodySubmitState(draft)
    if (state.status !== 'ready') {
      return
    }
    onSubmit(activeCollabCommentBodyHtml(state.body, picked))
    setDraft('')
    setCaret(0)
    // Picks are per-draft. Carrying them over would mention whoever the last comment named the
    // moment the next one happened to repeat their name.
    setPicked([])
    setDismissedAt(null)
  }, [draft, picked, onSubmit])

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (suggestions.length === 0 || event.nativeEvent.isComposing) {
        return
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActiveIndex(
          (index) => (Math.min(index, suggestions.length - 1) + 1) % suggestions.length
        )
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActiveIndex(
          (index) =>
            (Math.min(index, suggestions.length - 1) + suggestions.length - 1) % suggestions.length
        )
        return
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault()
        pick(suggestions[highlighted])
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        setDismissedAt(token?.at ?? null)
      }
    },
    [suggestions, highlighted, pick, token]
  )

  return (
    // Stacked, not side-by-side: the button used to sit `self-end` beside a two-row textarea, which
    // left it floating against the field's bottom corner aligned to nothing.
    <div className="mt-2 flex flex-col gap-2">
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value)
            setCaret(event.target.selectionStart)
          }}
          onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
          onKeyDown={onKeyDown}
          onBlur={() => setDismissedAt(token?.at ?? null)}
          placeholder={translate(
            'auto.components.activecollab.task_workspace.comment_placeholder',
            'Add an ActiveCollab comment...'
          )}
          rows={3}
          disabled={disabled}
          role="combobox"
          aria-expanded={suggestions.length > 0}
          aria-controls={suggestions.length > 0 ? listboxId : undefined}
          aria-activedescendant={
            suggestions.length > 0 ? `${listboxId}-option-${highlighted}` : undefined
          }
          aria-label={translate(
            'auto.components.activecollab.task_workspace.comment_label',
            'New comment'
          )}
          className="w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
        />
        {suggestions.length > 0 ? (
          <ActiveCollabMentionMenu
            users={suggestions}
            activeIndex={highlighted}
            listboxId={listboxId}
            scoped={people.scoped}
            onPick={pick}
          />
        ) : null}
      </div>
      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={submit}
          disabled={disabled || !hasBoundedCommentBodyText(draft)}
          className="gap-2"
        >
          {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}
          {translate('auto.components.activecollab.task_workspace.comment_submit', 'Comment')}
        </Button>
      </div>
    </div>
  )
}
