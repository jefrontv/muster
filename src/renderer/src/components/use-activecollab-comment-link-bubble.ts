// The link affordance for the comment composer, on the editor's own bubble rather than a bespoke
// one: `RichMarkdownLinkBubble` already carries edit/open/copy/unlink, keyboard traversal, and the
// dismissal rules for an anchor that scrolls or disappears.

import { useCallback, useEffect, useState } from 'react'
import type { Editor } from '@tiptap/react'

import {
  getLinkBubblePosition,
  type LinkBubbleState
} from '@/components/editor/RichMarkdownLinkBubble'
import { copyRichMarkdownLink } from '@/components/editor/rich-markdown-link-clipboard'
import { createEditableMarkdownLinkBubble } from '@/components/editor/rich-markdown-selected-link-actions'
import { safeActiveCollabCommentHref } from './activecollab-comment-body-html'

export type ActiveCollabCommentLinkBubble = {
  linkBubble: LinkBubbleState | null
  isEditing: boolean
  openLinkEditor: () => void
  onSave: (href: string) => void
  onRemove: () => void
  onEditStart: () => void
  onEditCancel: () => void
  onOpen: () => void
  onCopy: () => void
  onDismiss: () => void
}

export function useActiveCollabCommentLinkBubble({
  editor,
  rootRef,
  disabled
}: {
  editor: Editor | null
  rootRef: React.RefObject<HTMLElement | null>
  disabled: boolean
}): ActiveCollabCommentLinkBubble {
  const [linkBubble, setLinkBubble] = useState<LinkBubbleState | null>(null)
  const [isEditing, setIsEditing] = useState(false)

  const openLinkEditor = useCallback(() => {
    if (editor === null || disabled) {
      return
    }
    const position = getLinkBubblePosition(editor, rootRef.current)
    if (position === null) {
      editor.commands.focus()
      return
    }
    const href = editor.isActive('link') ? String(editor.getAttributes('link').href ?? '') : ''
    setLinkBubble(createEditableMarkdownLinkBubble(href, position))
    setIsEditing(true)
  }, [disabled, editor, rootRef])

  // Parking the caret in an existing link should surface its actions without the author hunting for
  // the toolbar; while the URL field is open the selection is the editor's, not theirs, so leave it.
  useEffect(() => {
    if (editor === null) {
      return
    }
    const sync = (): void => {
      if (isEditing) {
        return
      }
      if (!editor.isActive('link')) {
        setLinkBubble(null)
        return
      }
      const position = getLinkBubblePosition(editor, rootRef.current)
      setLinkBubble(
        position === null
          ? null
          : createEditableMarkdownLinkBubble(
              String(editor.getAttributes('link').href ?? ''),
              position
            )
      )
    }
    editor.on('selectionUpdate', sync)
    return () => {
      editor.off('selectionUpdate', sync)
    }
  }, [editor, isEditing, rootRef])

  const onSave = useCallback(
    (raw: string) => {
      setIsEditing(false)
      if (editor === null) {
        return
      }
      const href = safeActiveCollabCommentHref(raw)
      if (href === null) {
        // An empty box means "unlink"; an unusable scheme means the author gets nothing rather than
        // a link the serialiser would silently strip out from under them later.
        if (editor.isActive('link')) {
          editor.chain().focus().extendMarkRange('link').unsetLink().run()
        }
        setLinkBubble(null)
        return
      }
      if (editor.isActive('link')) {
        editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
        return
      }
      if (editor.state.selection.empty) {
        editor
          .chain()
          .focus()
          .insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] })
          .run()
        return
      }
      editor.chain().focus().setLink({ href }).run()
    },
    [editor]
  )

  const onRemove = useCallback(() => {
    editor?.chain().focus().extendMarkRange('link').unsetLink().run()
    setLinkBubble(null)
    setIsEditing(false)
  }, [editor])

  const onOpen = useCallback(() => {
    const href = safeActiveCollabCommentHref(linkBubble?.href)
    if (href !== null) {
      window.api.shell.openUrl(href)
    }
  }, [linkBubble?.href])

  const onCopy = useCallback(() => {
    if (linkBubble?.href) {
      void copyRichMarkdownLink(linkBubble.href)
    }
  }, [linkBubble?.href])

  const onEditCancel = useCallback(() => {
    setIsEditing(false)
    if (!linkBubble?.href) {
      setLinkBubble(null)
    }
    editor?.commands.focus()
  }, [editor, linkBubble?.href])

  const onDismiss = useCallback(() => {
    setLinkBubble(null)
    setIsEditing(false)
  }, [])

  return {
    linkBubble,
    isEditing,
    openLinkEditor,
    onSave,
    onRemove,
    onEditStart: openLinkEditor,
    onEditCancel,
    onOpen,
    onCopy,
    onDismiss
  }
}
