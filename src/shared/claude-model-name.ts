// Display names for Claude model ids and CLI aliases ("claude-opus-5-5" -> "Opus 5.5").
// Ported from the parked redesign's claude-model-name, extended for cloud-provider
// ids, legacy version-first ids and the 1M variant. The catalog `label` stays a
// bare family name: the "Set model to …" echo check matches on it.

import { claudeContextWindowForModel } from './claude-context-window'

const FAMILIES = ['opus', 'sonnet', 'haiku', 'fable'] as const
const FAMILY_FIRST = /claude-(opus|sonnet|haiku|fable)-(\d+)(?:-(\d{1,2}))?(?!\d)/
const VERSION_FIRST = /claude-(\d+)(?:-(\d{1,2}))?-(opus|sonnet|haiku|fable)(?![a-z])/
const ONE_MILLION = /\[1m\]/i

function titleCase(family: string): string {
  return `${family[0]!.toUpperCase()}${family.slice(1)}`
}

/** Drops cloud-provider wrapping (`us.anthropic.` prefix, `@date` / `-v1:0` suffix). */
function normalizeModelId(id: string): string {
  return id
    .trim()
    .toLowerCase()
    .replace(/^(?:[a-z]{2}\.)?anthropic\./, '')
    .replace(/@\d{8}$/, '')
    .replace(/-v\d+(?::\d+)?$/, '')
}

/** "Opus 5.5" for a concrete id; null when it is not a recognisable Claude model. */
export function claudeModelShortName(id: string | null | undefined): string | null {
  if (!id) {
    return null
  }
  const normalized = normalizeModelId(id)
  const familyFirst = FAMILY_FIRST.exec(normalized)
  if (familyFirst) {
    const [, family = '', major, minor] = familyFirst
    return `${titleCase(family)} ${minor ? `${major}.${minor}` : major}`
  }
  const versionFirst = VERSION_FIRST.exec(normalized)
  if (versionFirst) {
    const [, major, minor, family = ''] = versionFirst
    return `${titleCase(family)} ${minor ? `${major}.${minor}` : major}`
  }
  return null
}

function isFamilyAlias(value: string): value is (typeof FAMILIES)[number] {
  return (FAMILIES as readonly string[]).includes(value)
}

/** "(1M)" only for an explicit 1M pick of a model that is not 1M already. */
function withOneMillionMark(name: string, picked: string, resolvedId: string | null): string {
  if (!ONE_MILLION.test(picked)) {
    return name
  }
  const baseId = (resolvedId ?? picked).replace(ONE_MILLION, '')
  return claudeContextWindowForModel(baseId) >= 1_000_000 ? name : `${name} (1M)`
}

export type ClaudeModelNameInput = {
  /** Muster's pick: an alias (`opus`, `default`) or a concrete id. */
  picked: string | null
  /** The model the session reported in its `system/init` record. */
  reported?: string | null
  /** Newest registry sighting for a family alias, before the session reports. */
  latestSighting?: (family: string) => string | null
}

/**
 * The composer pill's model name. Reported model wins; an alias falls back to the
 * newest sighting of its family, then the bare family. Null for an unrecognised
 * id, which the popover shows raw but the pill never does.
 */
export function claudeModelDisplayName(input: ClaudeModelNameInput): string | null {
  const picked = (input.picked ?? '').trim()
  const alias = picked.toLowerCase().replace(ONE_MILLION, '')
  const reportedName = claudeModelShortName(input.reported)
  if (alias === 'default') {
    return reportedName ? `Default · ${reportedName}` : 'Default'
  }
  if (reportedName) {
    return withOneMillionMark(reportedName, picked, input.reported ?? null)
  }
  if (isFamilyAlias(alias)) {
    const sighting = input.latestSighting?.(alias) ?? null
    const name = claudeModelShortName(sighting) ?? titleCase(alias)
    return withOneMillionMark(name, picked, sighting)
  }
  const pickedName = claudeModelShortName(picked)
  return pickedName ? withOneMillionMark(pickedName, picked, picked) : null
}

/** Newest id per family from the learned-model registry ({ id: { lastSeenAt } }). */
export function latestClaudeSightings(
  learned: Record<string, { lastSeenAt: number }>
): (family: string) => string | null {
  const newest = new Map<string, { id: string; at: number }>()
  for (const [id, entry] of Object.entries(learned)) {
    const normalized = normalizeModelId(id)
    const family = FAMILIES.find(
      (candidate) =>
        FAMILY_FIRST.exec(normalized)?.[1] === candidate ||
        VERSION_FIRST.exec(normalized)?.[3] === candidate
    )
    const current = family ? newest.get(family) : undefined
    if (family && (!current || entry.lastSeenAt > current.at)) {
      newest.set(family, { id, at: entry.lastSeenAt })
    }
  }
  return (family) => newest.get(family)?.id ?? null
}
