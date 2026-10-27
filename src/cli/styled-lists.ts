import type { Automation } from '../shared/automations-types'
import { formatAutomationSchedule } from '../shared/automation-schedules'
import type {
  RuntimeRepoList,
  RuntimeTerminalListResult,
  RuntimeWorktreeListResult,
  RuntimeWorktreePsResult
} from '../shared/runtime-types'
import type { Project } from '../shared/types'
import { glyph, table, tone } from './cli-style'

function stateGlyph(live: boolean): string {
  return live ? tone('success', glyph('live')) : tone('muted', glyph('idle'))
}

function withTruncation(body: string, shown: number, total: number, truncated: boolean): string {
  return truncated ? `${body}\n${tone('muted', `Showing ${shown} of ${total}.`)}` : body
}

export function styledRepoList(result: RuntimeRepoList): string {
  return table(
    [{ header: 'NAME' }, { header: 'TYPE' }, { header: 'PATH', flexible: true }],
    result.repos.map((repo) => [
      tone('accent', repo.displayName),
      repo.kind === 'folder' ? 'folder' : 'git',
      tone('muted', repo.path)
    ])
  )
}

export function styledWorktreeList(result: RuntimeWorktreeListResult): string {
  const body = table(
    [{ header: 'NAME' }, { header: 'BRANCH', flexible: true }, { header: 'PATH', flexible: true }],
    result.worktrees.map((worktree) => [
      tone('accent', String(worktree.displayName ?? worktree.branch ?? '')),
      String(worktree.branch ?? ''),
      tone('muted', String(worktree.path))
    ])
  )
  return withTruncation(body, result.worktrees.length, result.totalCount, result.truncated)
}

export function styledWorktreePs(result: RuntimeWorktreePsResult): string {
  const body = table(
    [
      { header: '' },
      { header: 'REPO' },
      { header: 'BRANCH', flexible: true },
      { header: 'TERMINALS' },
      { header: 'PATH', flexible: true }
    ],
    result.worktrees.map((worktree) => [
      stateGlyph(worktree.liveTerminalCount > 0),
      tone('accent', worktree.repo),
      `${worktree.branch}${worktree.unread ? ` ${tone('warning', 'unread')}` : ''}`,
      String(worktree.liveTerminalCount),
      tone('muted', worktree.path)
    ])
  )
  return withTruncation(body, result.worktrees.length, result.totalCount, result.truncated)
}

export function styledTerminalList(result: RuntimeTerminalListResult): string {
  const body = table(
    [
      { header: '' },
      { header: 'HANDLE' },
      { header: 'TITLE', flexible: true },
      { header: 'WORKTREE', flexible: true }
    ],
    result.terminals.map((terminal) => [
      stateGlyph(terminal.connected),
      tone('accent', terminal.handle),
      terminal.title ?? tone('muted', '(untitled)'),
      tone('muted', terminal.worktreePath)
    ])
  )
  return withTruncation(body, result.terminals.length, result.totalCount, result.truncated)
}

export function styledAutomationList(result: { automations: Automation[] }): string {
  return table(
    [
      { header: '' },
      { header: 'NAME', flexible: true },
      { header: 'AGENT' },
      { header: 'SCHEDULE', flexible: true },
      { header: 'NEXT RUN' }
    ],
    result.automations.map((automation) => [
      stateGlyph(automation.enabled),
      tone('accent', automation.name),
      automation.agentId,
      formatAutomationSchedule(automation.rrule),
      automation.enabled ? new Date(automation.nextRunAt).toLocaleString() : tone('muted', 'off')
    ])
  )
}

export function styledProjectList(result: { projects: Project[] }): string {
  return table(
    [{ header: 'NAME' }, { header: 'PROVIDER', flexible: true }, { header: 'ID' }],
    result.projects.map((project) => [
      tone('accent', project.displayName),
      project.providerIdentity
        ? `${project.providerIdentity.owner}/${project.providerIdentity.repo}`
        : tone('muted', 'none'),
      tone('muted', project.id)
    ])
  )
}
