// One open page: title, body and autosave. Keyed by page so switching pages starts fresh.
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import type React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { toast } from 'sonner'
import { mergeMarkdownBlocks } from '../../../../shared/project-pages-block-merge'
import type {
  ProjectPageAuthor,
  ProjectPageDocument,
  ProjectPageMeta
} from '../../../../shared/project-pages-types'
import { PAGE_LINK_SCHEME } from '../../../../shared/project-pages-plain-text'
import { encodeRawMarkdownHtmlForRichEditor } from '../editor/raw-markdown-html'
import { createRichMarkdownEditorCodec } from '../editor/rich-markdown-source-transport'
import {
  createPageAutosave,
  type AutosaveState,
  type PageSaveResult
} from './project-pages-autosave'
import { createProjectPagesExtensions } from './project-pages-editor-extensions'
import { replaceEditorMarkdown } from './project-pages-editor-sync'
import { ProjectPagesEditorMenus } from './ProjectPagesEditorMenus'
import { createDiagramPage } from './project-pages-diagram-embeds'
import { pageSlashCommands } from './project-pages-slash-items'
import { imageFiles, insertPageImages, pickPageImages } from './project-pages-files'
import { PAGE_FILE_DROP_PROPS, useProjectPageFileDrop } from './use-project-page-file-drop'
import { RichMarkdownEmojiMenu } from '../editor/RichMarkdownEmojiMenu'
import { useProjectPagesEditorMenus } from './use-project-pages-editor-menus'

type Props = {
  scopeKey: string
  doc: ProjectPageDocument
  /** Newest revision the tree knows about; a newer one than ours reloads a clean page. */
  latestRevision: number
  /** Who saved latestRevision, so an agent's change can be named. */
  latestAuthor?: ProjectPageAuthor
  autoFocusTitle: boolean
  /** Pages in this space, for the [[ link menu. */
  pages: ProjectPageMeta[]
  onOpenPage: (pageId: string) => void
  onSaveState: (state: AutosaveState) => void
  /** Rendered under the body, inside the scroll area. */
  footer?: React.ReactNode
  /** Rendered between the title and the body. */
  afterTitle?: React.ReactNode
  /** Offered as "Database" in the / menu; database pages pass none. */
  onMakeDatabase?: () => void
  /** A #tag in the text was clicked. */
  onOpenTag?: (tag: string) => void
}

export function ProjectPageEditor({
  scopeKey,
  doc,
  latestRevision,
  latestAuthor,
  autoFocusTitle,
  pages,
  onOpenPage,
  onSaveState,
  footer,
  afterTitle,
  onMakeDatabase,
  onOpenTag
}: Props): React.JSX.Element {
  const pageId = doc.meta.id
  const codec = useMemo(() => createRichMarkdownEditorCodec(), [])
  const [title, setTitle] = useState(doc.meta.title)
  const [conflict, setConflict] = useState<string | null>(null)
  const makeDatabaseRef = useRef(onMakeDatabase)
  makeDatabaseRef.current = onMakeDatabase
  const canMakeDatabase = Boolean(onMakeDatabase)
  const extraCommands = useMemo(
    () =>
      pageSlashCommands({
        insertMarkdown: (live, markdown) => {
          live
            .chain()
            .focus()
            .insertContent(encodeRawMarkdownHtmlForRichEditor(markdown, codec), {
              contentType: 'markdown'
            })
            .run()
        },
        makeDatabase: canMakeDatabase ? () => makeDatabaseRef.current?.() : undefined,
        newDiagram: () => createDiagramPage(scopeKey, pageId)
      }),
    [codec, canMakeDatabase, scopeKey, pageId]
  )
  const [tags, setTags] = useState<string[]>([])
  const [emojiAt, setEmojiAt] = useState<{ left: number; top: number } | null>(null)
  useEffect(() => {
    if (!emojiAt) {
      return
    }
    const close = (event: Event): void => {
      const inside = (event.target as HTMLElement | null)?.closest('.rich-markdown-emoji-menu')
      if (!inside || (event instanceof KeyboardEvent && event.key === 'Escape')) {
        setEmojiAt(null)
      }
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setEmojiAt(null)
      }
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [emojiAt])
  useEffect(() => {
    let stale = false
    void window.api.projectPages.tags(scopeKey).then((result) => {
      if (!stale && result.ok) {
        setTags(result.value.map((row) => row.tag))
      }
    })
    return () => {
      stale = true
    }
  }, [scopeKey, pages])
  const parentId = doc.meta.parentId
  const menus = useProjectPagesEditorMenus({
    pages,
    pageId,
    extraCommands,
    tags,
    onImage: () => {
      const live = liveEditor()
      if (live) {
        pickPageImages(live, scopeKey)
      }
    },
    onEmoji: setEmojiAt,
    onCreatePage: async (newTitle) => {
      const result = await window.api.projectPages.create(scopeKey, { parentId, title: newTitle })
      if (!result.ok) {
        toast.error(result.message)
        return null
      }
      return result.value.meta
    }
  })
  const menusRef = useRef(menus)
  menusRef.current = menus
  const bodyRef = useRef<HTMLDivElement | null>(null)
  // StrictMode builds the editor twice and the hook's value can be the discarded one; TipTap
  // tags its view's DOM node with the editor that owns it.
  const liveEditor = (): Editor | null => {
    const dom = bodyRef.current?.querySelector<HTMLElement & { editor?: Editor }>('.ProseMirror')
    const found = dom?.editor ?? null
    return found && !found.isDestroyed ? found : null
  }
  useProjectPageFileDrop(liveEditor, scopeKey)
  const mergedRef = useRef<(sent: string, merged: string) => void>(() => {})
  const saveStateRef = useRef(onSaveState)
  saveStateRef.current = onSaveState

  const autosave = useMemo(
    () =>
      createPageAutosave({
        revision: doc.meta.revision,
        save: async (patch, baseRevision): Promise<PageSaveResult> => {
          const result = await window.api.projectPages.update(scopeKey, pageId, {
            baseRevision,
            merge: true,
            ...patch
          })
          return result.ok
            ? {
                ok: true,
                revision: result.value.meta.revision,
                merged: result.value.merged ? result.value.markdown : undefined
              }
            : { ok: false, conflict: result.code === 'conflict', message: result.message }
        },
        onState: (state, message) => {
          setConflict(state === 'conflict' ? (message ?? '') : null)
          saveStateRef.current(state)
        },
        onMerged: (sent, merged) => mergedRef.current(sent, merged)
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
          'Type / for blocks, @ to link a page, # to tag.'
        ),
        scopeKey
      ),
    [codec, scopeKey]
  )

  // Created once per open page (the parent keys this component by page).
  const editor = useEditor(
    {
      extensions,
      content: encodeRawMarkdownHtmlForRichEditor(doc.markdown, codec),
      contentType: 'markdown',
      editorProps: {
        attributes: { class: 'rich-markdown-editor project-page-editor' },
        handleKeyDown: (_view, event) => menusRef.current.handleKeyDown(liveEditor(), event),
        handlePaste: (_view, event) => {
          const images = imageFiles(event.clipboardData?.files)
          const live = liveEditor()
          if (images.length === 0 || !live) {
            return false
          }
          void insertPageImages(live, scopeKey, images)
          return true
        },
        handleDrop: (view, event, _slice, moved) => {
          const images = moved ? [] : imageFiles(event.dataTransfer?.files)
          const live = liveEditor()
          if (images.length === 0 || !live) {
            return false
          }
          const at = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos
          void insertPageImages(live, scopeKey, images, at)
          return true
        }
      },
      onUpdate: ({ editor: current }) => {
        autosave.queue({ markdown: () => current.getMarkdown() })
        menusRef.current.sync(current)
      },
      onSelectionUpdate: ({ editor: current }) => menusRef.current.sync(current)
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
      replaceEditorMarkdown(live, result.value.markdown, codec)
      setTitle(result.value.meta.title)
    }
    await autosave.resume(result.value.meta.revision, keepMine)
  }

  // A save that crossed an agent's write came back merged. Typing since the save went out is
  // merged again here, so neither side is lost.
  mergedRef.current = (sent, merged) => {
    const live = liveEditor()
    if (!live) {
      return
    }
    const now = live.getMarkdown()
    const next =
      now === sent
        ? { ok: true as const, markdown: merged }
        : mergeMarkdownBlocks(sent, now, merged)
    if (!next.ok) {
      setConflict('')
      saveStateRef.current('conflict')
      return
    }
    replaceEditorMarkdown(live, next.markdown, codec)
    if (next.markdown !== merged) {
      autosave.queue({ markdown: () => live.getMarkdown() })
    }
  }

  // Someone else saved this page while it had no unsaved edits here: show their version.
  useEffect(() => {
    if (latestRevision > autosave.revision() && !autosave.isDirty() && !conflict) {
      void loadStored(false)
      if (latestAuthor?.kind === 'agent') {
        toast.info(
          translate('auto.components.projectPages.agentUpdated', '{{agent}} updated this page', {
            agent: latestAuthor.agent
          })
        )
      }
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
      <div
        ref={menus.rootRef}
        className="relative flex min-h-0 flex-1 flex-col"
        onClickCapture={(event) => {
          const tag = (event.target as HTMLElement).closest<HTMLElement>('.page-tag')?.dataset.tag
          if (tag && onOpenTag) {
            event.preventDefault()
            onOpenTag(tag)
            return
          }
          const link = (event.target as HTMLElement).closest('a')
          const href = link?.getAttribute('href') ?? ''
          if (href.startsWith(PAGE_LINK_SCHEME)) {
            event.preventDefault()
            event.stopPropagation()
            onOpenPage(href.slice(PAGE_LINK_SCHEME.length))
          }
        }}
      >
        <div
          ref={bodyRef}
          className="min-h-0 flex-1 overflow-auto scrollbar-editor"
          {...PAGE_FILE_DROP_PROPS}
        >
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
          {afterTitle}
          <EditorContent editor={editor} />
          {footer}
        </div>
        <ProjectPagesEditorMenus editor={liveEditor() ?? editor} menus={menus} />
        {emojiAt ? (
          <RichMarkdownEmojiMenu
            editor={liveEditor() ?? editor}
            left={emojiAt.left}
            top={emojiAt.top}
            onClose={() => setEmojiAt(null)}
          />
        ) : null}
      </div>
    </div>
  )
}
