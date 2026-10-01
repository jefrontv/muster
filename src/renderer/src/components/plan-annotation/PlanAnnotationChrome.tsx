// Header and footer of the plan review, laid out like the editor panel's header.
//
// The footer is the one part with no markdown viewer equivalent: the decision is what the waiting
// agent acts on, so it stays visible rather than behind a menu.

import type React from 'react'
import {
  Check,
  Copy,
  GitCompareArrows,
  ListTree,
  MessageSquarePlus,
  MoveHorizontal,
  Pencil,
  Send
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DialogTitle } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import EditorViewToggle, { type EditorToggleValue } from '../editor/EditorViewToggle'

export type PlanReviewView = 'rich' | 'changes'

const VIEW_METADATA = {
  rich: { label: 'Rich Editor', icon: Pencil },
  changes: { label: 'Changes since last round', icon: GitCompareArrows }
}

function HeaderIconButton({
  label,
  pressed,
  disabled,
  onClick,
  children
}: {
  label: string
  pressed?: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-pressed={pressed}
          disabled={disabled}
          onClick={onClick}
          className={`flex-shrink-0 rounded p-1 transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-muted-foreground ${
            pressed ? 'bg-accent text-foreground' : 'text-muted-foreground'
          }`}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={4}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

export function PlanAnnotationHeader({
  title,
  agent,
  project,
  round,
  waiting,
  view,
  canShowChanges,
  showTableOfContents,
  readable,
  onViewChange,
  onToggleTableOfContents,
  onToggleReadable,
  onWholePlanNote,
  onCopyPlan
}: {
  title: string
  /** The agent waiting on this review. Null when its client did not identify itself. */
  agent: string | null
  /** The site or checkout the plan is about. */
  project: string | null
  round: number
  /** Reviews queued behind this one, so the reviewer knows more is coming. */
  waiting: number
  view: PlanReviewView
  canShowChanges: boolean
  showTableOfContents: boolean
  readable: boolean
  onViewChange: (view: PlanReviewView) => void
  onToggleTableOfContents: () => void
  onToggleReadable: () => void
  onWholePlanNote: () => void
  onCopyPlan: () => void
}): React.JSX.Element {
  // Provenance answers "whose plan, about what", which matters most when a review interrupts.
  const provenance = [agent, project].filter((part): part is string => Boolean(part))
  const isRich = view === 'rich'
  return (
    <TooltipProvider delayDuration={300}>
      <div className="editor-header">
        <DialogTitle className="flex min-w-0 flex-1 items-center gap-2 text-[12px] font-normal">
          <span className="shrink-0 font-medium text-foreground">Plan review</span>
          {round > 1 ? (
            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
              round {round}
            </span>
          ) : null}
          <span className="truncate text-muted-foreground">
            {[title, ...provenance].join(' · ')}
          </span>
          {waiting > 0 ? (
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {waiting} more waiting
            </span>
          ) : null}
        </DialogTitle>
        {canShowChanges ? (
          <EditorViewToggle
            value={view}
            modes={['rich', 'changes']}
            onChange={(next: EditorToggleValue) =>
              onViewChange(next === 'changes' ? 'changes' : 'rich')
            }
            metadataOverride={VIEW_METADATA}
          />
        ) : null}
        <HeaderIconButton
          label="Table of Contents"
          pressed={showTableOfContents && isRich}
          disabled={!isRich}
          onClick={onToggleTableOfContents}
        >
          <ListTree size={14} />
        </HeaderIconButton>
        <HeaderIconButton
          label={readable ? 'Use full width' : 'Use readable width'}
          pressed={!readable}
          disabled={!isRich}
          onClick={onToggleReadable}
        >
          <MoveHorizontal size={14} />
        </HeaderIconButton>
        <HeaderIconButton
          label="Comment on the whole plan"
          disabled={!isRich}
          onClick={onWholePlanNote}
        >
          <MessageSquarePlus size={14} />
        </HeaderIconButton>
        <HeaderIconButton label="Copy plan" onClick={onCopyPlan}>
          <Copy size={14} />
        </HeaderIconButton>
      </div>
    </TooltipProvider>
  )
}

export function PlanAnnotationFooter({
  noteCount,
  edited,
  onDismiss,
  onApprove,
  onSend
}: {
  noteCount: number
  edited: boolean
  onDismiss: () => void
  onApprove: () => void
  onSend: () => void
}): React.JSX.Element {
  const hasFeedback = noteCount > 0 || edited
  const summary = [
    noteCount > 0 ? `${noteCount} ${noteCount === 1 ? 'note' : 'notes'}` : null,
    edited ? 'edited' : null
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <div className="flex shrink-0 items-center gap-2 border-t border-border/60 bg-[var(--editor-surface)] px-4 py-2">
      <p className="text-[11px] text-muted-foreground">
        {hasFeedback
          ? `${summary}, ready to send`
          : 'Select text to add a note, or edit the plan directly'}
      </p>
      <div className="ml-auto flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          Close
        </Button>
        <Button variant="outline" size="sm" onClick={onApprove}>
          <Check className="size-4" />
          {hasFeedback ? 'Approve with notes' : 'Approve'}
        </Button>
        <Button size="sm" disabled={!hasFeedback} onClick={onSend}>
          <Send className="size-4" />
          Send feedback
        </Button>
      </div>
    </div>
  )
}
