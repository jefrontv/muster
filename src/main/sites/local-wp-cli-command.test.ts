import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { probeBinary } from '../extensions/binary-probe'
import {
  buildLocalWpCliSpawn,
  findDdevProjectRoot,
  toDdevContainerPath
} from './local-wp-cli-command'

vi.mock('../extensions/binary-probe', () => ({ probeBinary: vi.fn() }))

const probeBinaryMock = vi.mocked(probeBinary)
const DDEV_BINARY = '/opt/homebrew/bin/ddev'

let projectRoot: string

beforeEach(() => {
  projectRoot = mkdtempSync(path.join(tmpdir(), 'muster-ddev-project-'))
  mkdirSync(path.join(projectRoot, '.ddev'))
  writeFileSync(path.join(projectRoot, '.ddev', 'config.yaml'), 'name: acme\ntype: wordpress\n')
  mkdirSync(path.join(projectRoot, 'app', 'public'), { recursive: true })
  probeBinaryMock.mockReset()
  probeBinaryMock.mockReturnValue({
    found: true,
    path: DDEV_BINARY,
    realPath: DDEV_BINARY,
    version: null,
    versionSource: null
  })
})

afterEach(() => {
  rmSync(projectRoot, { recursive: true, force: true })
})

describe('findDdevProjectRoot', () => {
  it('finds the project at the folder itself', () => {
    expect(findDdevProjectRoot(projectRoot)).toBe(projectRoot)
  })

  it('walks up from a docroot below the project', () => {
    expect(findDdevProjectRoot(path.join(projectRoot, 'app', 'public'))).toBe(projectRoot)
  })

  it('returns null when no folder above holds .ddev/config.yaml', () => {
    const bare = mkdtempSync(path.join(tmpdir(), 'muster-no-ddev-'))
    try {
      expect(findDdevProjectRoot(bare)).toBeNull()
    } finally {
      rmSync(bare, { recursive: true, force: true })
    }
  })
})

describe('toDdevContainerPath', () => {
  it('maps a nested host path under /var/www/html with posix separators', () => {
    expect(toDdevContainerPath(projectRoot, path.join(projectRoot, 'app', 'public'))).toBe(
      '/var/www/html/app/public'
    )
  })

  it('maps the project root itself to /var/www/html', () => {
    expect(toDdevContainerPath(projectRoot, projectRoot)).toBe('/var/www/html')
  })

  it('refuses a path outside the project', () => {
    expect(() => toDdevContainerPath(projectRoot, path.dirname(projectRoot))).toThrow(
      /outside the DDEV project/
    )
  })
})

describe('buildLocalWpCliSpawn', () => {
  const env = { PATH: '/usr/bin' }

  it('runs `ddev wp` from the project root for a DDEV site', () => {
    const spawn = buildLocalWpCliSpawn({
      localStack: 'ddev',
      wpDir: path.join(projectRoot, 'app', 'public'),
      args: ['option', 'get', 'home'],
      env
    })
    expect(spawn).toEqual({
      command: DDEV_BINARY,
      args: ['wp', 'option', 'get', 'home'],
      cwd: projectRoot,
      env
    })
  })

  it.each(['localwp', 'agent-local', 'plain'] as const)('runs the host `wp` for %s', (stack) => {
    const spawn = buildLocalWpCliSpawn({
      localStack: stack,
      wpDir: projectRoot,
      args: ['plugin', 'list'],
      env
    })
    expect(spawn).toEqual({ command: 'wp', args: ['plugin', 'list'], cwd: projectRoot, env })
    expect(probeBinaryMock).not.toHaveBeenCalled()
  })

  it('says DDEV is missing rather than spawning nothing', () => {
    probeBinaryMock.mockReturnValue({
      found: false,
      path: null,
      realPath: null,
      version: null,
      versionSource: null
    })
    expect(() =>
      buildLocalWpCliSpawn({ localStack: 'ddev', wpDir: projectRoot, args: [], env })
    ).toThrow(/DDEV is not installed/)
  })

  it('says there is no project when the folder has no .ddev/config.yaml', () => {
    const bare = mkdtempSync(path.join(tmpdir(), 'muster-no-ddev-'))
    try {
      expect(() =>
        buildLocalWpCliSpawn({ localStack: 'ddev', wpDir: bare, args: [], env })
      ).toThrow(/No DDEV project/)
    } finally {
      rmSync(bare, { recursive: true, force: true })
    }
  })
})
