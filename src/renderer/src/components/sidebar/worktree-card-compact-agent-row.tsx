import React, { useCallback } from 'react'
import { ChevronRight } from 'lucide-react'
import { AgentStateDot, agentStateLabel } from '@/components/AgentStateDot'
import type { DashboardAgentRow as DashboardAgentRowData } from '@/components/dashboard/useDashboardData'
import { AgentIcon } from '@/lib/agent-catalog'
import { agentTypeToIconAgent, formatAgentTypeLabel } from '@/lib/agent-status'
import { cn } from '@/lib/utils'
import { getAgentDotState } from './worktree-card-agent-summary'
import { translate } from '@/i18n/i18n'
import { getAgentRowPrimaryText } from '@/lib/agent-row-primary-text'
import { useAgentRowConversationName } from '@/components/dashboard/use-agent-row-conversation-name'
import { lastEnteredDoneAt } from '@/components/dashboard/agent-finished-timestamp'
import CacheTimer, { usePromptCacheCountdownForPane } from './CacheTimer'

export function formatShortTimeAgo(ts: number, now: number): string {
  const delta = now - ts
  if (delta < 60_000) {
    return 'now'
  }
  const minutes = Math.floor(delta / 60_000)
  if (minutes < 60) {
    return `${minutes}m`
  }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return `${hours}h`
  }
  return `${Math.floor(hours / 24)}d`
}

function getCompactAgentPrimary(
  agent: DashboardAgentRowData,
  conversationName: string | null
): string {
  const prompt = conversationName ?? getAgentRowPrimaryText(agent.entry)
  return prompt || agentStateLabel(getAgentDotState(agent))
}

function getCompactAgentSecondary(agent: DashboardAgentRowData): string {
  if (agent.entry.interrupted === true) {
    return 'Interrupted by user'
  }
  if (agent.state === 'working') {
    const toolName = agent.entry.toolName?.trim() ?? ''
    const toolInput = agent.entry.toolInput?.trim() ?? ''
    if (toolName && toolInput) {
      return `${toolName}: ${toolInput}`
    }
    if (toolName) {
      return toolName
    }
  }
  const lastAssistantMessage = agent.entry.lastAssistantMessage?.trim()
  if (lastAssistantMessage) {
    return lastAssistantMessage
  }
  // Why: child rows without descriptions use their role as primary text; repeating its formatted label adds no information.
  if (agent.rowSource === 'subagent' && agent.entry.prompt?.trim() === agent.agentType.trim()) {
    return ''
  }
  return formatAgentTypeLabel(agent.agentType)
}

export function getCompactAgentTimestamp(agent: DashboardAgentRowData): number | null {
  const doneAt = lastEnteredDoneAt(agent)
  if (doneAt !== null) {
    return doneAt
  }
  const startedAt = agent.startedAt > 0 ? agent.startedAt : agent.entry.stateStartedAt
  return startedAt > 0 ? startedAt : null
}

function getCompactAgentTime(agent: DashboardAgentRowData, now: number): string | null {
  const timestamp = getCompactAgentTimestamp(agent)
  return timestamp === null ? null : formatShortTimeAgo(timestamp, now)
}

// Why: prompts and conversation names arrive as raw markdown; a 30-character line shows the syntax, not the words.
export function stripInlineMarkdown(text: string): string {
  return text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(?:>\s?|[-*+]\s+|\d+\.\s+)/gm, '')
    .replace(/(^|\s)#{1,6}\s+/g, '$1')
    .replace(/\*+|`+|~~/g, '')
    .replace(/[[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Why: the new card has room for one text: what the agent is doing now, else what it is about.
export function getCompactAgentSingleText(
  agent: DashboardAgentRowData,
  conversationName: string | null
): string {
  const toolName = agent.state === 'working' ? (agent.entry.toolName?.trim() ?? '') : ''
  const text = stripInlineMarkdown(
    toolName || conversationName?.trim() || getAgentRowPrimaryText(agent.entry)
  )
  return text || agentStateLabel(getAgentDotState(agent))
}

function stopActivationKeyPropagation(e: React.KeyboardEvent): void {
  // Why: the surrounding worktree list handles Enter/Space as row activation.
  // Focused nested buttons need those keys to stay local.
  if (e.key === 'Enter' || e.key === ' ') {
    e.stopPropagation()
  }
}

type CompactAgentRowProps = {
  agent: DashboardAgentRowData
  now: number
  onActivate: (tabId: string, paneKey: string) => void
  // Why: send-popover target mode temporarily turns compact sidebar rows into
  // the picker surface, matching the full DashboardAgentRow behavior.
  sendTargetStatus?: 'eligible' | 'disabled' | 'sending'
  sendTargetDisabledReason?: string
  onSendTargetClick?: (paneKey: string) => void
  childAgentCount?: number
  childAgentsExpanded?: boolean
  onToggleChildAgents?: () => void
  reserveDisclosureGutter?: boolean
  isFocusedPane?: boolean
  hideIdentityIcon?: boolean
  cacheTimerActive?: boolean
  // Why: the new card style shows one stripped text. 'card-line' is the card's line 2 (its time sits on
  // line 1); 'card-list' is a row in the expanded multi-agent list and keeps its own time.
  layout?: 'legacy' | 'card-line' | 'card-list'
}

export const CompactAgentRow = React.memo(function CompactAgentRow({
  agent,
  now,
  onActivate,
  sendTargetStatus,
  sendTargetDisabledReason,
  onSendTargetClick,
  childAgentCount,
  childAgentsExpanded = false,
  onToggleChildAgents,
  reserveDisclosureGutter = false,
  isFocusedPane = false,
  hideIdentityIcon = false,
  cacheTimerActive = true,
  layout = 'legacy'
}: CompactAgentRowProps) {
  const singleText = layout !== 'legacy'
  const hasChildDisclosure =
    typeof childAgentCount === 'number' &&
    childAgentCount > 0 &&
    typeof onToggleChildAgents === 'function'
  // Why: subagent child rows carry the child's NAME (e.g. "pr-reviewer") in
  // agentType, which is not an iconable agent and would render the unknown
  // "?" glyph. Nesting under the parent already conveys identity.
  const hideIcon = hideIdentityIcon || agent.rowSource === 'subagent'
  const dotState = getAgentDotState(agent)
  const conversationName = useAgentRowConversationName(agent)
  const primary = singleText
    ? getCompactAgentSingleText(agent, conversationName)
    : getCompactAgentPrimary(agent, conversationName)
  const isLineageChild = agent.lineage?.depth === 1
  const secondary = getCompactAgentSecondary(agent)
  const model = singleText ? '' : (agent.entry.model?.trim() ?? '')
  // Why: a new-style parent ends in its chevron instead; children carry their own times.
  const shortTime =
    layout === 'card-line' || (singleText && hasChildDisclosure)
      ? null
      : getCompactAgentTime(agent, now)
  const cacheTimer = usePromptCacheCountdownForPane(agent.paneKey, cacheTimerActive)

  const handleActivate = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      // Why: subagent child rows have no pane of their own; they focus the
      // parent pane whose session spawned them.
      onActivate(agent.tab.id, agent.activationPaneKey ?? agent.paneKey)
    },
    [agent.activationPaneKey, agent.paneKey, agent.tab.id, onActivate]
  )
  const handleSendTargetClickCapture = useCallback(
    (e: React.MouseEvent) => {
      if (!sendTargetStatus) {
        return
      }
      const target = e.target
      if (
        target instanceof Element &&
        target.closest('button, a, input, textarea, select, [role="button"]')
      ) {
        return
      }
      e.preventDefault()
      e.stopPropagation()
      if (sendTargetStatus === 'eligible') {
        onSendTargetClick?.(agent.paneKey)
      }
    },
    [agent.paneKey, onSendTargetClick, sendTargetStatus]
  )
  const handleToggleChildren = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault()
      e.stopPropagation()
      onToggleChildAgents?.()
    },
    [onToggleChildAgents]
  )
  // Why: from another pane the click must reach this agent's terminal; only once it is focused does
  // the row become the sub-agent toggle.
  const handleRowToggleChildren = useCallback(
    (e: React.MouseEvent) => {
      if (!isFocusedPane) {
        handleActivate(e)
        if (!childAgentsExpanded) {
          onToggleChildAgents?.()
        }
        return
      }
      e.stopPropagation()
      onToggleChildAgents?.()
    },
    [childAgentsExpanded, handleActivate, isFocusedPane, onToggleChildAgents]
  )
  const rowTogglesChildren = singleText && hasChildDisclosure

  const disclosureButton = hasChildDisclosure ? (
    <button
      type="button"
      className={cn(
        'compact-agent-child-disclosure-button flex size-4 shrink-0 items-center justify-center rounded-sm text-worktree-sidebar-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-worktree-sidebar-ring',
        // Why: new-style rows toggle on a click anywhere, so the chevron is a marker with no hover of
        // its own; its glyph, not the 16px hit box, ends on the time column.
        singleText ? '-mr-0.5' : 'hover:bg-worktree-sidebar-accent hover:text-foreground'
      )}
      aria-label={translate(
        'auto.components.sidebar.worktree.card.compact.agents.a128d7006b',
        '{{value0}} {{value1}} child {{value2}}',
        {
          value0: childAgentsExpanded ? 'Hide' : 'Show',
          value1: childAgentCount,
          value2: childAgentCount === 1 ? 'agent' : 'agents'
        }
      )}
      aria-expanded={childAgentsExpanded}
      onClick={handleToggleChildren}
      onKeyDown={stopActivationKeyPropagation}
    >
      <ChevronRight
        className={cn(
          'size-3 transition-transform duration-150',
          childAgentsExpanded && 'rotate-90'
        )}
        aria-hidden
      />
    </button>
  ) : null

  const rowBody = (
    <>
      {/* Why: new-style rows keep the chevron at the right end so every glyph stays on the dot's column. */}
      {singleText ? null : hasChildDisclosure ? (
        disclosureButton
      ) : reserveDisclosureGutter ? (
        <span className="size-4 shrink-0" aria-hidden />
      ) : null}
      {/* Why: a lone agent's state is already the card's status dot, so its logo takes that column. */}
      {layout === 'card-line' && !hideIcon ? (
        <span className="sr-only">{agentStateLabel(dotState)}</span>
      ) : singleText ? (
        // Why: a fixed slot keeps text aligned across rows; 12px matches the card's status dot box.
        <span className="inline-flex w-3 shrink-0 justify-center">
          <AgentStateDot state={dotState} size="sm" />
        </span>
      ) : (
        <AgentStateDot state={dotState} size="sm" />
      )}
      {!hideIcon && (
        <span className="inline-flex shrink-0" title={formatAgentTypeLabel(agent.agentType)}>
          <AgentIcon agent={agentTypeToIconAgent(agent.agentType)} size={singleText ? 12 : 13} />
        </span>
      )}
      <span className="min-w-0 flex-1 truncate">
        {/* Why: the selected-row fill is strong enough to wash out the dimmed
            prompt/secondary text, so lift both toward full foreground when focused. */}
        <span
          className={isFocusedPane ? 'text-foreground' : 'text-worktree-sidebar-muted-foreground'}
        >
          {primary}
        </span>
        {secondary && !singleText && (
          <span
            className={
              isFocusedPane ? 'text-foreground/70' : 'text-worktree-sidebar-muted-foreground'
            }
          >
            {' '}
            - {secondary}
          </span>
        )}
      </span>
      {model && (
        <span
          className={cn(
            'max-w-24 shrink-0 truncate font-mono text-[10px]',
            isFocusedPane ? 'text-foreground/70' : 'text-worktree-sidebar-muted-foreground'
          )}
          title={model}
        >
          {model}
        </span>
      )}
      {hasChildDisclosure && !childAgentsExpanded && (
        <span
          className={cn(
            'shrink-0 text-[10px] tabular-nums',
            isFocusedPane ? 'text-foreground/70' : 'text-worktree-sidebar-muted-foreground'
          )}
        >
          +{childAgentCount}
        </span>
      )}
      {cacheTimer && <CacheTimer startedAt={cacheTimer.startedAt} ttlMs={cacheTimer.ttlMs} />}
      {shortTime && (
        <span
          className={cn(
            'shrink-0 text-[10px] tabular-nums',
            // Why: the muted timestamp drops out against the selected-row fill.
            isFocusedPane ? 'text-foreground/70' : 'text-worktree-sidebar-muted-foreground'
          )}
        >
          {shortTime}
        </span>
      )}
      {singleText && disclosureButton}
    </>
  )

  return (
    <div
      draggable={false}
      className={cn(
        singleText
          ? 'compact-agent-row group/compact-agent-row min-w-0 cursor-pointer rounded-sm px-1 text-[12px] leading-none'
          : 'compact-agent-row group/compact-agent-row min-w-0 cursor-pointer rounded-sm px-1 text-[11px] leading-none',
        'text-worktree-sidebar-muted-foreground worktree-agent-row-hover',
        hasChildDisclosure && 'worktree-agent-lineage-parent-row',
        isLineageChild && 'worktree-agent-lineage-child-row',
        layout === 'card-line' ? 'flex h-5 items-center gap-1' : 'flex h-6 items-center gap-1',
        isFocusedPane && 'bg-worktree-sidebar-accent',
        sendTargetStatus === 'sending' && 'cursor-progress opacity-75',
        sendTargetStatus === 'disabled' && 'cursor-default opacity-60'
      )}
      onClickCapture={handleSendTargetClickCapture}
      onClick={rowTogglesChildren ? handleRowToggleChildren : handleActivate}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onDragStart={(e) => e.stopPropagation()}
      data-focused-agent-pane={isFocusedPane ? 'true' : undefined}
      data-agent-row-layout={singleText ? layout : undefined}
      data-agent-send-target={sendTargetStatus}
      role={agent.lineage ? 'treeitem' : undefined}
      aria-level={agent.lineage ? agent.lineage.depth + 1 : undefined}
      aria-expanded={hasChildDisclosure ? childAgentsExpanded : undefined}
      title={sendTargetDisabledReason ?? `${primary}${secondary ? ` - ${secondary}` : ''}`}
    >
      {rowBody}
    </div>
  )
})
