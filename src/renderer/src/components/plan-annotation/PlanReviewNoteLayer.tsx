// Margin cards beside each annotated passage, laid out by the markdown viewer's rail controller.

import type React from 'react'
import { Image as ImageIcon } from 'lucide-react'
import { DiffCommentCard } from '../diff-comments/DiffCommentCard'
import { getMarkdownReviewCardQuote } from '@/lib/markdown-review-notes'
import type { RichMarkdownReviewNotePosition } from '../editor/rich-markdown-review-note-layout'
import { PLAN_NOTE_KIND_LABEL, type PlanReviewComment } from './plan-review-comments'

const KIND_CLASS: Record<PlanReviewComment['planKind'], string> = {
  comment: '',
  delete: 'is-remove',
  looks_good: 'is-good',
  global: 'is-whole-plan'
}

function isCardNavigationClick(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    !target.closest('button,input,textarea,select,a,[contenteditable="true"]')
  )
}

export function PlanReviewNoteLayer({
  positions,
  activeCommentId,
  attentionCommentId,
  markdown,
  onScrollSourceIntoView,
  onDelete,
  onSubmitEdit,
  onContentResize
}: {
  positions: RichMarkdownReviewNotePosition[]
  activeCommentId: string | null
  attentionCommentId: string | null
  markdown: string
  onScrollSourceIntoView: (comment: PlanReviewComment) => void
  onDelete: (id: string) => void
  onSubmitEdit: (id: string, body: string) => Promise<boolean>
  onContentResize: () => void
}): React.JSX.Element {
  return (
    <div className="rich-markdown-review-note-layer" aria-label="Review notes">
      {positions.map(({ comment: base, top }) => {
        const comment = base as PlanReviewComment
        const isWholePlan = comment.planKind === 'global'
        return (
          <div
            key={comment.id}
            data-rich-markdown-review-note-id={comment.id}
            className={[
              'rich-markdown-review-note-card plan-review-note-card',
              KIND_CLASS[comment.planKind],
              activeCommentId === comment.id ? 'is-active' : '',
              attentionCommentId === comment.id ? 'is-attention' : ''
            ]
              .filter(Boolean)
              .join(' ')}
            style={{ top }}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              if (!isWholePlan && isCardNavigationClick(event.target)) {
                onScrollSourceIntoView(comment)
              }
            }}
          >
            <DiffCommentCard
              lineNumber={comment.lineNumber}
              startLine={comment.startLine}
              author={PLAN_NOTE_KIND_LABEL[comment.planKind]}
              label={isWholePlan ? null : undefined}
              quote={isWholePlan ? undefined : getMarkdownReviewCardQuote(markdown, comment)}
              body={comment.body}
              onDelete={() => onDelete(comment.id)}
              onSubmitEdit={(body) => onSubmitEdit(comment.id, body)}
              onContentResize={onContentResize}
            />
            {comment.attachments.length > 0 ? (
              <ul className="plan-review-note-attachments">
                {comment.attachments.map((path) => (
                  <li key={path} title={path}>
                    <ImageIcon className="size-3 shrink-0" />
                    <span className="truncate">{path.split(/[\\/]/).pop()}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
