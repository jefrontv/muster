// The muster-sites MCP server runs this pipeline under ELECTRON_RUN_AS_NODE, where the bundled
// 'electron' stub exports nothing. Building the default dependencies used to reach for
// app.getPath('userData'), so an import died at "Snapshotting local database…" with
// "Cannot read properties of undefined (reading 'getPath')" — after the remote dump had already
// been downloaded and right before the local database was overwritten.

import { describe, expect, it, vi } from 'vitest'
import type { SiteRunConfig, SiteRunContext } from './pipeline-contract'

// The node-runtime shape: every binding undefined, as out/main/node_modules/electron leaves them.
// Named (rather than absent) so vitest's mock validation still resolves the imports the graph makes.
vi.mock('electron', () => ({ app: undefined, safeStorage: undefined, ipcMain: undefined }))

const snapshotSiteDatabase = vi.fn(async (_options: { baseDir: string }) => ({ ok: true }))
vi.mock('./site-db-snapshot', () => ({ snapshotSiteDatabase }))

const { createDefaultSiteImportDependencies } = await import('./pipeline-import')

describe('createDefaultSiteImportDependencies under plain node', () => {
  it('snapshots into a resolvable userData directory instead of throwing on app.getPath', async () => {
    const deps = createDefaultSiteImportDependencies()
    const context = { log: vi.fn(), signal: undefined } as unknown as SiteRunContext

    await expect(deps.snapshotLocalDatabase(context, {} as SiteRunConfig)).resolves.toMatchObject({
      ok: true
    })

    const baseDir = snapshotSiteDatabase.mock.calls[0]?.[0]?.baseDir
    expect(typeof baseDir).toBe('string')
    expect(baseDir).toContain('Muster')
  })
})
