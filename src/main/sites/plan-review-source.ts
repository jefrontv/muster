// Resolving a review's source: the plan text, and the project label that gives it context.
//
// Both transports need identical limits and identical refusals — the MCP tool shows a model the
// error, the agent-hooks routes hand it to an extension — so the loading rules live here rather
// than in either caller, and a plan rejected on one path is rejected on the other for the same
// reason.

import { readFileSync } from 'node:fs'
import { basename, isAbsolute, resolve } from 'node:path'

/** Refuses a file that is clearly not a plan before showing a person a wall of binary. */
export const MAX_PLAN_BYTES = 1_000_000

/** Why a code and not just a message: each caller renders the same refusal its own way. */
export type PlanSourceErrorCode = 'bad-request' | 'unreadable-plan' | 'plan-too-large'

export class PlanSourceError extends Error {
  readonly code: PlanSourceErrorCode

  constructor(code: PlanSourceErrorCode, message: string) {
    super(message)
    this.name = 'PlanSourceError'
    this.code = code
  }
}

export type PlanSourceRequest = {
  /** Absolute or cwd-relative markdown path; empty when the plan is inline. */
  path: string
  /** Inline markdown; empty when the plan is on disk. */
  content: string
  cwd: string
}

/**
 * Reads what the reviewer will see: the loaded plan text and, when it came from disk, its path.
 *
 * Inline plans are not size-checked — the caller already holds the text and nothing is being read
 * blind. Files are, because the next thing that happens is a modal.
 */
export function loadPlanText(request: PlanSourceRequest): {
  planPath: string | null
  title: string
  content: string
} {
  const { path, content, cwd } = request
  if (path.length > 0 && content.length > 0) {
    throw new PlanSourceError('bad-request', "Pass either 'path' or 'content', not both.")
  }
  if (path.length === 0 && content.length === 0) {
    throw new PlanSourceError(
      'bad-request',
      "Pass 'path' to a markdown file, or 'content' with the plan text."
    )
  }
  if (content.length > 0) {
    return { planPath: null, title: 'Plan', content }
  }
  const absolute = isAbsolute(path) ? path : resolve(cwd, path)
  let fileText: string
  try {
    fileText = readFileSync(absolute, 'utf-8')
  } catch {
    throw new PlanSourceError('unreadable-plan', `Cannot read plan at ${absolute}.`)
  }
  if (fileText.length > MAX_PLAN_BYTES) {
    throw new PlanSourceError('plan-too-large', `Plan at ${absolute} is too large to review.`)
  }
  return { planPath: absolute, title: basename(absolute), content: fileText }
}

/** What a site contributes to a review header: where it can be found, and what to call it. */
export type PlanProjectSite = { path: string; displayName: string }

/**
 * What the plan is about, for the review header.
 *
 * The deepest matching site wins, so a worktree nested under a site root resolves to that site
 * rather than to a shorter path that happens to share a prefix. A checkout Muster does not manage
 * is not an error here — the directory name is still more use to a reviewer than nothing.
 */
export function describePlanProject(cwd: string, sites: readonly PlanProjectSite[]): string | null {
  let best: { path: string; name: string } | null = null
  for (const site of sites) {
    const root = site.path
    if (root.length === 0) {
      continue
    }
    const inside = cwd === root || cwd.startsWith(root.endsWith('/') ? root : `${root}/`)
    if (!inside) {
      continue
    }
    if (best === null || root.length > best.path.length) {
      best = { path: root, name: site.displayName }
    }
  }
  return best?.name ?? basename(cwd) ?? null
}
