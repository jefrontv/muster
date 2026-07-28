import React from 'react'
import { useEditorState, type Editor } from '@tiptap/react'
import { Bold, Italic, Link as LinkIcon } from 'lucide-react'

import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'

/**
 * Three controls, matching the three things a comment body may carry beyond plain text. Anything
 * further — headings, lists, code — is absent because the schema cannot hold it and the serialiser
 * would not emit it, so offering the button would be a lie.
 */
export function ActiveCollabCommentToolbar({
  editor,
  disabled,
  onToggleLink
}: {
  editor: Editor | null
  disabled: boolean
  onToggleLink: () => void
}): React.JSX.Element {
  // Why: `useEditor` does not re-render on transactions, so an active mark has to be subscribed to
  // explicitly or the buttons would never light up.
  const active = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current?.isActive('bold') ?? false,
      italic: current?.isActive('italic') ?? false,
      link: current?.isActive('link') ?? false
    })
  }) ?? { bold: false, italic: false, link: false }

  return (
    <div
      className="flex items-center gap-0.5 border-b border-border px-1.5 py-1"
      aria-label={translate(
        'auto.components.activecollab.task_workspace.comment_formatting',
        'Comment formatting'
      )}
    >
      <ActiveCollabCommentToolbarButton
        label={translate('auto.components.activecollab.task_workspace.comment_bold', 'Bold')}
        active={active.bold}
        disabled={disabled}
        onClick={() => editor?.chain().focus().toggleBold().run()}
      >
        <Bold className="size-3.5" />
      </ActiveCollabCommentToolbarButton>
      <ActiveCollabCommentToolbarButton
        label={translate('auto.components.activecollab.task_workspace.comment_italic', 'Italic')}
        active={active.italic}
        disabled={disabled}
        onClick={() => editor?.chain().focus().toggleItalic().run()}
      >
        <Italic className="size-3.5" />
      </ActiveCollabCommentToolbarButton>
      <ActiveCollabCommentToolbarButton
        label={translate('auto.components.activecollab.task_workspace.comment_link', 'Link')}
        active={active.link}
        disabled={disabled}
        onClick={onToggleLink}
      >
        <LinkIcon className="size-3.5" />
      </ActiveCollabCommentToolbarButton>
    </div>
  )
}

function ActiveCollabCommentToolbarButton({
  active,
  disabled,
  label,
  onClick,
  children
}: {
  active: boolean
  disabled: boolean
  label: string
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      // Why: the editor owns the selection the command applies to, so the press must not move focus
      // out of it first.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        'flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50',
        active && 'bg-accent text-accent-foreground'
      )}
    >
      {children}
    </button>
  )
}
