// A page under plan review takes notes through the markdown plan review's own annotation hook:
// this round's comment threads are its notes, and a new note is saved as a thread.
import type { Editor } from '@tiptap/react'
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import type { PageCommentThread } from '../../../../shared/project-pages-comment-types'
import type { DraftNote } from '../plan-annotation/plan-annotation-notes'
import { linesOf } from '../plan-annotation/page-review-result'
import { usePlanReviewAnnotations } from '../plan-annotation/use-plan-review-annotations'
import { anchorForSelection } from './project-pages-comment-highlights'
import type { PageCommentActions } from './use-page-comments'

function threadNote(thread: PageCommentThread, markdown: string): DraftNote {
  const [first] = thread.messages
  const base = { id: thread.id, body: first?.body ?? '', attachments: first?.attachments }
  if (!thread.anchor) {
    return { ...base, kind: 'global', quote: '', startLine: 0, endLine: 0 }
  }
  const quote = thread.anchor.quote
  return { ...base, kind: thread.kind ?? 'comment', quote, ...linesOf(markdown, quote) }
}

export function usePageReviewNotes({
  editor,
  threads,
  actions,
  rootRef,
  scrollRef
}: {
  editor: Editor | null
  /** This round's threads. */
  threads: readonly PageCommentThread[]
  actions: PageCommentActions
  rootRef: MutableRefObject<HTMLDivElement | null>
  scrollRef: MutableRefObject<HTMLDivElement | null>
}) {
  const editorRef = useRef<Editor | null>(editor)
  editorRef.current = editor
  const [markdown, setMarkdown] = useState(() => editor?.getMarkdown() ?? '')
  useEffect(() => {
    if (!editor) {
      return
    }
    let frame = 0
    const update = (): void => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => setMarkdown(editor.getMarkdown()))
    }
    update()
    editor.on('update', update)
    return () => {
      window.cancelAnimationFrame(frame)
      editor.off('update', update)
    }
  }, [editor])

  const notes = useMemo(() => threads.map((t) => threadNote(t, markdown)), [threads, markdown])
  const annotationsRef = useRef<ReturnType<typeof usePlanReviewAnnotations> | null>(null)
  const annotations = usePlanReviewAnnotations({
    editor,
    editorRef,
    markdown,
    notes,
    rootRef,
    scrollContainerRef: scrollRef,
    onAddNote: (note) => {
      // Read before the hook clears its draft: the note itself carries lines, not positions.
      const open = annotationsRef.current?.draft
      const live = editorRef.current
      const anchor =
        open?.scope === 'passage' && live
          ? anchorForSelection(live.state.doc, open.target.from, open.target.to)
          : null
      const kind = note.kind === 'delete' || note.kind === 'looks_good' ? note.kind : undefined
      void actions.add(anchor, note.body, note.attachments, anchor ? kind : undefined)
    }
  })
  annotationsRef.current = annotations

  const removeNote = (id: string): void => void actions.remove(id)
  /** Threads keep their first message, so an edit re-files the note with the new text. */
  const updateNote = async (id: string, body: string): Promise<boolean> => {
    const thread = threads.find((t) => t.id === id)
    if (
      !thread ||
      !(await actions.add(thread.anchor, body, thread.messages[0]?.attachments, thread.kind))
    ) {
      return false
    }
    return actions.remove(id)
  }
  return { annotations, markdown, removeNote, updateNote }
}
