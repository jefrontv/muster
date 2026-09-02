// Editing the plan as the rendered document rather than as raw markdown source.
//
// Why not a textarea: a reviewer who wants to fix a sentence should not have to change surface,
// lose the headings and tables they were reading, and hand-maintain pipe alignment. This mounts the
// app's own rich-markdown extension set, so the text keeps rendering while it is edited and the
// result serialises back to markdown.
//
// Why not RichMarkdownEditor: that component is bound to a file model — worktree, path, diff
// comments, doc links — none of which a plan handed over by an agent has. Only the extension set
// and the codec are reusable, and they are the parts that matter for fidelity.

import type React from 'react'
import { useEffect, useMemo, useRef } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import { createRichMarkdownExtensions } from '../editor/rich-markdown-extensions'
import { createRichMarkdownEditorCodec } from '../editor/rich-markdown-source-transport'

export function PlanAnnotationEditor({
  content,
  onReady,
  onChange
}: {
  content: string
  /**
   * The document as this editor serialises it, before anyone types.
   *
   * Why it matters: a markdown round trip normalises things nobody edited — list bullets, table
   * padding, a trailing newline. Diffing the reviewer's result against the file on disk would
   * report all of that as their work. The agent must be told what a person actually changed, so
   * every comparison is made against this baseline instead.
   */
  onReady: (baseline: string) => void
  onChange: (markdown: string) => void
}): React.JSX.Element {
  const codec = useMemo(() => createRichMarkdownEditorCodec(), [])
  const extensions = useMemo(() => createRichMarkdownExtensions({ codec }), [codec])

  // Held in refs so a re-render never rebuilds the editor: doing so would drop the caret mid-word.
  const readyRef = useRef(onReady)
  const changeRef = useRef(onChange)
  useEffect(() => {
    readyRef.current = onReady
    changeRef.current = onChange
  }, [onReady, onChange])

  const editor = useEditor(
    {
      extensions,
      content,
      contentType: 'markdown',
      autofocus: 'start',
      onCreate: ({ editor: created }) => readyRef.current(created.getMarkdown()),
      onUpdate: ({ editor: updated }) => changeRef.current(updated.getMarkdown())
    },
    // Deliberately built once. `content` is the plan as it stood when edit mode opened; a later
    // prop change must not blow away in-progress typing.
    []
  )

  return (
    <EditorContent editor={editor} className="plan-annotation-document plan-annotation-editable" />
  )
}
