// Promote and install semantics for the shared step library.
//
// Both directions COPY, and both have to move a script file between checkouts. The MCP tools and
// the renderer's IPC handlers each need this, so it lives here rather than in either of them — a
// promote that forgot to embed the script would produce a library entry useless on every other site.

import { randomUUID } from 'node:crypto'
import type { Site, SiteCustomStep } from '../../shared/site-types'
import { readScriptWithin, writeScriptWithin } from './custom-step-script'

/** Raised for the cases a caller should surface verbatim; each message names the fix. */
export class CustomStepLibraryError extends Error {}

/**
 * A library entry copied from one of a site's steps.
 *
 * Stored disabled: a template is not something that runs where it sits, so enabling happens on
 * install. A script step carries its contents, because a library entry cannot point at a file in
 * the checkout it came from.
 */
export async function buildLibraryEntry(
  site: Site,
  step: SiteCustomStep,
  library: readonly SiteCustomStep[]
): Promise<SiteCustomStep> {
  const entry: SiteCustomStep = {
    ...step,
    id: randomUUID(),
    order: library.length,
    enabled: false,
    origin: { kind: 'copied', fromSiteId: site.id }
  }
  if (entry.scriptPath) {
    const contents = await readScriptWithin(site.path, entry.scriptPath)
    if (contents === null) {
      throw new CustomStepLibraryError(
        `Script '${entry.scriptPath}' was not found in ${site.displayName || site.path}, so there is nothing to promote.`
      )
    }
    entry.scriptContents = contents
  }
  return entry
}

/** Where a newly installed step sits: last in its own (group, position) lane. */
export function nextLaneOrder(
  steps: readonly SiteCustomStep[],
  template: Pick<SiteCustomStep, 'group' | 'position'>
): number {
  return steps
    .filter((step) => step.group === template.group && step.position === template.position)
    .reduce((highest, step) => Math.max(highest, step.order + 1), 0)
}

export type InstalledStep = {
  step: SiteCustomStep
  /** How the script file was handled, or null when the step is a plain command. */
  script: { path: string; outcome: 'written' | 'identical' } | null
}

/**
 * A site's own copy of a library entry.
 *
 * The installed step reads its script from the checkout like any other, so the embedded copy is
 * written out and then dropped — keeping it on the site record would be a second source of truth.
 * An existing file with different contents is refused rather than overwritten: that edit is
 * unrecoverable and would silently change what the site already runs.
 */
export async function buildInstalledStep(
  site: Site,
  template: SiteCustomStep,
  steps: readonly SiteCustomStep[],
  enabled: boolean
): Promise<InstalledStep> {
  const installed: SiteCustomStep = {
    ...template,
    id: randomUUID(),
    order: nextLaneOrder(steps, template),
    enabled,
    origin: { kind: 'library', libraryId: template.id }
  }
  if (!installed.scriptPath || installed.scriptContents === undefined) {
    return { step: installed, script: null }
  }

  const path = installed.scriptPath
  const outcome = await writeScriptWithin(site.path, path, installed.scriptContents)
  if (outcome === 'unsafe') {
    throw new CustomStepLibraryError(`Library script path '${path}' is not safe.`)
  }
  if (outcome === 'conflict') {
    throw new CustomStepLibraryError(
      `'${path}' already exists in ${site.displayName || site.path} with different contents. Move or delete it first — installing will not overwrite a script you may be using.`
    )
  }
  delete installed.scriptContents
  return { step: installed, script: { path, outcome } }
}
