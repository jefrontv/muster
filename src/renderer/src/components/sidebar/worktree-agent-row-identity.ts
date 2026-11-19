import type { PaneForegroundAgentEntry } from '@/store/slices/pane-foreground-agent'
import type { AgentStatusEntry, AgentType } from '../../../../shared/agent-status-types'
import { resolveCompatibleAgentTypeForOwner } from '../../../../shared/agent-title-owner'
import type { TerminalTab } from '../../../../shared/types'
import { resolveAgentTypeFromTerminalTitle } from './worktree-title-derived-agent-rows'

export function resolveRowAgentType(entry: AgentStatusEntry, tab?: TerminalTab | null): AgentType {
  const entryAgentType = resolveCompatibleAgentTypeForOwner(entry.agentType, tab?.launchAgent)
  if (entryAgentType && entryAgentType !== 'unknown') {
    return entryAgentType
  }
  return (
    resolveAgentTypeFromTerminalTitle(entry.terminalTitle ?? tab?.title, tab?.launchAgent) ??
    tab?.launchAgent ??
    entryAgentType ??
    'unknown'
  )
}

export function resolveCurrentRowAgentType(
  entry: AgentStatusEntry,
  tab: TerminalTab,
  foreground: PaneForegroundAgentEntry | undefined,
  isFresh: boolean
): AgentType | null {
  const reportedAgent = resolveRowAgentType(entry, tab)
  const foregroundAgent = foreground?.shellForeground
    ? null
    : resolveCompatibleAgentTypeForOwner(foreground?.agent, tab.launchAgent)
  if (!foregroundAgent) {
    return reportedAgent
  }
  // Let the foreground row replace stale status for a different process.
  if (reportedAgent !== foregroundAgent && (!isFresh || entry.state === 'done')) {
    return null
  }
  return !entry.agentType || entry.agentType === 'unknown' ? foregroundAgent : reportedAgent
}
