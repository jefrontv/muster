// Shared transport plumbing for the ActiveCollab renderer clients. Both the read/account surface
// (runtime-activecollab-client.ts) and the write surface (runtime-activecollab-writes.ts) dispatch
// through `callActiveCollab`, so the throw barrier and the runtime-target resolution live here once.

import type { GlobalSettings } from '../../../shared/types'
import type { ActiveCollabResult } from '../../../shared/activecollab-api-types'
import { callRuntimeRpc, getActiveRuntimeTarget } from './runtime-rpc-client'
import {
  getTaskSourceRuntimeSettings,
  type TaskSourceContext
} from '../../../shared/task-source-context'

export type RuntimeActiveCollabSettings =
  | Pick<GlobalSettings, 'activeRuntimeEnvironmentId'>
  | TaskSourceContext
  | null
  | undefined

// Same split as Jira: an account probe is cheap, everything else can hit a slow instance.
export const ACCOUNT_TIMEOUT_MS = 15_000
export const OPERATION_TIMEOUT_MS = 30_000

function isTaskSourceRuntimeSettings(
  settings: RuntimeActiveCollabSettings
): settings is TaskSourceContext {
  return settings !== null && settings !== undefined && 'kind' in settings
}

export function isActiveCollabResult<T>(value: unknown): value is ActiveCollabResult<T> {
  return (
    typeof value === 'object' && value !== null && 'ok' in value && typeof value.ok === 'boolean'
  )
}

/**
 * The one throw barrier for this module. Both transports already answer `ActiveCollabResult`, so a
 * well-formed answer is returned untouched; every abnormal outcome — a missing bridge, an RPC
 * timeout, a runtime error envelope, a payload that is not a result at all — funnels into one
 * `unknown` failure, because a rejected promise crossing this boundary would strip the `kind` the
 * UI branches on.
 */
export async function callActiveCollab<T>(
  method: string,
  params: unknown,
  settings: RuntimeActiveCollabSettings,
  timeoutMs: number,
  local: () => Promise<ActiveCollabResult<T>>
): Promise<ActiveCollabResult<T>> {
  // Why: task source context makes provider ownership explicit; legacy callers
  // still pass focused runtime settings until Tasks finishes migrating.
  const target = getActiveRuntimeTarget(
    isTaskSourceRuntimeSettings(settings) ? getTaskSourceRuntimeSettings(settings) : settings
  )
  try {
    const result =
      target.kind === 'environment'
        ? await callRuntimeRpc<ActiveCollabResult<T>>(target, method, params, { timeoutMs })
        : await local()
    if (!isActiveCollabResult<T>(result)) {
      throw new Error(`${method} returned a malformed response.`)
    }
    return result
  } catch (error) {
    return {
      ok: false,
      kind: 'unknown',
      error: error instanceof Error ? error.message : String(error),
      status: null
    }
  }
}
