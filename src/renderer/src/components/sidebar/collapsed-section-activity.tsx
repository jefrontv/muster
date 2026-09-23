import React from 'react'
import { MessageCircleQuestion } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store'
import { AgentWorkingSpinner } from '@/components/AgentWorkingSpinner'
import { translate } from '@/i18n/i18n'
import { selectWorktreeSectionActivity } from './worktree-section-activity'

function getCollapsedSectionLabel(
  count: number,
  runningCount: number,
  attentionCount: number
): string {
  const parts = [
    count === 1
      ? translate(
          'auto.components.sidebar.collapsedSectionActivity.hiddenOne',
          '1 hidden workspace'
        )
      : translate(
          'auto.components.sidebar.collapsedSectionActivity.hiddenMany',
          '{{value0}} hidden workspaces',
          { value0: count }
        )
  ]
  if (attentionCount > 0) {
    parts.push(
      translate(
        'auto.components.sidebar.collapsedSectionActivity.needsInput',
        '{{value0}} needs input',
        { value0: attentionCount }
      )
    )
  }
  if (runningCount > 0) {
    parts.push(
      translate('auto.components.sidebar.collapsedSectionActivity.working', '{{value0}} working', {
        value0: runningCount
      })
    )
  }
  return parts.join(', ')
}

/** Resting state of a collapsed header: hidden count plus the loudest hidden agent state. */
export const CollapsedSectionActivity = React.memo(function CollapsedSectionActivity({
  worktreeIds,
  count
}: {
  worktreeIds: readonly string[]
  count: number
}): React.JSX.Element {
  const { runningCount, attentionCount } = useAppStore(
    useShallow((s) => selectWorktreeSectionActivity(s, worktreeIds))
  )
  return (
    <span
      data-collapsed-section-activity=""
      className="flex shrink-0 items-center gap-1.5 text-[11px] leading-none tabular-nums text-worktree-sidebar-muted-foreground"
    >
      {attentionCount > 0 ? (
        <MessageCircleQuestion className="size-3 text-status-attention" aria-hidden="true" />
      ) : runningCount > 0 ? (
        <AgentWorkingSpinner className="size-2.5" />
      ) : null}
      <span aria-hidden="true">{count}</span>
      <span className="sr-only">
        {getCollapsedSectionLabel(count, runningCount, attentionCount)}
      </span>
    </span>
  )
})
