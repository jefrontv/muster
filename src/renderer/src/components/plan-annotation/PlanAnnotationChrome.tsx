// Header and footer of the plan review, laid out like the editor panel's header.
import { Badge } from '@/components/ui/badge'
import { translate } from '@/i18n/i18n'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'
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

const viewMetadata = createLocalizedCatalog(() => ({
  rich: {
    label: translate('auto.components.planAnnotation.chrome.richEditor', 'Rich Editor'),
    icon: Pencil
  },
  changes: {
    label: translate('auto.components.planAnnotation.chrome.changes', 'Changes since last round'),
    icon: GitCompareArrows
  }
}))

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
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={label}
          aria-pressed={pressed}
          disabled={disabled}
          onClick={onClick}
          className="text-muted-foreground aria-pressed:bg-foreground/[0.07] aria-pressed:text-foreground"
        >
          {children}
        </Button>
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
  onCopyPlan,
  actions,
  inDialog = true
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
  /** Extra header actions, such as Add to Pages. */
  actions?: React.ReactNode
  /** DialogTitle throws outside a Dialog, so the tab gets a plain heading. */
  inDialog?: boolean
}): React.JSX.Element {
  const Title: React.ElementType = inDialog ? DialogTitle : 'h2'
  // Provenance answers "whose plan, about what", which matters most when a review interrupts.
  const provenance = [agent, project].filter((part): part is string => Boolean(part))
  const isRich = view === 'rich'
  return (
    <TooltipProvider delayDuration={300}>
      <div className="editor-header">
        <Title className="flex min-w-0 flex-1 items-center gap-2 text-[12px] font-normal">
          <span className="shrink-0 font-medium text-foreground">
            {translate('auto.components.planAnnotation.chrome.title', 'Plan review')}
          </span>
          {round > 1 ? (
            <Badge variant="muted" className="shrink-0">
              {translate('auto.components.planAnnotation.chrome.round', 'round {{value0}}', {
                value0: round
              })}
            </Badge>
          ) : null}
          <span className="truncate text-muted-foreground">
            {[title, ...provenance].join(' · ')}
          </span>
          {waiting > 0 ? (
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {translate(
                'auto.components.planAnnotation.chrome.waiting',
                '{{value0}} more waiting',
                { value0: waiting }
              )}
            </span>
          ) : null}
        </Title>
        {canShowChanges ? (
          <EditorViewToggle
            value={view}
            modes={['rich', 'changes']}
            onChange={(next: EditorToggleValue) =>
              onViewChange(next === 'changes' ? 'changes' : 'rich')
            }
            metadataOverride={viewMetadata()}
          />
        ) : null}
        {actions}
        <HeaderIconButton
          label={translate('auto.components.planAnnotation.chrome.toc', 'Table of Contents')}
          pressed={showTableOfContents && isRich}
          disabled={!isRich}
          onClick={onToggleTableOfContents}
        >
          <ListTree className="size-3.5" />
        </HeaderIconButton>
        <HeaderIconButton
          label={
            readable
              ? translate('auto.components.planAnnotation.chrome.fullWidth', 'Use full width')
              : translate(
                  'auto.components.planAnnotation.chrome.readableWidth',
                  'Use readable width'
                )
          }
          pressed={!readable}
          disabled={!isRich}
          onClick={onToggleReadable}
        >
          <MoveHorizontal className="size-3.5" />
        </HeaderIconButton>
        <HeaderIconButton
          label={translate(
            'auto.components.planAnnotation.chrome.commentWhole',
            'Comment on the whole plan'
          )}
          disabled={!isRich}
          onClick={onWholePlanNote}
        >
          <MessageSquarePlus className="size-3.5" />
        </HeaderIconButton>
        <HeaderIconButton
          label={translate('auto.components.planAnnotation.chrome.copy', 'Copy plan')}
          onClick={onCopyPlan}
        >
          <Copy className="size-3.5" />
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
    noteCount === 1 ? translate('auto.components.planAnnotation.chrome.oneNote', '1 note') : null,
    noteCount > 1
      ? translate('auto.components.planAnnotation.chrome.notes', '{{value0}} notes', {
          value0: noteCount
        })
      : null,
    edited ? translate('auto.components.planAnnotation.chrome.edited', 'edited') : null
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <div className="flex shrink-0 items-center gap-2 border-t border-border/60 bg-[var(--editor-surface)] px-4 py-2">
      <p className="text-[11px] text-muted-foreground">
        {hasFeedback
          ? translate(
              'auto.components.planAnnotation.chrome.readyToSend',
              '{{value0}}, ready to send',
              { value0: summary }
            )
          : translate(
              'auto.components.planAnnotation.chrome.hint',
              'Select text to add a note, or edit the plan directly'
            )}
      </p>
      <div className="ml-auto flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          {translate('auto.components.planAnnotation.chrome.close', 'Close')}
        </Button>
        <Button variant="outline" size="sm" onClick={onApprove}>
          <Check className="size-4" />
          {hasFeedback
            ? translate(
                'auto.components.planAnnotation.chrome.approveWithNotes',
                'Approve with notes'
              )
            : translate('auto.components.planAnnotation.chrome.approve', 'Approve')}
        </Button>
        <Button size="sm" disabled={!hasFeedback} onClick={onSend}>
          <Send className="size-4" />
          {translate('auto.components.planAnnotation.chrome.send', 'Send feedback')}
        </Button>
      </div>
    </div>
  )
}
