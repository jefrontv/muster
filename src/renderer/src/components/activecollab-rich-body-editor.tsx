// The rich ActiveCollab body editor — bold, italics, links, @mentions, staged attachments —
// shared by the comment composer and the create-task dialog so a description is written with
// exactly the tools a comment is. Split as hook + frame: the hook owns the ProseMirror wiring,
// the frame owns the bordered box, and each host keeps its own submit lifecycle around them.

import React, { useEffect, useMemo, useRef } from 'react'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'

import { RichMarkdownLinkBubble } from '@/components/editor/RichMarkdownLinkBubble'
import { cn } from '@/lib/utils'
import { ActiveCollabCommentAttachmentStrip } from './activecollab-comment-attachment-strip'
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
 */
export function ActiveCollabRichBodyFrame({
  body,
  attachments,
  disabled,
  dragging,
  footer
}: {
  body: ActiveCollabRichBody
  attachments: ActiveCollabCommentAttachments
  disabled: boolean
  dragging: boolean
  footer: React.ReactNode
}): React.JSX.Element {
  const { editor, rootRef, menu, link, menuOpen } = body
  return (
    <div
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
      <ActiveCollabCommentAttachmentStrip
        files={attachments.files}
        busy={attachments.busy}
        error={attachments.error}
        disabled={disabled}
        onRemove={attachments.remove}
      />
      {footer}
    </div>
  )
}
