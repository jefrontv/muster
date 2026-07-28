import React, { useCallback, useEffect, useMemo, useRef } from 'react'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import { LoaderCircle, Send } from 'lucide-react'

import { RichMarkdownLinkBubble } from '@/components/editor/RichMarkdownLinkBubble'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { hasBoundedCommentBodyText } from '@/lib/comment-body-submit-state'
import { cn } from '@/lib/utils'
import { activeCollabCommentBodyHtml } from './activecollab-comment-body-html'
import { createActiveCollabCommentExtensions } from './activecollab-comment-editor-schema'
import { ActiveCollabMentionMenu } from './activecollab-comment-mention-menu'
import { ActiveCollabCommentToolbar } from './activecollab-comment-toolbar'
import { useActiveCollabCommentLinkBubble } from './use-activecollab-comment-link-bubble'
import { useActiveCollabCommentMentionMenu } from './use-activecollab-comment-mention-menu'

/**
 * The reply box: bold, italics, links, and @mentions, posted as the narrow HTML ActiveCollab
 * stores.
 *
 * Enter is deliberately NOT a submit key and is only claimed while the mention menu is open: this
 * is a multi-line composer whose Post action is the button, so a plain Enter has to keep writing.
 * The menu takes Up/Down/Enter/Tab/Escape and nothing else, and hands every other key straight back
 * to ProseMirror.
 *
 * `projectId` narrows the suggestions to the people on the task's project — seven, against the 176
 * accounts on the instance — falling back to the full roster when that membership cannot be read.
 */
export function ActiveCollabCommentComposer({
  projectId,
  disabled,
  busy,
  onSubmit
}: {
  projectId: number | null
  disabled: boolean
  busy: boolean
  onSubmit: (bodyHtml: string) => void
}): React.JSX.Element {
  const rootRef = useRef<HTMLDivElement | null>(null)
  // Why: `editorProps` is frozen when the editor is created, so the menu's live handler has to be
  // reached through a ref rather than captured.
  const menuKeyDownRef = useRef<(event: KeyboardEvent) => boolean>(() => false)

  const placeholder = translate(
    'auto.components.activecollab.task_workspace.comment_placeholder',
    'Add an ActiveCollab comment...'
  )
  const commentLabel = translate(
    'auto.components.activecollab.task_workspace.comment_label',
    'New comment'
  )
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
          'aria-label': commentLabel
        },
        handleKeyDown: (_view, event) => menuKeyDownRef.current(event)
      }
    },
    [extensions]
  )

  const menu = useActiveCollabCommentMentionMenu({ editor, projectId })
  menuKeyDownRef.current = menu.handleKeyDown
  const link = useActiveCollabCommentLinkBubble({ editor, rootRef, disabled })

  const hasText =
    useEditorState({
      editor,
      selector: ({ editor: current }) =>
        current === null ? false : hasBoundedCommentBodyText(current.getText())
    }) ?? false

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

  const submit = useCallback(() => {
    if (editor === null || disabled) {
      return
    }
    const bodyHtml = activeCollabCommentBodyHtml(editor.state.doc)
    if (bodyHtml === '') {
      return
    }
    onSubmit(bodyHtml)
    // Mentions are nodes in this document, so clearing the draft clears them: there is no pick list
    // left over to leak into the next comment.
    editor.commands.clearContent(true)
  }, [editor, disabled, onSubmit])

  return (
    // Stacked, not side-by-side: the button used to sit `self-end` beside a two-row textarea, which
    // left it floating against the field's bottom corner aligned to nothing.
    <div className="mt-2 flex flex-col gap-2">
      <div
        ref={rootRef}
        className={cn(
          'relative rounded-md border border-input bg-transparent focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50',
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
      </div>
      <div className="flex justify-end">
        <Button size="sm" onClick={submit} disabled={disabled || !hasText} className="gap-2">
          {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}
          {translate('auto.components.activecollab.task_workspace.comment_submit', 'Comment')}
        </Button>
      </div>
    </div>
  )
}
