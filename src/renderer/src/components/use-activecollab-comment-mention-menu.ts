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
  activeCollabMentionSuggestions,
  type ActiveCollabMentionPeople
} from './activecollab-comment-mentions'

export type ActiveCollabCommentMentionMenu = {
  suggestions: readonly ActiveCollabUser[]
  highlighted: number
  scoped: boolean
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

  const suggestions = useMemo(() => {
    if (token === null || token.from === dismissedAt) {
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
    scoped: people.scoped,
    listboxId,
    pick,
    handleKeyDown,
    dismiss
  }
}
