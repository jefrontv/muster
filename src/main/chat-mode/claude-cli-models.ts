// The Claude CLI's own model list, asked over its control protocol (`initialize`), so an alias
// pick ("haiku") is named for the model it resolves to today rather than the newest one this
// machine happens to have used. No conversation starts and no tokens are spent.

import { spawn, type ChildProcess } from 'node:child_process'
import { buildChatThreadStreamSpawnPlan } from './chat-thread-stream-spawn-plan'

export type ClaudeCliModel = {
  /** The alias or id to pass to `--model` ("haiku", "default"). */
  value: string
  /** The concrete model it resolves to on this CLI and account ("claude-haiku-5-5"). */
  resolvedModel: string | null
  displayName: string | null
}

const PROBE_COMMAND = 'claude -p --input-format stream-json --output-format stream-json --verbose'
const PROBE_TIMEOUT_MS = 20_000
// The CLI updates itself; re-ask now and then so a long-running app picks up a new release.
const CACHE_TTL_MS = 6 * 60 * 60 * 1000

type SpawnProbe = (
  shell: string,
  args: string[],
  options: { cwd?: string; env: NodeJS.ProcessEnv }
) => ChildProcess

export function parseClaudeCliModels(response: unknown): ClaudeCliModel[] {
  const models = (response as { models?: unknown } | null)?.models
  if (!Array.isArray(models)) {
    return []
  }
  return models.flatMap((entry) => {
    const model = entry as Record<string, unknown> | null
    if (!model || typeof model.value !== 'string' || model.value === '') {
      return []
    }
    return [
      {
        value: model.value,
        resolvedModel: typeof model.resolvedModel === 'string' ? model.resolvedModel : null,
        displayName: typeof model.displayName === 'string' ? model.displayName : null
      }
    ]
  })
}

export function probeClaudeCliModels(
  spawnProbe: SpawnProbe = (shell, args, options) =>
    spawn(shell, args, { ...options, stdio: ['pipe', 'pipe', 'ignore'] })
): Promise<ClaudeCliModel[]> {
  return new Promise((resolve) => {
    const plan = buildChatThreadStreamSpawnPlan({ command: PROBE_COMMAND })
    let child: ChildProcess
    try {
      child = spawnProbe(plan.shellPath, plan.args, plan.options)
    } catch {
      resolve([])
      return
    }
    let settled = false
    let buffered = ''
    const finish = (models: ClaudeCliModel[]): void => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      child.kill()
      resolve(models)
    }
    const timer = setTimeout(() => finish([]), PROBE_TIMEOUT_MS)
    child.on('error', () => finish([]))
    child.on('exit', () => finish([]))
    child.stdout?.on('data', (chunk: Buffer) => {
      buffered += chunk.toString()
      const lines = buffered.split('\n')
      buffered = lines.pop() ?? ''
      for (const line of lines) {
        try {
          const record = JSON.parse(line) as {
            type?: string
            response?: { request_id?: string; response?: unknown }
          }
          if (record.type === 'control_response' && record.response?.request_id === 'models') {
            finish(parseClaudeCliModels(record.response.response))
            return
          }
        } catch {
          // Non-JSON noise from a login shell profile.
        }
      }
    })
    child.stdin?.on('error', () => finish([]))
    child.stdin?.write(
      `${JSON.stringify({ type: 'control_request', request_id: 'models', request: { subtype: 'initialize' } })}\n`
    )
  })
}

let cached: { at: number; models: ClaudeCliModel[] } | null = null
let inFlight: Promise<ClaudeCliModel[]> | null = null

/** Cached for a few hours; an empty answer (no CLI, offline login shell) is retried next time. */
export async function getClaudeCliModels(now = Date.now()): Promise<ClaudeCliModel[]> {
  if (cached && now - cached.at < CACHE_TTL_MS) {
    return cached.models
  }
  inFlight ??= probeClaudeCliModels().finally(() => {
    inFlight = null
  })
  const models = await inFlight
  if (models.length > 0) {
    cached = { at: now, models }
  }
  return models
}
