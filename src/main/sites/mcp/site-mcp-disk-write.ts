// Writes one site, or the step library, straight into the profile data file while no GUI runs.
//
// Why not this process's Store: it holds the whole state as it was at startup and saves all of it,
// so a GUI session opened and closed since then was reverted — other sites, repos, settings. Only
// the slice being changed is touched here; everything else stays as the last writer left it.

import { readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import type { Site, SiteCustomStep } from '../../../shared/site-types'

export type SiteDataFileIo = {
  read: (path: string) => string
  /** Temp file then rename, so a crash mid-write never leaves the store half written. */
  write: (path: string, contents: string) => void
}

const NODE_IO: SiteDataFileIo = {
  read: (path) => readFileSync(path, 'utf-8'),
  write: (path, contents) => {
    const tmp = `${path}.${process.pid}.${Date.now()}.mcp.tmp`
    try {
      writeFileSync(tmp, contents, 'utf-8')
      renameSync(tmp, path)
    } catch (error) {
      try {
        unlinkSync(tmp)
      } catch {
        // The write already failed; that is the error worth reporting.
      }
      throw error
    }
  }
}

function readState(dataFile: string, io: SiteDataFileIo): Record<string, unknown> {
  const parsed: unknown = JSON.parse(io.read(dataFile))
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${dataFile} is not a Muster data file.`)
  }
  return parsed as Record<string, unknown>
}

/** Null when the site is not in the file. `apply` sees the on-disk record, never a snapshot. */
export function writeSiteToDataFile(
  dataFile: string,
  siteId: string,
  apply: (site: Site) => Site,
  io: SiteDataFileIo = NODE_IO
): Site | null {
  const state = readState(dataFile, io)
  const sites = Array.isArray(state.sites) ? (state.sites as Site[]) : []
  const index = sites.findIndex((site) => site.id === siteId)
  if (index === -1) {
    return null
  }
  const next = { ...apply(sites[index]!), id: siteId }
  state.sites = sites.map((site, i) => (i === index ? next : site))
  io.write(dataFile, JSON.stringify(state))
  return next
}

export function writeStepLibraryToDataFile(
  dataFile: string,
  steps: readonly SiteCustomStep[],
  io: SiteDataFileIo = NODE_IO
): void {
  const state = readState(dataFile, io)
  state.siteStepLibrary = [...steps]
  io.write(dataFile, JSON.stringify(state))
}
