// Applies an ocsites import report to Muster's own stores.
//
// Idempotent by design: sites are matched on their local path, so re-importing updates the
// existing record instead of duplicating it. Environments and toggles are taken from ocsites
// wholesale (it is the source of truth during migration), but a site's Muster-only fields —
// its id and its repo link — are preserved.

import { existsSync } from 'node:fs'
import type { OcsitesImportApplyResult } from '../../shared/site-types'
import type { Store } from '../persistence'
import type { OcsitesImportReport } from './ocsites-config-import'
import { setSiteSecret, SiteSecretUnavailableError } from './site-secret-store'

export type { OcsitesImportApplyResult }

export function applyOcsitesImport(
  store: Store,
  report: OcsitesImportReport
): OcsitesImportApplyResult {
  const result: OcsitesImportApplyResult = {
    created: 0,
    updated: 0,
    missingPaths: [],
    secretsStored: 0,
    secretsFailed: [],
    secretStorageUnavailable: false
  }

  for (const imported of report.sites) {
    const existing = store.findSiteByPath(imported.site.path)
    const site = existing
      ? { ...imported.site, id: existing.id, repoId: existing.repoId }
      : imported.site
    store.upsertSite(site)
    if (existing) {
      result.updated += 1
    } else {
      result.created += 1
    }
    if (!existsSync(site.path)) {
      result.missingPaths.push(site.path)
    }

    for (const secret of imported.secrets) {
      try {
        setSiteSecret(site.id, secret.environment, secret.kind, secret.value)
        result.secretsStored += 1
      } catch (error) {
        if (error instanceof SiteSecretUnavailableError) {
          result.secretStorageUnavailable = true
        }
        result.secretsFailed.push({
          path: site.path,
          environment: secret.environment,
          kind: secret.kind,
          reason: error instanceof Error ? error.message : String(error)
        })
      }
    }
  }

  // Decrypt failures from the read side are surfaced alongside write failures so the UI has one list.
  result.secretsFailed.push(...report.secretFailures)
  return result
}
