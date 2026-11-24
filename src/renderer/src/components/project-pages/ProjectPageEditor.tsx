// One open page: title, body and autosave. Keyed by page so switching pages starts fresh.
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import type React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import type { ProjectPageDocument } from '../../../../shared/project-pages-types'
import { encodeRawMarkdownHtmlForRichEditor } from '../editor/raw-markdown-html'
import { createRichMarkdownEditorCodec } from '../editor/rich-markdown-source-transport'
import {
  createPageAutosave,
  type AutosaveState,
  type PageSaveResult
} from './project-pages-autosave'
import { createProjectPagesExtensions } from './project-pages-editor-extensions'

type Props = {
  scopeKey: string
  doc: ProjectPageDocument
  /** Newest revision the tree knows about; a newer one than ours reloads a clean page. */
  latestRevision: number
  autoFocusTitle: boolean
  onSaveState: (state: AutosaveState) => void
}

export function ProjectPageEditor({
  scopeKey,
  doc,
  latestRevision,
  autoFocusTitle,
  onSaveState
}: Props): React.JSX.Element {
  const pageId = doc.meta.id
  const codec = useMemo(() => createRichMarkdownEditorCodec(), [])
  const [title, setTitle] = useState(doc.meta.title)
  const [conflict, setConflict] = useState<string | null>(null)
  const applyingRef = useRef(false)
  const bodyRef = useRef<HTMLDivElement | null>(null)
  // StrictMode builds the editor twice and the hook's value can be the discarded one; TipTap
  // tags its view's DOM node with the editor that owns it.
  const liveEditor = (): Editor | null => {
    const dom = bodyRef.current?.querySelector<HTMLElement & { editor?: Editor }>('.ProseMirror')
    const found = dom?.editor ?? null
    return found && !found.isDestroyed ? found : null
  }
  const saveStateRef = useRef(onSaveState)
  saveStateRef.current = onSaveState

  const autosave = useMemo(
    () =>
      createPageAutosave({
        revision: doc.meta.revision,
        save: async (patch, baseRevision): Promise<PageSaveResult> => {
          const result = await window.api.projectPages.update(scopeKey, pageId, {
            baseRevision,
            ...patch
          })
          return result.ok
            ? { ok: true, revision: result.value.meta.revision }
            : { ok: false, conflict: result.code === 'conflict', message: result.message }
        },
        onState: (state, message) => {
          setConflict(state === 'conflict' ? (message ?? '') : null)
          saveStateRef.current(state)
        }
      }),
    // The autosave lives as long as this page stays open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  const extensions = useMemo(
    () =>
      createProjectPagesExtensions(
        codec,
        translate(
          'auto.components.projectPages.bodyPlaceholder',
          'Start writing. Markdown shortcuts like # and - [ ] work.'
        )
      ),
    [codec]
  )

  // Created once per open page (the parent keys this component by page).
  const editor = useEditor(
    {
      extensions,
      content: encodeRawMarkdownHtmlForRichEditor(doc.markdown, codec),
      contentType: 'markdown',
      editorProps: { attributes: { class: 'rich-markdown-editor' } },
      onUpdate: ({ editor: current }) => {
        if (!applyingRef.current) {
          autosave.queue({ markdown: () => current.getMarkdown() })
        }
      }
    },
    []
  )

  // Save what is left when the page closes; the editor is still alive during this cleanup.
  useEffect(
    () => () => {
      const live = liveEditor()
      if (autosave.isDirty() && live) {
        const markdown = live.getMarkdown()
        autosave.queue({ markdown: () => markdown })
      }
      void autosave.flush()
    },
    [autosave]
  )

  async function loadStored(keepMine: boolean): Promise<void> {
    const result = await window.api.projectPages.read(scopeKey, pageId)
    const live = liveEditor()
    if (!result.ok || !live) {
      return
    }
    if (!keepMine) {
      applyingRef.current = true
      live.commands.setContent(encodeRawMarkdownHtmlForRichEditor(result.value.markdown, codec), {
        contentType: 'markdown',
        emitUpdate: false
      })
      applyingRef.current = false
      setTitle(result.value.meta.title)
    }
    await autosave.resume(result.value.meta.revision, keepMine)
  }

  // Someone else saved this page while it had no unsaved edits here: show their version.
  useEffect(() => {
    if (latestRevision > autosave.revision() && !autosave.isDirty() && !conflict) {
      void loadStored(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestRevision])

  return (
    <div className="rich-markdown-editor-shell">
      {conflict !== null ? (
        <div
          role="alert"
          className="flex shrink-0 items-center gap-2 border-b border-border bg-muted/50 px-8 py-2 text-xs"
        >
          <span className="flex-1 text-foreground">
            {translate(
              'auto.components.projectPages.conflict',
              'This page changed somewhere else while you were editing.'
            )}
          </span>
          <Button size="xs" variant="outline" onClick={() => void loadStored(false)}>
            {translate('auto.components.projectPages.useTheirs', 'Load their version')}
          </Button>
          <Button size="xs" onClick={() => void loadStored(true)}>
            {translate('auto.components.projectPages.keepMine', 'Keep mine')}
          </Button>
        </div>
      ) : null}
      <div ref={bodyRef} className="min-h-0 flex-1 overflow-auto scrollbar-editor">
        <input
          value={title}
          autoFocus={autoFocusTitle}
          aria-label={translate('auto.components.projectPages.titleLabel', 'Page title')}
          placeholder={translate('auto.components.projectPages.untitled', 'Untitled')}
          className="w-full bg-transparent px-8 pt-8 text-2xl font-semibold text-foreground outline-none placeholder:text-muted-foreground/60"
          onChange={(event) => {
            setTitle(event.target.value)
            autosave.queue({ title: event.target.value })
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              const live = liveEditor()
              if (live) {
                live.commands.setTextSelection(1)
                live.view.focus()
              }
            }
          }}
        />
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}
