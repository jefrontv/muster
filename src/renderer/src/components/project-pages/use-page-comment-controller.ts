// Wires page comments to the editor: highlights, the note box, ⌘⌥M and Mod+Shift+A (annotate).
// The note box is the plan review's own (PlanReviewNotePopover), so pages take notes like reviews.
import type { Editor } from '@tiptap/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PlanAnnotationKind } from '../../../../shared/plan-annotation-types'
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
import { useOpenNoteOnMouseSelection } from './page-review-note-selection'
import { setPageAnnotateMode, usePageAnnotateMode } from './page-annotate-mode'
import { roundStart, roundThreads } from '../plan-annotation/page-review-result'
import { editorShortcutMatches } from '../editor/editor-shortcuts'
import { getRichMarkdownAnnotationTarget } from '../editor/rich-markdown-review-annotations'
import { flushPendingProseMirrorSelection } from '../editor/rich-markdown-selection-flush'
import {
  placeNoteBelowSelection,
  type PlanNoteDraft
} from '../plan-annotation/use-plan-review-annotations'
import { usePlanReviewFront } from '../plan-annotation/use-plan-review-queue'

export const DRAFT_THREAD_ID = '__draft'
/** Below this the column floats over the page instead of squeezing it. */
const NARROW_PX = 760
const NOTE_WIDTH_PX = 420
const WHOLE_PAGE_NOTE_TOP_PX = 56

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
  const { threads: allThreads, actions } = usePageComments(scopeKey, pageId)
  const { current } = usePlanReviewFront()
  const inReview = current?.page?.scopeKey === scopeKey && current.page.pageId === pageId
  const inReviewRef = useRef(inReview)
  inReviewRef.current = inReview
  // Under review, this round's threads are review notes (ProjectPageReviewNotes draws them).
  const { threads, reviewThreads } = useMemo(() => {
    if (!inReview || !current) {
      return { threads: allThreads, reviewThreads: [] }
    }
    const round = roundThreads(allThreads, roundStart(current))
    const ids = new Set(round.map((t) => t.id))
    return { threads: allThreads.filter((t) => !ids.has(t.id)), reviewThreads: round }
  }, [allThreads, current, inReview])
  /** Filled by the review notes while they are mounted. */
  const reviewRef = useRef<{
    openPassage: (selectionOnly: boolean) => boolean
    openWhole: () => void
  } | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [draft, setDraft] = useState<PageCommentDraft | null>(null)
  const [note, setNote] = useState<PlanNoteDraft | null>(null)
  const noteRef = useRef(note)
  noteRef.current = note
  const [collapsed, setCollapsed] = useState(false)
  const [layout, setLayout] = useState<{ order: string[]; missing: string[] }>({
    order: [],
    missing: []
  })
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
    }
    sync()
    editor.on('transaction', sync)
    return () => {
      editor.off('transaction', sync)
    }
  }, [editor])

  const startWholePage = useCallback(() => {
    if (inReviewRef.current) {
      reviewRef.current?.openWhole()
      return
    }
    const width = rootRef.current?.getBoundingClientRect().width ?? 0
    setNote({
      scope: 'whole-plan',
      top: WHOLE_PAGE_NOTE_TOP_PX,
      left: Math.max(WHOLE_PAGE_NOTE_TOP_PX, width - NOTE_WIDTH_PX - 24)
    })
    setDraft({ anchor: null })
  }, [rootRef])
  useWholePageCommentRequests(pageId, startWholePage)

  /** Opens the note box on the selection, or on the whole page when nothing is selected. */
  const startComment = useCallback(
    (selectionOnly = false): boolean => {
      if (inReviewRef.current) {
        return reviewRef.current?.openPassage(selectionOnly) ?? false
      }
      const root = rootRef.current
      if (!editor || !root) {
        return false
      }
      if (noteRef.current) {
        return true
      }
      flushPendingProseMirrorSelection(editor)
      const target = getRichMarkdownAnnotationTarget(editor, root)
      if (!target) {
        if (!selectionOnly) {
          startWholePage()
        }
        return !selectionOnly
      }
      const place = placeNoteBelowSelection(root)
      setNote({
        scope: 'passage',
        target: place ? { ...target, top: place.top, left: place.left } : target,
        flipHeight: place?.flipHeight ?? 0
      })
      setDraft({ anchor: anchorForSelection(editor.state.doc, target.from, target.to) })
      return true
    },
    [editor, rootRef, startWholePage]
  )

  const annotate = usePageAnnotateMode()
  useOpenNoteOnMouseSelection(rootRef, editor, startComment, inReview || annotate)

  const isMac = navigator.userAgent.includes('Mac')
  const onKeyDownCapture = useCallback(
    (event: React.KeyboardEvent) => {
      const mod = isMac ? event.metaKey : event.ctrlKey
      const pageKey = mod && event.altKey && !event.shiftKey && event.code === 'KeyM'
      // The plan review's add-note shortcut (Mod+Shift+A) opens the same box on any page.
      const reviewKey = editorShortcutMatches('editor.addReviewNote', event.nativeEvent)
      if ((!pageKey && !reviewKey) || event.repeat) {
        return
      }
      // Plain pages: Mod+Shift+A turns annotate on, opens on a selection, or turns it off.
      const plainReviewKey = reviewKey && !pageKey && !inReviewRef.current
      if (plainReviewKey && !annotate) {
        setPageAnnotateMode(true)
      } else if (!startComment(reviewKey && !pageKey)) {
        if (!plainReviewKey) {
          return
        }
        setPageAnnotateMode(false)
      }
      event.preventDefault()
      event.stopPropagation()
    },
    [annotate, isMac, startComment]
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

  const cancelDraft = useCallback(() => {
    setDraft(null)
    setNote(null)
  }, [])
  const submitNote = useCallback(
    (kind: PlanAnnotationKind, body: string, attachments: string[]) => {
      const anchor = draft?.anchor ?? null
      const pageKind = anchor && (kind === 'delete' || kind === 'looks_good') ? kind : undefined
      void actions.add(anchor, body, attachments, pageKind).then((ok) => {
        if (ok) {
          cancelDraft()
          window.getSelection()?.removeAllRanges()
        }
      })
    },
    [actions, cancelDraft, draft]
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
    note,
    inReview,
    reviewThreads,
    reviewRef,
    submitNote,
    cancelDraft,
    collapsed,
    setCollapsed,
    startComment,
    onKeyDownCapture,
    shortcutLabel: isMac ? '⌘⌥M' : 'Ctrl+Alt+M'
  }
}

export type PageCommentController = ReturnType<typeof usePageCommentController>
