import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { StreamCommandResult } from '../lib/stream-command'
import { ensureDockerRunning } from './ddev-docker'
import {
  createDdevHost,
  ddevPlainError,
  DOCKER_NOT_RUNNING,
  runDdevJson,
  type DdevHost
} from './ddev-host'
import {
  locateDdevProjectRoot,
  readDdevGlobalConfig,
  readDdevProjectConfig
} from './ddev-project-files'
import { parseDdevDescribe, parseDockerPort, urlAuthority } from './ddev-project-state'

function result(overrides: Partial<StreamCommandResult> = {}): StreamCommandResult {
  return {
    code: 0,
    stdout: '',
    stderr: '',
    timedOut: false,
    truncated: false,
    stoppedEarly: false,
    ...overrides
  }
}

function fakeHost(
  files: Record<string, string>,
  run: DdevHost['run'] = async () => result(),
  binaries: Partial<Record<string, string>> = {
    ddev: '/opt/homebrew/bin/ddev',
    docker: '/opt/homebrew/bin/docker'
  }
): DdevHost {
  return createDdevHost({
    platform: 'darwin',
    homeDir: '/Users/me',
    findBinary: (tool) => binaries[tool] ?? null,
    run,
    readText: async (filePath) => files[filePath] ?? null,
    pathExists: async (filePath) => filePath in files,
    sleep: async () => {},
    canConnect: async () => true
  })
}

describe('ddevPlainError', () => {
  it('turns the Docker provider failure into the start-Docker message', () => {
    expect(
      ddevPlainError(
        '\u001b[31mCould not connect to a Docker provider. Please start or install a Docker provider.\u001b[0m'
      )
    ).toBe(DOCKER_NOT_RUNNING)
  })

  it('names LocalWP as a likely holder of a busy port', () => {
    expect(
      ddevPlainError('Error: listen tcp 127.0.0.1:443: bind: address already in use')
    ).toContain('often LocalWP')
  })
})

describe('runDdevJson', () => {
  it('returns the raw payload of the last JSON line', async () => {
    const host = fakeHost({}, async () =>
      result({
        stdout:
          '{"level":"info","msg":"starting"}\n{"level":"info","msg":"ok","raw":{"name":"alchemy"}}\n'
      })
    )
    await expect(runDdevJson(host, ['describe'])).resolves.toEqual({ name: 'alchemy' })
  })

  it('throws the plain message for a fatal line', async () => {
    const host = fakeHost({}, async () =>
      result({
        code: 1,
        stdout: '{"level":"fatal","msg":"Could not connect to a Docker provider"}'
      })
    )
    await expect(runDdevJson(host, ['describe'])).rejects.toThrow(DOCKER_NOT_RUNNING)
  })

  it('reads plain-text output when there is no JSON at all', async () => {
    const host = fakeHost({}, async () =>
      result({ code: 1, stderr: '\u001b[31mCould not connect to a Docker provider.\u001b[0m' })
    )
    await expect(runDdevJson(host, ['describe'])).rejects.toThrow(DOCKER_NOT_RUNNING)
  })

  it('says DDEV is missing without spawning anything', async () => {
    let spawned = false
    const host = fakeHost(
      {},
      async () => {
        spawned = true
        return result()
      },
      {}
    )
    await expect(runDdevJson(host, ['describe'])).rejects.toThrow('DDEV is not installed')
    expect(spawned).toBe(false)
  })
})

describe('project files', () => {
  const root = '/Users/me/Sites/alchemy'
  const config = path.join(root, '.ddev', 'config.yaml')

  it('finds the project root above an app/public docroot', async () => {
    const host = fakeHost({ [config]: 'name: alchemy\n' })
    await expect(locateDdevProjectRoot(host, path.join(root, 'app', 'public'))).resolves.toBe(root)
  })

  it('stops at the home folder', async () => {
    const host = fakeHost({ '/Users/.ddev/config.yaml': 'name: nope\n' })
    await expect(locateDdevProjectRoot(host, '/Users/me/Sites/plain')).resolves.toBeNull()
  })

  it('merges config.local.yaml over config.yaml', async () => {
    const host = {
      ...fakeHost({
        [config]: 'name: alchemy\ntype: wordpress\ndocroot: ""\nphp_version: "8.3"\n',
        [path.join(root, '.ddev', 'config.local.yaml')]: 'name: alchemy-feature\n'
      }),
      listDdevDirectory: async () => ['config.yaml', 'config.local.yaml', 'commands']
    }
    await expect(readDdevProjectConfig(host, root)).resolves.toEqual({
      root,
      name: 'alchemy-feature',
      type: 'wordpress',
      docroot: '',
      phpVersion: '8.3',
      hostDbPort: null
    })
  })

  it('names an unnamed project after its folder', async () => {
    const host = {
      ...fakeHost({ [config]: 'type: wordpress\n' }),
      listDdevDirectory: async () => []
    }
    await expect(readDdevProjectConfig(host, root)).resolves.toMatchObject({ name: 'alchemy' })
  })

  it('reads the TLD and router port, defaulting both', async () => {
    const custom = fakeHost({
      '/Users/me/.ddev/global_config.yaml': 'project_tld: ddev.site\nrouter_https_port: "8843"\n'
    })
    await expect(readDdevGlobalConfig(custom)).resolves.toEqual({
      projectTld: 'ddev.site',
      routerHttpsPort: '8843'
    })
    await expect(readDdevGlobalConfig(fakeHost({}))).resolves.toEqual({
      projectTld: 'ddev.site',
      routerHttpsPort: '443'
    })
  })
})

describe('parseDdevDescribe', () => {
  it('reads a running project with its database', () => {
    expect(
      parseDdevDescribe({
        name: 'test',
        status: 'running',
        approot: '/Users/me/Sites/test',
        docroot: '',
        php_version: '8.3',
        primary_url: 'https://test.ddev.site:8843',
        performance_mode: 'mutagen',
        dbinfo: { published_port: 32772, username: 'db', password: 'db', dbname: 'db' }
      })
    ).toEqual({
      name: 'test',
      status: 'running',
      approot: '/Users/me/Sites/test',
      docroot: '',
      phpVersion: '8.3',
      primaryUrl: 'https://test.ddev.site:8843',
      db: { port: 32772, user: 'db', password: 'db', name: 'db' },
      mutagen: true
    })
  })

  it('reports no database for a stopped project', () => {
    expect(parseDdevDescribe({ name: 'test', status: 'stopped' }).db).toBeNull()
  })
})

describe('small parsers', () => {
  it('keeps the router port in the authority', () => {
    expect(urlAuthority('https://test.ddev.site:8843')).toBe('test.ddev.site:8843')
    expect(urlAuthority('https://test.ddev.site')).toBe('test.ddev.site')
    expect(urlAuthority('not a url')).toBe('')
  })

  it('reads the published port from docker port', () => {
    expect(parseDockerPort('0.0.0.0:32772\n[::]:32772\n')).toBe(32772)
    expect(parseDockerPort('')).toBeNull()
  })
})

describe('ensureDockerRunning', () => {
  it('starts Colima when Docker is down and Colima is installed', async () => {
    const calls: string[] = []
    let up = false
    const host = fakeHost(
      {},
      async (command, args) => {
        calls.push(`${path.basename(command)} ${args.join(' ')}`)
        if (command.endsWith('colima')) {
          up = true
          return result()
        }
        return up ? result({ stdout: '29.5.2' }) : result({ code: 1 })
      },
      { docker: '/opt/homebrew/bin/docker', colima: '/opt/homebrew/bin/colima' }
    )
    const statuses: string[] = []
    await expect(ensureDockerRunning(host, (message) => statuses.push(message))).resolves.toBeNull()
    expect(calls).toContain('colima start')
    expect(statuses[0]).toContain('Starting Colima')
  })

  it('returns the generic message when it cannot start anything', async () => {
    const host = fakeHost({}, async () => result({ code: 1 }), { docker: '/usr/local/bin/docker' })
    await expect(ensureDockerRunning(host)).resolves.toBe(DOCKER_NOT_RUNNING)
  })
})
