// Mutagen sync for DDEV projects that use it (performance_mode: mutagen).

import { createDdevHost, ddevOutputSummary, type DdevHost } from './ddev-host'
import { describeDdevProject } from './ddev-project-state'
import { findDdevProject } from './ddev-site-control'

type DdevOptions = { host?: DdevHost }

/** Mutagen copies host writes into the container asynchronously; WP-CLI must see them first. */
export async function syncDdevFiles(
  sitePath: string,
  options: DdevOptions = {}
): Promise<{ synced: boolean; message: string }> {
  const host = options.host ?? createDdevHost()
  const config = await findDdevProject(sitePath, { host })
  const ddev = host.findBinary('ddev')
  if (!config || !ddev) {
    return { synced: false, message: '' }
  }
  const state = await describeDdevProject(host, config.root).catch(() => null)
  if (!state?.mutagen || state.status !== 'running') {
    return { synced: false, message: '' }
  }
  const result = await host.run(ddev, ['mutagen', 'sync'], {
    cwd: config.root,
    timeoutMs: 5 * 60_000
  })
  return result.code === 0
    ? { synced: true, message: 'Synced files into the DDEV container.' }
    : {
        synced: false,
        message: `Mutagen sync did not finish: ${ddevOutputSummary(result.stderr)}`
      }
}
