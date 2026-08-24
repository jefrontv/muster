// The rich ActiveCollab body editor — bold, italics, links, @mentions, staged attachments —
// shared by the comment composer and the create-task dialog so a description is written with
// exactly the tools a comment is. Split as hook + frame: the hook owns the ProseMirror wiring,
// the frame owns the bordered box, and each host keeps its own submit lifecycle around them.

import React, { useCallback, useEffect, useMemo, useRef } from 'react'
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react'
import { LoaderCircle } from 'lucide-react'

import { RichMarkdownLinkBubble } from '@/components/editor/RichMarkdownLinkBubble'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { hasBoundedCommentBodyText } from '@/lib/comment-body-submit-state'
import { cn } from '@/lib/utils'
import { ActiveCollabCommentAttachmentStrip } from './activecollab-comment-attachment-strip'
import { activeCollabCommentBodyHtml } from './activecollab-comment-body-html'
import { createActiveCollabCommentExtensions } from './activecollab-comment-editor-schema'
import { ActiveCollabMentionMenu } from './activecollab-comment-mention-menu'
import { ActiveCollabCommentToolbar } from './activecollab-comment-toolbar'
import type { ActiveCollabCommentAttachments } from './use-activecollab-comment-attachments'
import { useActiveCollabCommentLinkBubble } from './use-activecollab-comment-link-bubble'
import { useActiveCollabCommentMentionMenu } from './use-activecollab-comment-mention-menu'

export type ActiveCollabRichBody = {
  editor: Editor | null
  rootRef: React.MutableRefObject<HTMLDivElement | null>
  menu: ReturnType<typeof useActiveCollabCommentMentionMenu>
  link: ReturnType<typeof useActiveCollabCommentLinkBubble>
  menuOpen: boolean
}

/**
 * `projectId` narrows @mention suggestions to the project's members, falling back to the full
 * roster when that membership cannot be read. Enter is never a submit key here: this is a
 * multi-line body whose submit action belongs to the host, so the mention menu claims
 * Up/Down/Enter/Tab/Escape only while open and hands everything else back to ProseMirror.
 */
export function useActiveCollabRichBody({
  projectId,
  disabled,
  placeholder,
  ariaLabel
}: {
  projectId: number | null
  disabled: boolean
  placeholder: string
  ariaLabel: string
}): ActiveCollabRichBody {
  const rootRef = useRef<HTMLDivElement | null>(null)
  // Why: `editorProps` is frozen when the editor is created, so the menu's live handler has to be
  // reached through a ref rather than captured.
  const menuKeyDownRef = useRef<(event: KeyboardEvent) => boolean>(() => false)

  const extensions = useMemo(() => createActiveCollabCommentExtensions(placeholder), [placeholder])

  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions,
      editable: !disabled,
      editorProps: {
        attributes: {
          class: 'activecollab-comment-editor',
          role: 'combobox',
          'aria-label': ariaLabel
        },
        handleKeyDown: (_view, event) => menuKeyDownRef.current(event)
      }
    },
    [extensions]
  )

  const menu = useActiveCollabCommentMentionMenu({ editor, projectId })
  menuKeyDownRef.current = menu.handleKeyDown
  const link = useActiveCollabCommentLinkBubble({ editor, rootRef, disabled })

  useEffect(() => {
    editor?.setEditable(!disabled)
  }, [disabled, editor])

  // The combobox state lives on the contenteditable itself, which ProseMirror owns, so it is set on
  // the live node rather than through the frozen `editorProps.attributes`.
  const menuOpen = menu.suggestions.length > 0
  useEffect(() => {
    const dom = editor?.view.dom
    if (dom === undefined) {
      return
    }
    dom.setAttribute('aria-expanded', String(menuOpen))
    if (menuOpen) {
      dom.setAttribute('aria-controls', menu.listboxId)
      dom.setAttribute('aria-activedescendant', `${menu.listboxId}-option-${menu.highlighted}`)
      return
    }
    dom.removeAttribute('aria-controls')
    dom.removeAttribute('aria-activedescendant')
  }, [editor, menuOpen, menu.listboxId, menu.highlighted])

  return { editor, rootRef, menu, link, menuOpen }
}

/**
 * The bordered box: toolbar, editor, mention menu, link bubble, staged attachments, and the host's
 * footer all inside one frame so the control reads as one thing. The DROP TARGET is NOT applied
 * here — the host spreads `attachments.dropTargetProps` on whichever ancestor should accept drops.
 *
 * A null `attachments` is an editor that cannot stage files at all — editing an existing body
 * writes HTML only — so the strip is absent rather than present and quietly discarded.
 */
export function ActiveCollabRichBodyFrame({
  body,
  attachments,
  disabled,
  dragging,
  footer
}: {
  body: ActiveCollabRichBody
  attachments: ActiveCollabCommentAttachments | null
  disabled: boolean
  dragging: boolean
  footer: React.ReactNode
}): React.JSX.Element {
  const { editor, rootRef, menu, link, menuOpen } = body
  return (
    <div
      // Named like the ui primitives: one stable hook for styling and for scoping a query to THIS
      // editor, of which a task pane can have two open at once.
      data-slot="activecollab-rich-body"
      ref={rootRef}
      className={cn(
        'relative rounded-md border border-input bg-transparent transition-colors focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50',
        dragging && 'border-ring ring-[3px] ring-ring/30',
        disabled && 'pointer-events-none opacity-50'
      )}
    >
      <ActiveCollabCommentToolbar
        editor={editor}
        disabled={disabled}
        onToggleLink={link.openLinkEditor}
      />
      <EditorContent editor={editor} />
      {menuOpen ? (
        <ActiveCollabMentionMenu
          users={menu.suggestions}
          activeIndex={menu.highlighted}
          listboxId={menu.listboxId}
          scoped={menu.scoped}
          onPick={menu.pick}
        />
      ) : null}
      {link.linkBubble === null ? null : (
        <RichMarkdownLinkBubble
          anchorElement={rootRef.current}
          linkBubble={link.linkBubble}
          isEditing={link.isEditing}
          onDismiss={link.onDismiss}
          onSave={link.onSave}
          onRemove={link.onRemove}
          onEditStart={link.onEditStart}
          onEditCancel={link.onEditCancel}
          onOpen={link.onOpen}
          onCopy={link.onCopy}
        />
      )}
      {attachments ? (
        <ActiveCollabCommentAttachmentStrip
          files={attachments.files}
          busy={attachments.busy}
          error={attachments.error}
          disabled={disabled}
          onRemove={attachments.remove}
        />
      ) : null}
      {footer}
    </div>
  )
}

/**
 * Editing a body that ALREADY EXISTS — a task description, a posted comment — with the same editor
 * they were written in. Mounted only while editing, so reading a task pays for no ProseMirror
 * instance; committed through Save rather than a send button, and closed only once the write lands.
 *
 * No attachments: the edit routes carry HTML alone, so a staged file would upload and attach to
 * nothing.
 */
export function ActiveCollabRichBodyEditor({
  projectId,
  bodyHtml,
  disabled,
  busy,
  ariaLabel,
  placeholder,
  onSave,
  onClose
}: {
  projectId: number | null
  /** Seeds the editor. Only a CHANGE re-seeds, so typing is never overwritten by a rerender. */
  bodyHtml: string
  disabled: boolean
  busy: boolean
  ariaLabel: string
  placeholder: string
  /** Resolves TRUE only when the edit LANDED; the editor closes on that and nothing else. */
  onSave: (bodyHtml: string) => Promise<boolean>
  onClose: () => void
}): React.JSX.Element {
  const body = useActiveCollabRichBody({ projectId, disabled, placeholder, ariaLabel })
  const { editor } = body
  const seededRef = useRef<string | null>(null)

  useEffect(() => {
    if (editor === null || seededRef.current === bodyHtml) {
      return
    }
    seededRef.current = bodyHtml
    editor.commands.setContent(bodyHtml, { contentType: 'html' })
    editor.commands.focus('end')
  }, [bodyHtml, editor])

  const hasText =
    useEditorState({
      editor,
      selector: ({ editor: current }) =>
        current === null ? false : hasBoundedCommentBodyText(current.getText())
    }) ?? false

  const save = useCallback(() => {
    if (editor === null || disabled) {
      return
    }
    const next = activeCollabCommentBodyHtml(editor.state.doc)
    if (next === '') {
      return
    }
    void (async () => {
      if (await onSave(next)) {
        onClose()
      }
    })()
  }, [disabled, editor, onClose, onSave])

  return (
    <ActiveCollabRichBodyFrame
      body={body}
      attachments={null}
      disabled={disabled}
      dragging={false}
      footer={
        <div className="flex items-center justify-end gap-2 border-t border-border px-1.5 py-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground"
            onClick={onClose}
          >
            {translate('auto.components.activecollab.task_workspace.cancel_edit', 'Cancel')}
          </Button>
          <Button size="sm" onClick={save} disabled={disabled || !hasText} className="gap-2">
            {busy ? <LoaderCircle className="size-4 animate-spin" /> : null}
            {translate('auto.components.activecollab.task_workspace.save_edit', 'Save')}
          </Button>
        </div>
      }
    />
  )
}
