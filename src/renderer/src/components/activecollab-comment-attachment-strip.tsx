import React from 'react'
import { LoaderCircle, Paperclip, X } from 'lucide-react'

import { formatBytes } from '@/components/status-bar/workspace-space-format'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import type { ActiveCollabStagedFile } from '../../../shared/activecollab-api-types'

/**
 * Staged-attachment rows inside the comment composer (the attach button and the
 * drop affordance live on the composer frame itself).
 *
 * Nothing here uploads. Rows are described from disk — a real name and a real size — so the author
 * can see what is about to go and drop the wrong file before it does. A row that can never upload
 * says so in place, next to its own remove button, rather than failing the whole post from a banner.
 */
function StagedRow({
  file,
  busy,
  disabled,
  onRemove
}: {
  file: ActiveCollabStagedFile
  busy: boolean
  disabled: boolean
  onRemove: (path: string) => void
}): React.JSX.Element {
  const reason =
    file.rejected === 'too-large'
      ? translate('auto.components.activecollab.comment_attachments.too_large', 'Too large to send')
      : file.rejected === 'unreadable'
        ? translate(
            'auto.components.activecollab.comment_attachments.unreadable',
            'Cannot be read from disk'
          )
        : null

  return (
    <li className="flex min-w-0 items-center gap-2 rounded-sm bg-muted/40 px-2 py-1">
      {busy ? (
        <LoaderCircle className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
      ) : (
        <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
      )}
      <span className="min-w-0 flex-1 truncate text-[12px] text-foreground">{file.name}</span>
      {reason === null ? (
        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
          {formatBytes(file.size)}
        </span>
      ) : (
        <span className="shrink-0 text-[11px] text-destructive">{reason}</span>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-5 shrink-0"
        disabled={disabled || busy}
        aria-label={translate(
          'auto.components.activecollab.comment_attachments.remove',
          'Remove {{value0}}',
          { value0: file.name }
        )}
        onClick={() => onRemove(file.path)}
      >
        <X className="size-3.5" />
      </Button>
    </li>
  )
}

export function ActiveCollabCommentAttachmentStrip({
  files,
  busy,
  error,
  disabled,
  onRemove
}: {
  files: ActiveCollabStagedFile[]
  busy: boolean
  error: string | null
  disabled: boolean
  onRemove: (path: string) => void
}): React.JSX.Element | null {
  if (files.length === 0 && error === null) {
    return null
  }
  return (
    <div className="px-1.5 pb-1.5">
      {files.length === 0 ? null : (
        <ul className="flex flex-col gap-1">
          {files.map((file) => (
            <StagedRow
              key={file.path}
              file={file}
              busy={busy}
              disabled={disabled}
              onRemove={onRemove}
            />
          ))}
        </ul>
      )}

      {error === null ? null : (
        <p role="alert" className="mt-1.5 text-[11px] text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
