// The @mention picker's state: what token is open, who can be offered for it, and which row the
// keyboard is on. Split out of the composer so the composer stays about composing.

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'

import { useAppStore } from '@/store'
import type { ActiveCollabUser } from '../../../shared/activecollab-types'
import {
  activeCollabEditorMentionToken,
  insertActiveCollabMention,
  sameActiveCollabMentionRange,
  type ActiveCollabMentionRange
} from './activecollab-comment-mention-document'
import {
  activeCollabMentionPeople,
  activeCollabMentionSuggestionsWithFallback,
  type ActiveCollabMentionPeople
} from './activecollab-comment-mentions'

export type ActiveCollabCommentMentionMenu = {
  suggestions: readonly ActiveCollabUser[]
  highlighted: number
  scoped: boolean
  /** True when these came from the wider roster because no project member matched the query. */
  widened: boolean
  listboxId: string
  pick: (user: ActiveCollabUser) => void
  /** True when the key was consumed by the menu, which is also ProseMirror's "stop here". */
  handleKeyDown: (event: KeyboardEvent) => boolean
  dismiss: () => void
}

export function useActiveCollabCommentMentionMenu({
  editor,
  projectId
}: {
  editor: Editor | null
  projectId: number | null
}): ActiveCollabCommentMentionMenu {
  const [token, setToken] = useState<ActiveCollabMentionRange | null>(null)
  const [people, setPeople] = useState<ActiveCollabMentionPeople>({ users: [], scoped: true })
  /** The whole-instance roster, fetched only once a query matches nobody on the project. */
  const [roster, setRoster] = useState<readonly ActiveCollabUser[] | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [dismissedAt, setDismissedAt] = useState<number | null>(null)

  const listProjectMembers = useAppStore((s) => s.listActiveCollabProjectMembers)
  const listUsers = useAppStore((s) => s.listActiveCollabUsers)
  const currentUserId = useAppStore((s) => s.activeCollabStatus.connection?.userId ?? null)

  /** Which project the people list was last asked for; `undefined` until the first `@`. */
  const requestedFor = useRef<number | null | undefined>(undefined)
  const listboxId = useId()

  // Every transaction can move the caret or change the text, and those are the only two things that
  // can open or close a token. Bailing on an unchanged token keeps a plain cursor move from
  // re-rendering the menu.
  //
  // Blur is NOT a resync — losing focus changes neither the caret nor the text, so a resync would
  // leave the menu hanging open over the thread underneath. It is a dismissal, and it reads the
  // token through a ref because the listener outlives the render that registered it.
  const tokenRef = useRef<ActiveCollabMentionRange | null>(null)
  tokenRef.current = token
  useEffect(() => {
    if (editor === null) {
      return
    }
    const sync = (): void => {
      const next = activeCollabEditorMentionToken(editor)
      setToken((current) => (sameActiveCollabMentionRange(current, next) ? current : next))
      if (next === null) {
        // Nothing is open, so a remembered dismissal can no longer describe anything; keeping it
        // would let a later token that happens to start at the same position open pre-dismissed.
        setDismissedAt(null)
      }
    }
    const dismissOnBlur = (): void => {
      setDismissedAt(tokenRef.current?.from ?? null)
    }
    sync()
    editor.on('transaction', sync)
    editor.on('blur', dismissOnBlur)
    return () => {
      editor.off('transaction', sync)
      editor.off('blur', dismissOnBlur)
    }
  }, [editor])

  const resolved = useMemo(() => {
    if (token === null || token.from === dismissedAt) {
      return { users: [], scoped: true } as ActiveCollabMentionPeople
    }
    return activeCollabMentionSuggestionsWithFallback({
      members: people.users,
      // The roster is the fallback only when this list IS the project's; when the members read
      // already fell back, `people.users` is the roster and there is nothing wider to try.
      roster: people.scoped ? roster : null,
      query: token.query,
      currentUserId
    })
  }, [token, dismissedAt, people, roster, currentUserId])
  const suggestions = resolved.users
  const highlighted = Math.min(activeIndex, Math.max(suggestions.length - 1, 0))

  // Fetch the wider roster only once a real query has matched nobody on the project. A menu that
  // silently shows nothing is indistinguishable from a broken one, which is how this read to
  // someone mentioning a colleague who is not a member of the task's project.
  const rosterRequested = useRef(false)
  useEffect(() => {
    if (
      token === null ||
      token.query.trim() === '' ||
      suggestions.length > 0 ||
      roster !== null ||
      rosterRequested.current ||
      !people.scoped
    ) {
      return
    }
    rosterRequested.current = true
    let live = true
    void listUsers().then((result) => {
      if (live && result.ok) {
        setRoster(result.value)
      }
    })
    return () => {
      live = false
    }
  }, [token, suggestions.length, roster, people.scoped, listUsers])

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
    // A new project means a new member list, so a roster fetched for the previous one no longer
    // describes what is missing from this one.
    rosterRequested.current = false
    setRoster(null)
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
  const tokenKey = token === null ? null : `${token.from}:${token.query}`
  useEffect(() => {
    setActiveIndex(0)
  }, [tokenKey])

  const pick = useCallback(
    (user: ActiveCollabUser) => {
      if (editor === null || token === null) {
        return
      }
      insertActiveCollabMention(editor, token, user)
      setDismissedAt(null)
    },
    [editor, token]
  )

  const dismiss = useCallback(() => {
    setDismissedAt(token?.from ?? null)
  }, [token])

  const handleKeyDown = useCallback(
    (event: KeyboardEvent): boolean => {
      if (suggestions.length === 0 || event.isComposing) {
        return false
      }
      if (event.key === 'ArrowDown') {
        setActiveIndex(
          (index) => (Math.min(index, suggestions.length - 1) + 1) % suggestions.length
        )
        return true
      }
      if (event.key === 'ArrowUp') {
        setActiveIndex(
          (index) =>
            (Math.min(index, suggestions.length - 1) + suggestions.length - 1) % suggestions.length
        )
        return true
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        pick(suggestions[highlighted])
        return true
      }
      if (event.key === 'Escape') {
        dismiss()
        return true
      }
      return false
    },
    [suggestions, highlighted, pick, dismiss]
  )

  return {
    suggestions,
    highlighted,
    // Unscoped either way: the members read may have failed outright, or it may have succeeded and
    // simply matched nobody. Both mean the names on screen are not this project's, and only the
    // second is a `widened` one — the footer says which.
    scoped: people.scoped && resolved.scoped,
    widened: !resolved.scoped,
    listboxId,
    pick,
    handleKeyDown,
    dismiss
  }
}
