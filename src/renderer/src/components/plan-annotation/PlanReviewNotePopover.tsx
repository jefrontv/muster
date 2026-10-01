// The markdown viewer's note popover, plus the two things a plan note needs that a file note does
// not: a kind (comment / remove / looks good) and image attachments.

import type React from 'react'
import { useRef, useState } from 'react'
import { Image as ImageIcon, MessageSquare, ThumbsUp, Trash2, X } from 'lucide-react'
import type { PlanAnnotationKind } from '../../../../shared/plan-annotation-types'
import { DiffCommentPopover } from '../diff-comments/DiffCommentPopover'
import { isStandaloneKind } from './plan-review-comments'
import type { PlanNoteDraft } from './use-plan-review-annotations'

const PASSAGE_KINDS: { kind: PlanAnnotationKind; label: string; icon: typeof MessageSquare }[] = [
  { kind: 'comment', label: 'Comment', icon: MessageSquare },
  { kind: 'delete', label: 'Remove', icon: Trash2 },
  { kind: 'looks_good', label: 'Looks good', icon: ThumbsUp }
]

/** Writes each image to disk and returns its path: the agent can open a file, not base64. */
async function saveImages(files: readonly File[]): Promise<string[]> {
  const paths: string[] = []
  for (const file of files) {
    if (!file.type.startsWith('image/')) {
      continue
    }
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      let binary = ''
      // Chunked: spreading a large screenshot into fromCharCode overflows the argument stack.
      for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
      }
      paths.push(
        await window.api.planAnnotation.saveAttachment({
          name: file.name,
          dataBase64: btoa(binary)
        })
      )
    } catch {
      // A rejected image must not take the note being written down with it.
    }
  }
  return paths
}

export function PlanReviewNotePopover({
  draft,
  onCancel,
  onSubmit
}: {
  draft: PlanNoteDraft
  onCancel: () => void
  onSubmit: (kind: PlanAnnotationKind, body: string, attachments: string[]) => void
}): React.JSX.Element {
  const isPassage = draft.scope === 'passage'
  const [kind, setKind] = useState<PlanAnnotationKind>(isPassage ? 'comment' : 'global')
  const [attachments, setAttachments] = useState<string[]>([])
  const fileInput = useRef<HTMLInputElement | null>(null)

  const attach = (files: File[]): void => {
    void saveImages(files).then((paths) => setAttachments((current) => [...current, ...paths]))
  }

  const lineNumber = isPassage ? draft.target.lineNumber : 1
  return (
    <DiffCommentPopover
      key={isPassage ? `${draft.target.from}:${draft.target.to}` : 'whole-plan'}
      lineNumber={lineNumber}
      startLine={isPassage ? draft.target.startLine : undefined}
      top={isPassage ? draft.target.top : draft.top}
      left={isPassage ? draft.target.left : draft.left}
      lineHeight={isPassage ? draft.flipHeight : 0}
      title={isPassage ? 'Selected text' : 'Whole plan'}
      placeholder={
        kind === 'comment' || kind === 'global'
          ? 'Add note for the agent'
          : 'Add a reason (optional)'
      }
      allowEmptySubmit={isStandaloneKind(kind) || attachments.length > 0}
      onFiles={attach}
      onCancel={onCancel}
      onSubmit={async (body) => onSubmit(kind, body, attachments)}
      beforeInput={
        isPassage ? (
          <div className="flex items-center gap-1" role="radiogroup" aria-label="Note kind">
            {PASSAGE_KINDS.map((entry) => (
              <button
                key={entry.kind}
                type="button"
                role="radio"
                aria-checked={kind === entry.kind}
                onClick={() => setKind(entry.kind)}
                className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors ${
                  kind === entry.kind
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
                }`}
              >
                <entry.icon className="size-3" />
                {entry.label}
              </button>
            ))}
          </div>
        ) : null
      }
      footerStart={
        <div className="mr-auto flex min-w-0 items-center gap-1.5">
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(event) => {
              attach([...(event.target.files ?? [])])
              event.target.value = ''
            }}
          />
          <button
            type="button"
            aria-label="Attach image"
            title="Attach image, or drop or paste one"
            onClick={() => fileInput.current?.click()}
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <ImageIcon className="size-3.5" />
          </button>
          {attachments.map((path) => (
            <span
              key={path}
              className="flex min-w-0 items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10.5px] text-muted-foreground"
            >
              <span className="max-w-[90px] truncate">{path.split(/[\\/]/).pop()}</span>
              <button
                type="button"
                aria-label="Remove attachment"
                onClick={() => setAttachments((current) => current.filter((p) => p !== path))}
                className="hover:text-foreground"
              >
                <X className="size-2.5" />
              </button>
            </span>
          ))}
        </div>
      }
    />
  )
}
