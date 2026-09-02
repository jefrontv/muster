// Header and footer of the plan review dialog.
//
// Split out purely for size: the dialog owns selection, ranges, highlights and the review queue,
// and pushing this presentational chrome down keeps that file under the max-lines ratchet without
// suppressing it.

import type React from 'react'
import { Check, Copy, MessageSquare, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PlanAnnotationViewModes, type PlanViewMode } from './PlanAnnotationViewModes'

export function PlanAnnotationHeader({
  title,
  round,
  waiting,
  viewMode,
  editing,
  onModeChange,
  onToggleEdit,
  onToggleGlobal,
  onCopyPlan
}: {
  title: string
  round: number
  /** Reviews queued behind this one, so the reviewer knows more is coming. */
  waiting: number
  viewMode: PlanViewMode
  editing: boolean
  onModeChange: (mode: PlanViewMode) => void
  onToggleEdit: () => void
  onToggleGlobal: () => void
  onCopyPlan: () => void
}): React.JSX.Element {
  return (
    <DialogHeader className="flex-row items-center gap-3 border-b border-border/60 px-4 py-2.5">
      <DialogTitle className="flex min-w-0 items-center gap-2 text-[13px] font-medium">
        <span className="truncate">{title}</span>
        {round > 1 ? (
          <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] font-normal text-muted-foreground">
            round {round}
          </span>
        ) : null}
        {waiting > 0 ? (
          <span className="shrink-0 text-[11px] font-normal text-muted-foreground">
            {waiting} more waiting
          </span>
        ) : null}
      </DialogTitle>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <PlanAnnotationViewModes
          mode={viewMode}
          editing={editing}
          onModeChange={onModeChange}
          onToggleEdit={onToggleEdit}
        />
        <span className="h-4 w-px bg-border" />
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          disabled={editing}
          onClick={onToggleGlobal}
        >
          <MessageSquare className="size-3.5" />
          Global comment
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onCopyPlan}>
          <Copy className="size-3.5" />
          Copy plan
        </Button>
      </div>
    </DialogHeader>
  )
}

export function PlanAnnotationFooter({
  noteCount,
  onDismiss,
  onApprove,
  onSend
}: {
  noteCount: number
  onDismiss: () => void
  onApprove: () => void
  onSend: () => void
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-2 border-t border-border/60 px-4 py-2.5">
      <p className="text-[11px] text-muted-foreground">
        {noteCount === 0
          ? 'Select any passage to comment on it'
          : `${noteCount} ${noteCount === 1 ? 'note' : 'notes'} ready to send`}
      </p>
      <div className="ml-auto flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          Close
        </Button>
        <Button variant="outline" size="sm" onClick={onApprove}>
          <Check className="size-4" />
          {noteCount > 0 ? 'Approve with notes' : 'Approve'}
        </Button>
        <Button size="sm" disabled={noteCount === 0} onClick={onSend}>
          <Send className="size-4" />
          Send feedback
        </Button>
      </div>
    </div>
  )
}
