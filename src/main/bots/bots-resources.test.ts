import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import pin from '../../../config/muster-bots.json'
import { resolveBotsResources } from './bots-resources'

const app = vi.hoisted(() => ({ isPackaged: false, getAppPath: vi.fn<() => string>() }))
vi.mock('electron', () => ({ app }))

let fixture: string
let root: string
let manifest: string
let entry: string

beforeEach(() => {
  fixture = mkdtempSync(path.join(tmpdir(), 'muster-bots-resources-'))
  root = path.join(fixture, 'resources', 'muster-bots')
  manifest = path.join(root, 'manifest.json')
  entry = path.join(root, 'server', 'desktop-entry.mjs')
  app.getAppPath.mockReturnValue(fixture)
  vi.spyOn(process, 'cwd').mockReturnValue(fixture)
  vi.stubEnv('MUSTER_BOTS_DIR', undefined)
  mkdirSync(path.dirname(entry), { recursive: true })
  writeFileSync(entry, '')
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  rmSync(fixture, { recursive: true, force: true })
})

it('accepts the dev bundle pinned by the checkout', () => {
  writeFileSync(manifest, JSON.stringify({ version: pin.version }))
  expect(resolveBotsResources()).toMatchObject({ root, entry })
})

it.each([
  ['{"version":"old"}', 'old'],
  ['{', 'unreadable'],
  ['{}', 'unreadable version'],
  [null, 'missing']
])('explains why the default dev bundle with manifest %s cannot start', (content, found) => {
  if (content !== null) {
    writeFileSync(manifest, content)
  }
  expect(resolveBotsResources()).toEqual({
    error: expect.stringContaining(
      `expected ${pin.version}, found ${found} at ${manifest}. Run pnpm fetch:muster-bots`
    )
  })
})

it('allows an explicit override independently of the checkout pin', () => {
  vi.stubEnv('MUSTER_BOTS_DIR', root)
  expect(resolveBotsResources()).toMatchObject({ root, entry })
})
