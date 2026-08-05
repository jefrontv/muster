#!/usr/bin/env node
// Delivers a `muster://` link to the DEV app instead of an installed build.
//
// Why this exists: macOS routes a clicked `muster://` link through LaunchServices, which picks one
// registered bundle — usually a packaged build, not the dev one. `open -a <bundle>` names the target
// explicitly and bypasses that choice, but the dev bundle lives under a per-build hash directory
// (out/electron-dev/<hash>/Muster.app), so the path cannot be hardcoded and a relative path makes
// `open -a` treat the argument as an application *name* and fail.
//
// The running process is the authority: a newest-by-mtime glob can point at a stale bundle that is
// not the instance currently serving the renderer, which silently opens a second app.

import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '..', '..')
const devRoot = join(repoRoot, 'out', 'electron-dev')

/** The bundle of the dev main process that is actually up, or '' when none is running. */
function runningDevBundle() {
  let out = ''
  try {
    out = execFileSync('ps', ['-Ao', 'command='], { encoding: 'utf-8' })
  } catch {
    return ''
  }
  for (const line of out.split('\n')) {
    const match = /(\/.*?\/out\/electron-dev\/[^/]+\/Muster\.app)\/Contents\/MacOS\//.exec(line)
    if (match) {
      return match[1]
    }
  }
  return ''
}

/** Newest built bundle, for when the app is not running yet and should be launched. */
function newestDevBundle() {
  if (!existsSync(devRoot)) {
    return ''
  }
  const candidates = []
  for (const entry of readdirSync(devRoot)) {
    const bundle = join(devRoot, entry, 'Muster.app')
    if (!existsSync(bundle)) {
      continue
    }
    candidates.push({ bundle, mtimeMs: statSync(bundle).mtimeMs })
  }
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs)
  return candidates[0]?.bundle ?? ''
}

const link = process.argv[2] ?? ''
if (!link.startsWith('muster://')) {
  console.error("Usage: node config/scripts/open-dev-bind-link.mjs 'muster://configure?...'")
  console.error(
    'Quote the URL — an unquoted & splits the command and ! triggers zsh history expansion.'
  )
  process.exit(2)
}

const bundle = runningDevBundle() || newestDevBundle()
if (!bundle) {
  console.error(`No dev bundle found under ${devRoot}. Run \`pnpm dev\` first.`)
  process.exit(1)
}

const launchedNote = runningDevBundle() ? 'running dev instance' : 'newest dev bundle (will launch)'
console.log(`→ ${bundle}  (${launchedNote})`)
const result = spawnSync('open', ['-a', bundle, link], { stdio: 'inherit' })
process.exit(result.status ?? 0)
