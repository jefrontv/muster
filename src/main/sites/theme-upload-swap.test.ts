// Runs the real extract command in a temp folder, standing in for the server.
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildRemoteExtractCommand } from './theme-upload'

const paths = {
  localDistPath: '/unused',
  remoteDistParent: 'assets',
  distBasename: 'dist',
  localZipPath: '/unused.zip',
  remoteZipName: 'theme_dist.zip'
}

describe.skipIf(process.platform === 'win32')('theme dist swap on the server', () => {
  let server: string

  beforeEach(async () => {
    server = await mkdtemp(path.join(tmpdir(), 'theme-swap-'))
    await mkdir(path.join(server, 'assets', 'dist'), { recursive: true })
    await writeFile(path.join(server, 'assets', 'dist', 'app.css'), 'old')
  })

  afterEach(async () => {
    await rm(server, { recursive: true, force: true })
  })

  const run = () =>
    spawnSync('/bin/sh', ['-c', buildRemoteExtractCommand(paths)], {
      cwd: server,
      encoding: 'utf-8'
    })

  it('swaps the new dist in and cleans up', async () => {
    const build = path.join(server, 'build')
    await mkdir(build)
    await writeFile(path.join(build, 'app.css'), 'new')
    execFileSync('zip', ['-q', '-r', path.join(server, 'assets', 'theme_dist.zip'), '.'], {
      cwd: build
    })

    expect(run().status).toBe(0)
    expect(await readFile(path.join(server, 'assets', 'dist', 'app.css'), 'utf-8')).toBe('new')
    expect((await readdir(path.join(server, 'assets'))).sort()).toEqual(['dist'])
  })

  it('leaves the old dist serving when the archive is corrupt', async () => {
    await writeFile(path.join(server, 'assets', 'theme_dist.zip'), 'not a zip')

    expect(run().status).not.toBe(0)
    expect(await readFile(path.join(server, 'assets', 'dist', 'app.css'), 'utf-8')).toBe('old')
  })
})
