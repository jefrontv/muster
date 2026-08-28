// Shared helpers for the custom-step tools: reading and validating the fields an agent sends,
// and writing the resulting array back to the site.
//
// Split from site-mcp-custom-step-tools.ts to keep both files inside the max-lines budget; the
// tool definitions there read as a table, these are the mechanics behind them.

import { isSafeCustomStepScriptPath } from '../../../shared/site-types'
import type {
  Site,
  SiteCustomStep,
  SiteCustomStepPosition,
  SiteRunGroup
} from '../../../shared/site-types'
import { SiteMcpToolError } from './site-mcp-arguments'
import type { SiteMcpContext } from './site-mcp-context'

export const MAX_COMMAND_LENGTH = 8_192

export function listSteps(site: Site): SiteCustomStep[] {
  return site.customSteps ?? []
}

export function describeStep(step: SiteCustomStep): Record<string, unknown> {
  return {
    id: step.id,
    name: step.name,
    description: step.description ?? '',
    group: step.group,
    runs_on: step.runsOn,
    position: step.position,
    order: step.order,
    enabled: step.enabled,
    // Always surfaced: an agent (and the human reading its transcript) must be able to see exactly
    // what a step will execute.
    command: step.command,
    script_path: step.scriptPath ?? null,
    origin: step.origin ?? null
  }
}

/**
 * The `command` / `script_path` pair, enforcing exactly one.
 *
 * Returned as a partial step so create spreads it and update spreads only what changed. Setting
 * one clears the other: a step that carried both would leave the runner to pick, and the caller
 * would not know which won until it ran against production.
 */
export function readStepSource(
  raw: Record<string, unknown>,
  required: true
): Pick<SiteCustomStep, 'command'> & { scriptPath?: string }
export function readStepSource(
  raw: Record<string, unknown>,
  required: false
): Partial<Pick<SiteCustomStep, 'command' | 'scriptPath'>>
export function readStepSource(
  raw: Record<string, unknown>,
  required: boolean
): Partial<Pick<SiteCustomStep, 'command' | 'scriptPath'>> {
  const hasCommand = raw.command !== undefined
  const hasScript = raw.script_path !== undefined
  if (hasCommand && hasScript) {
    throw new SiteMcpToolError(
      "Give either 'command' or 'script_path', not both — a step runs one or the other."
    )
  }
  if (!hasCommand && !hasScript) {
    if (required) {
      throw new SiteMcpToolError("Either 'command' or 'script_path' is required.")
    }
    return {}
  }
  if (hasScript) {
    const value = raw.script_path
    if (!isSafeCustomStepScriptPath(value)) {
      throw new SiteMcpToolError(
        "'script_path' must be a repo-relative path inside the checkout — no leading '/', no '..'."
      )
    }
    return { scriptPath: value.trim(), command: '' }
  }
  return { command: readCommand(raw, true)!, scriptPath: undefined }
}

export function readGroup(
  raw: Record<string, unknown>,
  key: string,
  fallback?: SiteRunGroup
): SiteRunGroup {
  const value = raw[key]
  if (value === undefined && fallback !== undefined) {
    return fallback
  }
  if (value !== 'import' && value !== 'deploy') {
    throw new SiteMcpToolError(`'${key}' must be 'import' or 'deploy'.`)
  }
  return value
}

export function readRunsOn(
  raw: Record<string, unknown>,
  fallback?: 'remote' | 'local'
): 'remote' | 'local' {
  const value = raw.runs_on
  if (value === undefined && fallback !== undefined) {
    return fallback
  }
  if (value !== 'remote' && value !== 'local') {
    throw new SiteMcpToolError(
      "'runs_on' must be 'remote' (over SSH) or 'local' (in the checkout)."
    )
  }
  return value
}

export function readPosition(
  raw: Record<string, unknown>,
  fallback: SiteCustomStepPosition = 'after'
): SiteCustomStepPosition {
  const value = raw.position
  if (value === undefined) {
    return fallback
  }
  if (value !== 'before' && value !== 'after') {
    throw new SiteMcpToolError(
      "'position' must be 'before' or 'after' — where the step sits relative to the built-in steps of its group."
    )
  }
  return value
}

export function readCommand(raw: Record<string, unknown>, required: boolean): string | undefined {
  const value = raw.command
  if (value === undefined) {
    if (required) {
      throw new SiteMcpToolError("'command' is required.")
    }
    return undefined
  }
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new SiteMcpToolError("'command' must be a non-empty string.")
  }
  if (value.length > MAX_COMMAND_LENGTH) {
    throw new SiteMcpToolError(`'command' exceeds ${MAX_COMMAND_LENGTH} characters.`)
  }
  return value
}

export function readName(raw: Record<string, unknown>, required: boolean): string | undefined {
  const value = raw.name
  if (value === undefined) {
    if (required) {
      throw new SiteMcpToolError("'name' is required.")
    }
    return undefined
  }
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new SiteMcpToolError("'name' must be a non-empty string.")
  }
  return value.trim()
}

export async function saveSteps(
  context: SiteMcpContext,
  site: Site,
  steps: SiteCustomStep[]
): Promise<Record<string, unknown>> {
  const updated = await context.updateSite(site.id, { customSteps: steps })
  if (!updated) {
    throw new SiteMcpToolError('The site could not be updated; nothing was saved.', {
      site_id: site.id
    })
  }
  return {
    ok: true,
    steps: listSteps(updated).map((step) => describeStep(step))
  }
}

/**
 * The shared library, via the context. A transport that does not carry it reads as empty and
 * refuses writes rather than pretending the write landed.
 */
export function readLibrary(context: SiteMcpContext): SiteCustomStep[] {
  return context.getStepLibrary?.() ?? []
}

export async function writeLibrary(
  context: SiteMcpContext,
  steps: readonly SiteCustomStep[]
): Promise<void> {
  const write = context.setStepLibrary
  if (!write) {
    throw new SiteMcpToolError('This Muster build cannot write the shared step library.')
  }
  await write(steps)
}

export function findStep(site: Site, id: string): SiteCustomStep {
  const step = listSteps(site).find((entry) => entry.id === id)
  if (!step) {
    throw new SiteMcpToolError(`No custom step with id '${id}' on this site.`, {
      available_ids: listSteps(site).map((entry) => entry.id)
    })
  }
  return step
}

/** Appends after the current highest order in the same (group, position) lane. */
export function nextOrder(
  steps: SiteCustomStep[],
  group: SiteRunGroup,
  position: SiteCustomStepPosition
): number {
  const lane = steps.filter((step) => step.group === group && step.position === position)
  return lane.reduce((highest, step) => Math.max(highest, step.order + 1), 0)
}

export const STEP_ID_PROPERTY = {
  step: { type: 'string', description: 'Custom step id.' }
} as const
