import type { RuntimeClient } from './runtime-client'
import { RuntimeClientError } from './runtime-client'
import { CORE_HANDLERS } from './handlers/core'
import { AUTOMATION_HANDLERS } from './handlers/automations'
import { PROJECT_HANDLERS } from './handlers/project'
import { REPO_HANDLERS } from './handlers/repo'
import { WORKTREE_HANDLERS } from './handlers/worktree'
import { FILE_HANDLERS } from './handlers/file'
import { TERMINAL_HANDLERS } from './handlers/terminal'
import { BROWSER_EXTENSION_HANDLERS } from './handlers/browser-extension'
import { ORCHESTRATION_HANDLERS } from './handlers/orchestration'
import { ENVIRONMENT_HANDLERS } from './handlers/environment'
import { AGENT_HOOK_HANDLERS } from './handlers/agent-hooks'
import { DIAGNOSTICS_HANDLERS } from './handlers/diagnostics'
import { INTROSPECTION_HANDLERS } from './handlers/introspection'
import { LINEAR_HANDLERS } from './handlers/linear'
import { VM_HANDLERS } from './handlers/vm'
import { SKILL_HANDLERS } from './handlers/skills'

export type HandlerContext = {
  flags: Map<string, string | boolean>
  client: RuntimeClient
  cwd: string
  json: boolean
  rawArgs?: string[]
}

export type CommandHandler = (ctx: HandlerContext) => Promise<void>

function buildHandlers(): Map<string, CommandHandler> {
  const table = new Map<string, CommandHandler>()
  const groups = [
    CORE_HANDLERS,
    AUTOMATION_HANDLERS,
    PROJECT_HANDLERS,
    REPO_HANDLERS,
    WORKTREE_HANDLERS,
    FILE_HANDLERS,
    TERMINAL_HANDLERS,
    BROWSER_EXTENSION_HANDLERS,
    ORCHESTRATION_HANDLERS,
    AGENT_HOOK_HANDLERS,
    DIAGNOSTICS_HANDLERS,
    INTROSPECTION_HANDLERS,
    ENVIRONMENT_HANDLERS,
    LINEAR_HANDLERS,
    VM_HANDLERS,
    SKILL_HANDLERS
  ]
  for (const group of groups) {
    for (const [key, handler] of Object.entries(group)) {
      if (table.has(key)) {
        throw new Error(`Duplicate CLI handler registration for "${key}"`)
      }
      table.set(key, handler)
    }
  }
  return table
}

const HANDLERS = buildHandlers()

// Why: exposes only the canonical command keys (not the handler internals) so the
// registry-parity guard can check specs↔handlers without rebuilding the table.
export const HANDLER_COMMAND_KEYS: ReadonlySet<string> = new Set(HANDLERS.keys())

export async function dispatch(commandPath: string[], ctx: HandlerContext): Promise<void> {
  const handler = HANDLERS.get(commandPath.join(' '))
  if (!handler) {
    throw new RuntimeClientError('invalid_argument', `Unknown command: ${commandPath.join(' ')}`)
  }
  await handler(ctx)
}
