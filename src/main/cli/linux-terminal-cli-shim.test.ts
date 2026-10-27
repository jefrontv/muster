import { chmodSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { isPackaged: true }
}))

import { ensureLinuxTerminalCliShimDir } from './linux-terminal-cli-shim'

const created: string[] = []

async function makeFixture(): Promise<{ userDataPath: string; resourcesPath: string }> {
  const root = await mkdtemp(join(tmpdir(), 'muster-terminal-cli-shim-'))
  created.push(root)
  const resourcesPath = join(root, 'resources')
  // The bundled muster launcher must exist for the shim to be written.
  mkdirSync(join(resourcesPath, 'bin'), { recursive: true })
  writeFileSync(join(resourcesPath, 'bin', 'muster'), '#!/usr/bin/env bash\n', 'utf8')
  return { userDataPath: join(root, 'user-data'), resourcesPath }
}

afterEach(async () => {
  await Promise.all(created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('ensureLinuxTerminalCliShimDir', () => {
  it('writes an executable muster shim that execs the bundled launcher', async () => {
    const { userDataPath, resourcesPath } = await makeFixture()

    const shimDir = ensureLinuxTerminalCliShimDir({
      userDataPath,
      resourcesPath,
      appImagePath: null
    })

    expect(shimDir).toBe(join(userDataPath, 'linux-cli-shim'))
    const content = readFileSync(join(shimDir!, 'muster'), 'utf8')
    // Single-quoted so a resources path with shell metacharacters can't break out.
    expect(content).toContain(`exec '${join(resourcesPath, 'bin', 'muster')}' "$@"`)
    const mode = statSync(join(shimDir!, 'muster')).mode & 0o777
    expect(mode & 0o111).not.toBe(0)
  })

  it('memoizes per userDataPath and re-asserts the exec bit for a stale shim', async () => {
    const { userDataPath, resourcesPath } = await makeFixture()
    const options = { userDataPath, resourcesPath, appImagePath: null }

    const first = ensureLinuxTerminalCliShimDir(options)
    expect(first).not.toBeNull()
    const shimPath = join(first!, 'muster')
    chmodSync(shimPath, 0o644)

    // A distinct userData path is not memoized, so ensure runs again and heals
    // the exec bit lost above only when it actually processes that path.
    const second = ensureLinuxTerminalCliShimDir(options)
    expect(second).toBe(first)

    const root = await mkdtemp(join(tmpdir(), 'muster-terminal-cli-shim-2-'))
    created.push(root)
    const otherUserData = join(root, 'user-data')
    mkdirSync(join(otherUserData, 'linux-cli-shim'), { recursive: true })
    writeFileSync(join(otherUserData, 'linux-cli-shim', 'muster'), 'stale contents', 'utf8')
    chmodSync(join(otherUserData, 'linux-cli-shim', 'muster'), 0o644)

    const healed = ensureLinuxTerminalCliShimDir({
      userDataPath: otherUserData,
      resourcesPath,
      appImagePath: null
    })
    expect(healed).not.toBeNull()
    const healedPath = join(healed!, 'muster')
    expect(readFileSync(healedPath, 'utf8')).toContain(join('bin', 'muster'))
    expect(statSync(healedPath).mode & 0o111).not.toBe(0)
  })

  it('execs the stable AppImage (not the ephemeral mount) when running from an AppImage', async () => {
    const { userDataPath, resourcesPath } = await makeFixture()
    const appImagePath = join(userDataPath, 'Applications', 'Muster.AppImage')

    const shimDir = ensureLinuxTerminalCliShimDir({
      userDataPath,
      resourcesPath,
      appImagePath
    })

    const content = readFileSync(join(shimDir!, 'muster'), 'utf8')
    expect(content).toContain(appImagePath)
    expect(content).not.toContain(resourcesPath)
  })

  it('returns null (and does not memoize) when the bundled launcher is missing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'muster-terminal-cli-shim-missing-'))
    created.push(root)
    const userDataPath = join(root, 'user-data')

    const missing = ensureLinuxTerminalCliShimDir({
      userDataPath,
      resourcesPath: join(root, 'resources'),
      appImagePath: null
    })
    expect(missing).toBeNull()

    // Once the launcher exists (e.g. later probe with real resources), the same
    // userData path succeeds — proving failures are not cached.
    const resourcesPath = join(root, 'resources')
    mkdirSync(join(resourcesPath, 'bin'), { recursive: true })
    writeFileSync(join(resourcesPath, 'bin', 'muster'), '#!/usr/bin/env bash\n', 'utf8')
    const recovered = ensureLinuxTerminalCliShimDir({
      userDataPath,
      resourcesPath,
      appImagePath: null
    })
    expect(recovered).toBe(join(userDataPath, 'linux-cli-shim'))
  })
})
