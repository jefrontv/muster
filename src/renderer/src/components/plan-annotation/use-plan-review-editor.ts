// The rich editor instance a plan is reviewed in: the markdown viewer's extension set and codec,
// without the worktree file model (autosave, source reconciliation, doc links) a plan lacks.

import { useMemo, useRef, type MutableRefObject } from 'react'
import { useEditor, type Editor } from '@tiptap/react'
import { createRichMarkdownExtensions } from '../editor/rich-markdown-extensions'
import { createRichMarkdownEditorCodec } from '../editor/rich-markdown-source-transport'
import { editorShortcutMatches } from '../editor/editor-shortcuts'
import { getRichMarkdownCommentAtPos } from '../editor/rich-markdown-review-annotations'
import type { DiffComment } from '../../../../shared/types'

export type PlanReviewEditorCallbacks = {
  /** The document as this editor serialises it, before anyone types. */
  onReady: (markdown: string) => void
  onChange: (markdown: string) => void
  onSelectionChange: (editor: Editor) => void
  onBlur: () => void
  openPassageDraft: (requireLiveSelection: boolean) => boolean
  scrollCardIntoView: (commentId: string) => void
}

function openExternalLink(event: MouseEvent): boolean {
  const isMac = navigator.userAgent.includes('Mac')
  if (!(isMac ? event.metaKey : event.ctrlKey)) {
    return false
  }
  const anchor = (event.target as HTMLElement | null)?.closest('a[href]')
  const href = anchor?.getAttribute('href') ?? ''
  if (!/^https?:\/\//i.test(href)) {
    return false
  }
  void window.api.shell.openUrl(href)
  return true
}

export function usePlanReviewEditor({
  content,
  callbacks,
  commentsRef
}: {
  /** Read once: a later prop change must not blow away in-progress typing. */
  content: string
  callbacks: PlanReviewEditorCallbacks
  commentsRef: MutableRefObject<readonly DiffComment[]>
}): { editor: Editor | null; editorRef: MutableRefObject<Editor | null> } {
  const codec = useMemo(() => createRichMarkdownEditorCodec(), [])
  const extensions = useMemo(() => createRichMarkdownExtensions({ codec }), [codec])
  const editorRef = useRef<Editor | null>(null)
  // ProseMirror keeps its first handler closures, so every callback is read through this ref.
  const callbacksRef = useRef(callbacks)
  callbacksRef.current = callbacks

  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions,
      content,
      contentType: 'markdown',
      editorProps: {
        attributes: { class: 'rich-markdown-editor' },
        handleKeyDown: (_view, event) => {
          if (!editorShortcutMatches('editor.addReviewNote', event) || event.repeat) {
            return false
          }
          if (!callbacksRef.current.openPassageDraft(true)) {
            return false
          }
          event.preventDefault()
          return true
        },
        handleClick: (_view, pos, event) => {
          if (openExternalLink(event)) {
            return true
          }
          const live = editorRef.current
          const hit = live ? getRichMarkdownCommentAtPos(live, commentsRef.current, 0, pos) : null
          if (hit) {
            callbacksRef.current.scrollCardIntoView(hit.id)
          }
          return false
        }
      },
      onCreate: ({ editor: created }) => {
        editorRef.current = created
        callbacksRef.current.onReady(created.getMarkdown())
      },
      onUpdate: ({ editor: updated }) => callbacksRef.current.onChange(updated.getMarkdown()),
      onSelectionUpdate: ({ editor: updated }) => callbacksRef.current.onSelectionChange(updated),
      onFocus: () => window.api.ui.setMarkdownEditorFocused(true),
      onBlur: () => {
        window.api.ui.setMarkdownEditorFocused(false)
        callbacksRef.current.onBlur()
      },
      onDestroy: () => {
        editorRef.current = null
        window.api.ui.setMarkdownEditorFocused(false)
      }
    },
    []
  )
  editorRef.current = editor
  return { editor, editorRef }
}
