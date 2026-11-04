// Before an import copies files: apply the site's skip rules, check for unusually large items, and
// let the user leave them on the server. Never blocks an import on a failed check.

import { formatImportSize, type SiteImportLargeEntry } from '../../shared/site-import-file-rules'
import type {
  RemoteLayout,
  SiteRunConfig,
  SiteRunContext,
  SiteSshSession
} from './pipeline-contract'
import type { scanLargeImportEntries } from './remote-large-file-scan'

function describe(entry: SiteImportLargeEntry): string {
  return `${entry.path}${entry.kind === 'folder' ? '/' : ''} (${formatImportSize(entry.bytes)})`
}

/** Webroot-relative paths to leave out of this import: the site's rules plus what the user picks. */
export async function reviewLargeImportEntries(
  context: SiteRunContext,
  config: SiteRunConfig,
  session: SiteSshSession,
  layout: RemoteLayout,
  scan: typeof scanLargeImportEntries
): Promise<string[]> {
  const rules = config.site.importFileRules ?? []
  const ruleSkips = rules.filter((rule) => rule.action === 'skip').map((rule) => rule.path)
  if (ruleSkips.length > 0) {
    context.log(`Leaving out, per this site's import exclusions: ${ruleSkips.join(', ')}`)
  }

  context.status('Checking for large files…')
  let entries: SiteImportLargeEntry[]
  try {
    entries = await scan(session, layout, rules)
  } catch (error) {
    context.log(
      `Skipped the large-file check (${error instanceof Error ? error.message : String(error)}). Copying everything.`
    )
    return ruleSkips
  }
  context.throwIfCancelled()
  if (entries.length === 0) {
    return ruleSkips
  }

  if (!context.askAboutLargeFiles) {
    // Nobody to ask (an agent's run): copy them, but say how to stop that next time.
    for (const entry of entries) {
      context.log(
        `Large ${entry.kind}: ${describe(entry)}. Copying it; add it to the site's import exclusions in Muster to leave it on the server.`
      )
    }
    return ruleSkips
  }

  context.status('Waiting for you to choose large files to skip…')
  const chosen = await context.askAboutLargeFiles(entries)
  context.throwIfCancelled()
  const skipped = entries.filter((entry) => chosen.includes(entry.path))
  context.log(
    skipped.length > 0
      ? `Leaving on the server: ${skipped.map(describe).join(', ')}`
      : 'Copying every large item found.'
  )
  return [...ruleSkips, ...chosen]
}
