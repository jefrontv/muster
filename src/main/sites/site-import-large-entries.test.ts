import { describe, expect, it, vi } from 'vitest'
import type { SiteImportLargeEntry } from '../../shared/site-import-file-rules'
import type { SiteRunConfig, SiteRunContext, SiteSshSession } from './pipeline-contract'
import { reviewLargeImportEntries } from './site-import-large-entries'

const LAYOUT = { webroot: '/srv/site', contentDir: 'wp-content' }
const BACKUP: SiteImportLargeEntry = {
  path: 'wp-content/ai1wm-backups',
  kind: 'folder',
  bytes: 3 * 1024 ** 3
}

function context(ask?: SiteRunContext['askAboutLargeFiles']): SiteRunContext & { lines: string[] } {
  const lines: string[] = []
  return {
    lines,
    signal: new AbortController().signal,
    log: (line) => lines.push(line),
    status: (line) => lines.push(line),
    progress: () => {},
    throwIfCancelled: () => {},
    ...(ask ? { askAboutLargeFiles: ask } : {})
  }
}

const config = (rules: SiteRunConfig['site']['importFileRules'] = []): SiteRunConfig =>
  ({ site: { importFileRules: rules } }) as unknown as SiteRunConfig
const session = {} as SiteSshSession

describe('reviewLargeImportEntries', () => {
  it('skips what the site rules say and what the user picks', async () => {
    const ask = vi.fn(async () => [BACKUP.path])
    const skips = await reviewLargeImportEntries(
      context(ask),
      config([{ path: 'backups', action: 'skip' }]),
      session,
      LAYOUT,
      async () => [BACKUP]
    )
    expect(ask).toHaveBeenCalledWith([BACKUP])
    expect(skips).toEqual(['backups', BACKUP.path])
  })

  it('copies everything and says how to stop it when nobody can be asked', async () => {
    const run = context()
    const skips = await reviewLargeImportEntries(run, config(), session, LAYOUT, async () => [
      BACKUP
    ])
    expect(skips).toEqual([])
    expect(run.lines.join('\n')).toContain('wp-content/ai1wm-backups/ (3.0 GB)')
  })

  it('never blocks the import on a failed check', async () => {
    const run = context(vi.fn(async () => []))
    const skips = await reviewLargeImportEntries(
      run,
      config([{ path: 'backups', action: 'skip' }]),
      session,
      LAYOUT,
      async () => {
        throw new Error('timed out')
      }
    )
    expect(skips).toEqual(['backups'])
    expect(run.lines.join('\n')).toContain('Skipped the large-file check (timed out)')
  })

  it('does not ask when nothing is large', async () => {
    const ask = vi.fn(async () => [])
    await reviewLargeImportEntries(context(ask), config(), session, LAYOUT, async () => [])
    expect(ask).not.toHaveBeenCalled()
  })
})
