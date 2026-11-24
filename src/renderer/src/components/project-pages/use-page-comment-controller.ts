// Wires page comments to the editor: highlights, the selection bubble, ⌘⌥M and the draft thread.
import type { Editor } from '@tiptap/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  PageCommentAnchor,
  PageCommentThread
} from '../../../../shared/project-pages-comment-types'
import {
  anchorForSelection,
  PAGE_COMMENT_HIGHLIGHTS_KEY,
  pageCommentHighlights
} from './project-pages-comment-highlights'
import { usePageComments, useWholePageCommentRequests } from './use-page-comments'

export const DRAFT_THREAD_ID = '__draft'
const BUBBLE_OFFSET_PX = 36
/** Below this the column floats over the page instead of squeezing it. */
const NARROW_PX = 760

export type PageCommentDraft = { anchor: PageCommentAnchor | null }

function draftThread(anchor: PageCommentAnchor): PageCommentThread {
  return { id: DRAFT_THREAD_ID, anchor, status: 'open', createdAt: 0, updatedAt: 0, messages: [] }
}

/** Thread ids in document order, plus the anchored ones whose text is gone. */
function readOrder(editor: Editor | null): { order: string[]; missing: string[] } {
  const located = editor ? pageCommentHighlights(editor.state)?.located : undefined
  const order: { id: string; from: number }[] = []
  const missing: string[] = []
  for (const [id, range] of located ?? []) {
    if (range) {
      order.push({ id, from: range.from })
    } else {
      missing.push(id)
    }
  }
  return { order: order.sort((a, b) => a.from - b.from).map((entry) => entry.id), missing }
}

export function usePageCommentController({
  scopeKey,
  pageId,
  editor,
  rootRef
}: {
  scopeKey: string
  pageId: string
  editor: Editor | null
  rootRef: React.RefObject<HTMLElement | null>
}) {
  const { threads, actions } = usePageComments(scopeKey, pageId)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [draft, setDraft] = useState<PageCommentDraft | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [layout, setLayout] = useState<{ order: string[]; missing: string[] }>({
    order: [],
    missing: []
  })
  const [bubble, setBubble] = useState<{ top: number; left: number } | null>(null)
  const layoutKey = useRef('')
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    const root = rootRef.current
    if (!root) {
      return
    }
    const observer = new ResizeObserver(([entry]) => setNarrow(entry.contentRect.width < NARROW_PX))
    observer.observe(root)
    return () => observer.disconnect()
  }, [rootRef])

  const highlighted = useMemo(
    () => (draft?.anchor ? [...threads, draftThread(draft.anchor)] : threads),
    [threads, draft]
  )
  useEffect(() => {
    if (!editor || editor.isDestroyed || !editor.isInitialized) {
      return
    }
    const focus = draft?.anchor ? DRAFT_THREAD_ID : activeId
    editor.view.dispatch(
      editor.state.tr.setMeta(PAGE_COMMENT_HIGHLIGHTS_KEY, {
        threads: highlighted,
        activeId: focus
      })
    )
  }, [editor, highlighted, activeId, draft])

  useEffect(() => {
    if (!editor) {
      return
    }
    const sync = (): void => {
      const next = readOrder(editor)
      const key = `${next.order.join(',')}|${next.missing.join(',')}`
      if (key !== layoutKey.current) {
        layoutKey.current = key
        setLayout(next)
      }
      const { from, to, empty } = editor.state.selection
      const root = rootRef.current
      if (empty || !editor.isFocused || !root || !editor.state.doc.textBetween(from, to).trim()) {
        setBubble(null)
        return
      }
      const end = editor.view.coordsAtPos(to)
      const box = root.getBoundingClientRect()
      setBubble({
        top: Math.max(0, end.top - box.top - BUBBLE_OFFSET_PX),
        left: end.left - box.left
      })
    }
    sync()
    editor.on('transaction', sync)
    editor.on('blur', sync)
    return () => {
      editor.off('transaction', sync)
      editor.off('blur', sync)
    }
  }, [editor, rootRef])

  const startComment = useCallback(() => {
    if (!editor) {
      return
    }
    const { from, to, empty } = editor.state.selection
    setDraft({ anchor: empty ? null : anchorForSelection(editor.state.doc, from, to) })
    setCollapsed(false)
    setBubble(null)
  }, [editor])
  const startWholePage = useCallback(() => {
    setDraft({ anchor: null })
    setCollapsed(false)
  }, [])
  useWholePageCommentRequests(pageId, startWholePage)

  const isMac = navigator.userAgent.includes('Mac')
  const onKeyDownCapture = useCallback(
    (event: React.KeyboardEvent) => {
      const mod = isMac ? event.metaKey : event.ctrlKey
      if (mod && event.altKey && !event.shiftKey && event.code === 'KeyM') {
        event.preventDefault()
        event.stopPropagation()
        startComment()
      }
    },
    [isMac, startComment]
  )

  const reveal = useCallback(
    (threadId: string) => {
      setActiveId(threadId)
      const range = editor ? pageCommentHighlights(editor.state)?.located.get(threadId) : null
      if (!editor || !range) {
        return
      }
      editor.commands.setTextSelection(range)
      editor.commands.scrollIntoView()
    },
    [editor]
  )

  const submitDraft = useCallback(
    async (body: string) => {
      if (!draft || !(await actions.add(draft.anchor, body))) {
        return false
      }
      setDraft(null)
      return true
    },
    [actions, draft]
  )

  const onClick = useCallback((event: React.MouseEvent) => {
    const hit = (event.target as HTMLElement).closest<HTMLElement>('[data-comment-thread]')
    const id = hit?.dataset.commentThread
    if (id && id !== DRAFT_THREAD_ID) {
      setActiveId(id)
      setCollapsed(false)
    }
  }, [])

  return {
    threads,
    actions,
    narrow,
    onClick,
    layout,
    activeId,
    setActiveId,
    reveal,
    draft,
    submitDraft,
    cancelDraft: () => setDraft(null),
    collapsed,
    setCollapsed,
    bubble,
    startComment,
    onKeyDownCapture,
    shortcutLabel: isMac ? '⌘⌥M' : 'Ctrl+Alt+M'
  }
}

export type PageCommentController = ReturnType<typeof usePageCommentController>
