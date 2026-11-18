// Where the bundled Muster Bots core artifact lives: extraResources when packaged, the repo in dev.
import { app } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import pin from '../../../config/muster-bots.json'

export type BotsResources = {
  root: string
  entry: string
  uiDir: string
  skillsDir: string
}

export type BotsResourceResolution = BotsResources | { error: string } | null

function resourcesAt(root: string): BotsResources | null {
  const entry = path.join(root, 'server', 'desktop-entry.mjs')
  return existsSync(entry)
    ? { root, entry, uiDir: path.join(root, 'ui'), skillsDir: path.join(root, 'skills') }
    : null
}

function readManifestVersion(manifest: string): string {
  if (!existsSync(manifest)) {
    return 'missing'
  }
  try {
    const version: unknown = JSON.parse(readFileSync(manifest, 'utf8'))?.version
    return typeof version === 'string' && version.trim() ? version : 'unreadable version'
  } catch {
    return 'unreadable'
  }
}

export function resolveBotsResources(): BotsResourceResolution {
  if (app.isPackaged) {
    return resourcesAt(path.join(process.resourcesPath, 'muster-bots'))
  }
  const override = process.env.MUSTER_BOTS_DIR
  if (override) {
    const root = path.resolve(override)
    const resources = resourcesAt(root)
    if (!resources) {
      return { error: `MUSTER_BOTS_DIR override at ${root} is missing server/desktop-entry.mjs.` }
    }
    console.info(`[muster-bots] Using MUSTER_BOTS_DIR override: ${root}`)
    return resources
  }

  const appRoot = path.join(app.getAppPath(), 'resources', 'muster-bots')
  const cwdRoot = path.join(process.cwd(), 'resources', 'muster-bots')
  const root = existsSync(appRoot) || !existsSync(cwdRoot) ? appRoot : cwdRoot
  const manifest = path.join(root, 'manifest.json')
  const version = readManifestVersion(manifest)
  const resources = version === pin.version ? resourcesAt(root) : null
  if (resources) {
    return resources
  }
  const found = version === pin.version ? `${version}, but the server entry is missing` : version
  return {
    error: `Muster Bots dev bundle: expected ${pin.version}, found ${found} at ${manifest}. Run pnpm fetch:muster-bots and reopen this tab.`
  }
}
