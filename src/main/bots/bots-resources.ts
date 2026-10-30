// Where the bundled Muster Bots core artifact lives: extraResources when packaged, the repo in dev.
import { app } from 'electron'
import { existsSync } from 'node:fs'
import path from 'node:path'

export type BotsResources = {
  root: string
  entry: string
  uiDir: string
  skillsDir: string
}

export function resolveBotsResources(): BotsResources | null {
  const candidates = app.isPackaged
    ? [path.join(process.resourcesPath, 'muster-bots')]
    : [
        process.env.MUSTER_BOTS_DIR,
        path.join(app.getAppPath(), 'resources', 'muster-bots'),
        path.join(process.cwd(), 'resources', 'muster-bots')
      ]
  for (const root of candidates) {
    if (!root) {
      continue
    }
    const entry = path.join(root, 'server', 'desktop-entry.mjs')
    if (existsSync(entry)) {
      return {
        root,
        entry,
        uiDir: path.join(root, 'ui'),
        skillsDir: path.join(root, 'skills')
      }
    }
  }
  return null
}
