// A draft's files: chips with image thumbnails, a large view, and (in the editor) add and remove.
import { FileText, LoaderCircle, X } from 'lucide-react'
import type React from 'react'
import { useEffect, useState } from 'react'
import { formatBytes } from '@/components/status-bar/workspace-space-format'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type {
  BotsCommentDraft,
  BotsCommentDraftAttachment
} from '../../../../shared/bots-comment-draft-types'

const PREVIEWABLE = /^image\/(png|jpeg|gif|webp)$/
// Keyed by draft and file id; a draft's files never change in place, only come and go.
const previews = new Map<string, Promise<string | null>>()

function preview(draftId: string, file: BotsCommentDraftAttachment): Promise<string | null> {
  const key = `${draftId}:${file.id}`
  let pending = previews.get(key)
  if (!pending) {
    pending = window.api.bots
      .commentDraftAttachmentPreview({ id: draftId, attachmentId: file.id, mime: file.mime })
      .then((result) => (result.ok ? result.value : null))
      .catch(() => null)
    previews.set(key, pending)
  }
  return pending
}

function usePreview(draftId: string, file: BotsCommentDraftAttachment): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!PREVIEWABLE.test(file.mime)) {
      return
    }
    let live = true
    void preview(draftId, file).then((value) => live && setUrl(value))
    return () => {
      live = false
    }
  }, [draftId, file])
  return url
}

function Chip({
  draftId,
  file,
  onOpen,
  onRemove,
  disabled
}: {
  draftId: string
  file: BotsCommentDraftAttachment
  onOpen: (url: string) => void
  onRemove?: () => void
  disabled: boolean
}): React.JSX.Element {
  const url = usePreview(draftId, file)
  const label = `${file.name}, ${formatBytes(file.size)}`
  return (
    <li className="flex max-w-56 min-w-0 items-center gap-1.5 rounded-lg bg-foreground/[0.05] py-1 pr-1 pl-1.5 text-xs">
      <button
        type="button"
        className="flex min-w-0 items-center gap-1.5 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-default"
        disabled={!url}
        onClick={() => url && onOpen(url)}
        aria-label={
          url
            ? translate('auto.components.bots.commentDrafts.viewFile', 'View {{value0}}', {
                value0: file.name
              })
            : label
        }
        title={label}
      >
        {url ? (
          <img src={url} alt="" className="size-8 shrink-0 rounded-md object-cover" />
        ) : (
          <FileText aria-hidden className="size-4 shrink-0 text-chat-ink-tertiary" />
        )}
        <span className="truncate text-foreground">{file.name}</span>
        <span className="shrink-0 text-chat-ink-tertiary tabular-nums">
          {formatBytes(file.size)}
        </span>
      </button>
      {onRemove ? (
        <button
          type="button"
          disabled={disabled}
          onClick={onRemove}
          aria-label={translate(
            'auto.components.bots.commentDrafts.removeFile',
            'Remove {{value0}}',
            {
              value0: file.name
            }
          )}
          className="flex size-5 shrink-0 items-center justify-center rounded-sm text-chat-ink-tertiary outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </li>
  )
}

export function BotsCommentDraftAttachments({
  draft,
  editable = false,
  busy = false,
  onRemove,
  className
}: {
  draft: BotsCommentDraft
  editable?: boolean
  busy?: boolean
  onRemove?: (file: BotsCommentDraftAttachment) => void
  className?: string
}): React.JSX.Element | null {
  const [open, setOpen] = useState<{ url: string; name: string } | null>(null)
  if (draft.attachments.length === 0 && !busy) {
    return null
  }
  return (
    <>
      <ul
        aria-label={translate('auto.components.bots.commentDrafts.files', 'Files')}
        className={cn('flex flex-wrap gap-1.5', className)}
      >
        {draft.attachments.map((file) => (
          <Chip
            key={file.id}
            draftId={draft.id}
            file={file}
            disabled={busy}
            onOpen={(url) => setOpen({ url, name: file.name })}
            onRemove={editable && onRemove ? () => onRemove(file) : undefined}
          />
        ))}
        {busy ? (
          <li className="flex items-center px-1.5" aria-live="polite">
            <LoaderCircle className="size-3.5 animate-spin text-chat-ink-tertiary" />
            <span className="sr-only">
              {translate('auto.components.bots.commentDrafts.addingFiles', 'Adding files')}
            </span>
          </li>
        ) : null}
      </ul>
      <Dialog open={open !== null} onOpenChange={(next) => (next ? undefined : setOpen(null))}>
        <DialogContent className="gap-2 sm:max-w-4xl">
          <DialogTitle className="truncate text-sm">{open?.name}</DialogTitle>
          {open ? (
            <img
              src={open.url}
              alt={open.name}
              className="max-h-[75vh] w-full rounded-lg object-contain"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}

/** "Post (3 files)" when files go with the comment. */
export function postLabelWithFiles(label: string, draft: BotsCommentDraft): string {
  const count = draft.attachments.length
  if (count === 0) {
    return label
  }
  if (count === 1) {
    return translate('auto.components.bots.commentDrafts.postWithFile', '{{value0}} (1 file)', {
      value0: label
    })
  }
  return translate(
    'auto.components.bots.commentDrafts.postWithFiles',
    '{{value0}} ({{value1}} files)',
    {
      value0: label,
      value1: String(count)
    }
  )
}
