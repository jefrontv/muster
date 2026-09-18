// ACF $post_id selection: one target, or up to 20 in a single run.
//
// A missing or junk id is refused here rather than resolving to 0, which ACF would read as the
// current post and write somewhere nobody asked for.

import { SiteMcpToolError, type ToolArguments } from './mcp/site-mcp-arguments'

export const ACF_MAX_TARGETS = 20

export type AcfTargetKind = 'option' | 'post' | 'term' | 'user' | 'comment'

export type AcfTarget = {
  kind: AcfTargetKind
  id?: string | number
}

const TARGET_KINDS: readonly AcfTargetKind[] = ['option', 'post', 'term', 'user', 'comment']

export function parseAcfTarget(raw: Record<string, unknown>): AcfTarget {
  const kindRaw = raw.kind
  if (kindRaw === 'options') {
    return parseAcfTarget({ ...raw, kind: 'option' })
  }
  if (typeof kindRaw !== 'string' || !(TARGET_KINDS as readonly string[]).includes(kindRaw)) {
    throw new SiteMcpToolError("'target.kind' must be option, post, term, user, or comment.")
  }
  const kind = kindRaw as AcfTargetKind
  const id = raw.id
  if (kind === 'option') {
    if (id === undefined || id === null || id === '') {
      return { kind: 'option' }
    }
    if (typeof id === 'string' || typeof id === 'number') {
      return { kind: 'option', id }
    }
    throw new SiteMcpToolError("'target.id' for option must be a string.")
  }
  if (id === undefined || id === null || id === '') {
    throw new SiteMcpToolError(`'target.id' is required for kind '${kind}'.`)
  }
  if (typeof id === 'number' && Number.isInteger(id) && id > 0) {
    return { kind, id }
  }
  if (typeof id === 'string' && /^[0-9]+$/.test(id)) {
    const parsed = Number.parseInt(id, 10)
    if (parsed > 0) {
      return { kind, id: parsed }
    }
  }
  throw new SiteMcpToolError(`'target.id' for kind '${kind}' must be a positive integer.`)
}

export function readAcfTarget(args: ToolArguments): AcfTarget {
  const value = args.target
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new SiteMcpToolError("'target' must be an object.")
  }
  return parseAcfTarget(value as Record<string, unknown>)
}

export function readAcfTargets(args: ToolArguments): AcfTarget[] {
  const value = args.targets
  if (value === undefined || value === null) {
    return []
  }
  if (!Array.isArray(value) || value.length === 0) {
    throw new SiteMcpToolError("'targets' must be a non-empty array of {kind, id}.")
  }
  if (value.length > ACF_MAX_TARGETS) {
    throw new SiteMcpToolError(`'targets' may list at most ${ACF_MAX_TARGETS} targets.`)
  }
  return value.map((entry, index) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new SiteMcpToolError(`'targets[${index}]' must be an object with kind and id.`)
    }
    return parseAcfTarget(entry as Record<string, unknown>)
  })
}

export type AcfTargetSelection = { target: AcfTarget } | { targets: AcfTarget[] }

// One or the other: a call carrying both reads as a typo, and guessing which wins writes blind.
export function readAcfTargetSelection(args: ToolArguments): AcfTargetSelection {
  const targets = readAcfTargets(args)
  if (targets.length === 0) {
    return { target: readAcfTarget(args) }
  }
  if (args.target !== undefined && args.target !== null) {
    throw new SiteMcpToolError("Pass 'target' or 'targets', not both.")
  }
  return { targets }
}
