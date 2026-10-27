import { statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import type { RuntimeWorkspaceOpenPathResult } from '../shared/runtime-types'
import type { RuntimeClient } from './runtime-client'
import { RuntimeClientError } from './runtime-client'
import { isCliStyleEnabled, keyValueBlock, statusLine, tone } from './cli-style'

const GRAPH_READY_TIMEOUT_MS = 15_000

function looksLikePath(value: string, cwd: string): boolean {
  if (/^[.~/]/.test(value) || /^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\')) {
    return true
  }
  try {
    return statSync(resolve(cwd, value)).isDirectory()
  } catch {
    return false
  }
}

/** `muster .` / `muster ~/site` mean `muster open <path>`; a known command name always wins. */
export function rewriteBarePathInvocation(
  argv: string[],
  cwd: string,
  topLevelCommands: ReadonlySet<string>
): string[] {
  const first = argv[0]
  if (!first || first.startsWith('-') || topLevelCommands.has(first)) {
    return argv
  }
  return looksLikePath(first, cwd) ? ['open', ...argv] : argv
}

export function expandHomePath(value: string): string {
  if (value === '~') {
    return homedir()
  }
  return value.startsWith('~/') || value.startsWith('~\\') ? join(homedir(), value.slice(2)) : value
}

/** Launches Muster only when no window is up; an existing window is revealed by the runtime. */
export async function ensureMusterWindow(client: RuntimeClient): Promise<void> {
  const status = await client.getCliStatus()
  if (status.result.app.desktopWindowStatus !== 'available') {
    await client.openOrca()
  }
}

// Why: the desktop window can report available before the repo/worktree graph finishes loading.
export async function waitForRuntimeGraphReady(client: RuntimeClient): Promise<void> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < GRAPH_READY_TIMEOUT_MS) {
    const status = await client.getCliStatus()
    if (status.result.graph.state === 'ready') {
      return
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250))
  }
  throw new RuntimeClientError(
    'runtime_open_timeout',
    'Timed out waiting for Muster to finish loading projects.'
  )
}

export function formatWorkspaceOpenPath(result: RuntimeWorkspaceOpenPathResult): string {
  const verb = result.outcome === 'imported' ? 'Added and opened' : 'Opened'
  const sameFolder = result.worktree.path === result.repo.path
  const target = sameFolder
    ? result.repo.displayName
    : `${result.worktree.displayName} (${result.repo.displayName})`
  if (isCliStyleEnabled()) {
    return [
      statusLine('success', `${verb} ${tone('bold', target)}`),
      keyValueBlock([
        ['path', result.worktree.path],
        ['type', result.kind === 'git' ? 'git project' : 'folder project']
      ])
    ].join('\n')
  }
  return `${verb} ${target}\n${result.worktree.path}`
}
