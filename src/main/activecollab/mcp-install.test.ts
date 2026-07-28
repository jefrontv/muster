import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isPlainJsonObject } from '../sites/mcp/site-mcp-jsonrpc'
import type { ActiveCollabCredentialRecord } from './credential-store'

const { getCredentialMock } = vi.hoisted(() => ({
  getCredentialMock: vi.fn<() => ActiveCollabCredentialRecord | null>(() => null)
}))

// Why: the real store reaches into Electron's safeStorage and the app's userData dir. Stubbing it
// keeps this suite hermetic while leaving the seeding logic itself under test.
vi.mock('./credential-store', () => ({ getActiveCollabCredential: getCredentialMock }))

import { createDefaultActiveCollabMcpEnv, type ActiveCollabMcpEnv } from './mcp-agents'
import { createNodeActiveCollabMcpFs } from './mcp-config-io'
import {
  ACTIVECOLLAB_MCP_INSTALL_COMMAND,
  activeCollabMcpCredentialsPath,
  detectActiveCollabMcp,
  getActiveCollabMcpStatus,
  installActiveCollabMcpForAgents,
  resyncActiveCollabMcpCredentials,
  seedActiveCollabMcpCredentials
} from './mcp-install'

const CREDENTIAL: ActiveCollabCredentialRecord = {
  instanceUrl: 'https://projects.efront.com.au',
  token: 'ac-token-secret',
  userId: 42,
  userName: 'Ada Lovelace',
  userEmail: 'ada@efront.com.au'
}

let home = ''
let binDir = ''
let env: ActiveCollabMcpEnv

function write(relativePath: string, contents: string): string {
  const target = join(home, relativePath)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, contents, 'utf8')
  return target
}

/** A file that passes an X_OK check, which is all detection asks of the shim. */
function writeExecutable(absolutePath: string): void {
  mkdirSync(dirname(absolutePath), { recursive: true })
  writeFileSync(absolutePath, '#!/bin/sh\n', 'utf8')
  chmodSync(absolutePath, 0o755)
}

function writePipxMetadata(version: string): void {
  write(
    '.local/pipx/venvs/activecollab-mcp/pipx_metadata.json',
    JSON.stringify({ main_package: { package: 'activecollab-mcp', package_version: version } })
  )
}

function readSeededCredentials(): Record<string, unknown> {
  const parsed: unknown = JSON.parse(readFileSync(activeCollabMcpCredentialsPath(env), 'utf8'))
  if (!isPlainJsonObject(parsed)) {
    throw new Error('seeded credentials are not a JSON object')
  }
  return parsed
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'muster-ac-mcp-install-'))
  binDir = join(home, 'opt', 'bin')
  env = {
    homeDir: home,
    pathEntries: [binDir],
    executableNames: ['activecollab-mcp'],
    fs: createNodeActiveCollabMcpFs()
  }
  getCredentialMock.mockReset()
  getCredentialMock.mockReturnValue(null)
})

afterEach(() => {
  rmSync(home, { recursive: true, force: true })
})

describe('detectActiveCollabMcp', () => {
  it('finds the binary on PATH', () => {
    writeExecutable(join(binDir, 'activecollab-mcp'))

    expect(detectActiveCollabMcp(env)).toMatchObject({
      found: true,
      path: join(binDir, 'activecollab-mcp'),
      source: 'path',
      installHint: ''
    })
  })

  it('falls back to the pipx bin directory when PATH does not carry it', () => {
    writeExecutable(join(home, '.local', 'bin', 'activecollab-mcp'))

    expect(detectActiveCollabMcp(env)).toMatchObject({
      found: true,
      path: join(home, '.local', 'bin', 'activecollab-mcp'),
      source: 'pipx'
    })
  })

  it('prefers PATH over the pipx fallback', () => {
    writeExecutable(join(binDir, 'activecollab-mcp'))
    writeExecutable(join(home, '.local', 'bin', 'activecollab-mcp'))

    expect(detectActiveCollabMcp(env).source).toBe('path')
  })

  it('reads the version from pipx metadata without spawning anything', () => {
    writeExecutable(join(binDir, 'activecollab-mcp'))
    writePipxMetadata('1.8.1')

    expect(detectActiveCollabMcp(env).version).toBe('1.8.1')
  })

  it('reports an unknown version rather than failing on unusable metadata', () => {
    writeExecutable(join(binDir, 'activecollab-mcp'))
    write('.local/pipx/venvs/activecollab-mcp/pipx_metadata.json', '{ truncated')

    expect(detectActiveCollabMcp(env).version).toBeNull()
  })

  it('ignores a non-executable file of the right name', () => {
    write('opt/bin/activecollab-mcp', 'not executable')
    chmodSync(join(binDir, 'activecollab-mcp'), 0o644)

    expect(detectActiveCollabMcp(env).found).toBe(false)
  })

  it('reports the exact command to run when absent', () => {
    expect(detectActiveCollabMcp(env)).toEqual({
      found: false,
      path: null,
      version: null,
      source: null,
      installHint: `activecollab-mcp is not installed. Run: ${ACTIVECOLLAB_MCP_INSTALL_COMMAND}`
    })
    expect(ACTIVECOLLAB_MCP_INSTALL_COMMAND).toContain('pipx install')
  })
})

describe('getActiveCollabMcpStatus', () => {
  it('reports the binary and every agent in one object', () => {
    writeExecutable(join(binDir, 'activecollab-mcp'))
    mkdirSync(join(home, '.codex'), { recursive: true })

    const status = getActiveCollabMcpStatus(env)

    expect(status.binary.found).toBe(true)
    expect(status.agents.map((entry) => entry.id)).toEqual(['claude-code', 'codex', 'cursor'])
    expect(status.agents.map((entry) => entry.present)).toEqual([false, true, false])
    expect(status.agents.every((entry) => !entry.configured)).toBe(true)
    expect(status.credentialsPath).toBe(join(home, '.activecollab-mcp', 'credentials.json'))
    expect(status.credentialsSeeded).toBe(false)
  })

  it('surfaces the labels and HTTP caveat the UI renders', () => {
    const cursor = getActiveCollabMcpStatus(env).agents.find((entry) => entry.id === 'cursor')

    expect(cursor).toMatchObject({ label: 'Cursor', requiresRunningServer: true })
  })

  it('reports credentials as seeded once the file exists', () => {
    write('.activecollab-mcp/credentials.json', '{}')

    expect(getActiveCollabMcpStatus(env).credentialsSeeded).toBe(true)
  })
})

describe('installActiveCollabMcpForAgents', () => {
  beforeEach(() => {
    writeExecutable(join(binDir, 'activecollab-mcp'))
  })

  it('writes every requested agent and reports the config paths', () => {
    const result = installActiveCollabMcpForAgents(['claude-code', 'codex', 'cursor'], env)

    expect(result.results).toEqual([
      { id: 'claude-code', configPath: join(home, '.claude.json'), ok: true },
      { id: 'codex', configPath: join(home, '.codex', 'config.toml'), ok: true },
      { id: 'cursor', configPath: join(home, '.cursor', 'mcp.json'), ok: true }
    ])
    expect(result.status.agents.every((entry) => entry.configured && entry.current)).toBe(true)
  })

  it('touches only the agents asked for', () => {
    installActiveCollabMcpForAgents(['codex'], env)

    expect(existsSync(join(home, '.claude.json'))).toBe(false)
    expect(existsSync(join(home, '.cursor', 'mcp.json'))).toBe(false)
    expect(existsSync(join(home, '.codex', 'config.toml'))).toBe(true)
  })

  it('keeps a partial failure visible instead of aborting the batch', () => {
    write('.claude.json', '{ broken')

    const result = installActiveCollabMcpForAgents(['claude-code', 'cursor'], env)

    expect(result.results[0]).toMatchObject({
      id: 'claude-code',
      ok: false,
      error: expect.stringContaining('not valid JSON')
    })
    expect(result.results[1]).toMatchObject({ id: 'cursor', ok: true })
    expect(existsSync(join(home, '.cursor', 'mcp.json'))).toBe(true)
  })
})

describe('installActiveCollabMcpForAgents without the binary', () => {
  it('fails the stdio agents and still wires the HTTP one', () => {
    const result = installActiveCollabMcpForAgents(['claude-code', 'codex', 'cursor'], env)

    expect(result.results.map((entry) => entry.ok)).toEqual([false, false, true])
    expect(result.results[0].error).toMatch(/was not found/)
    expect(result.results[1].error).toMatch(/was not found/)
    expect(result.status.binary.installHint).toContain(ACTIVECOLLAB_MCP_INSTALL_COMMAND)
  })
})

describe('seedActiveCollabMcpCredentials', () => {
  it('writes the keys the MCP server reads, at the API root it expects', () => {
    getCredentialMock.mockReturnValue(CREDENTIAL)

    const result = seedActiveCollabMcpCredentials(env)

    expect(result).toEqual({
      seeded: true,
      path: join(home, '.activecollab-mcp', 'credentials.json'),
      issuedFor: 'ada@efront.com.au'
    })
    const seeded = readSeededCredentials()
    expect(Object.keys(seeded).sort()).toEqual(['api_key', 'base_url', 'issued_at', 'issued_for'])
    expect(seeded.base_url).toBe('https://projects.efront.com.au/api/v1/')
    expect(seeded.api_key).toBe('ac-token-secret')
    expect(seeded.issued_for).toBe('ada@efront.com.au')
    expect(Number.isFinite(Date.parse(String(seeded.issued_at)))).toBe(true)
  })

  it('publishes the credential at mode 0600 under a 0700 directory', () => {
    getCredentialMock.mockReturnValue(CREDENTIAL)

    seedActiveCollabMcpCredentials(env)

    const target = activeCollabMcpCredentialsPath(env)
    expect(statSync(target).mode & 0o777).toBe(0o600)
    expect(statSync(dirname(target)).mode & 0o777).toBe(0o700)
  })

  it('clamps a pre-existing world-readable credential file', () => {
    const target = write('.activecollab-mcp/credentials.json', '{}')
    chmodSync(target, 0o644)
    getCredentialMock.mockReturnValue(CREDENTIAL)

    seedActiveCollabMcpCredentials(env)

    expect(statSync(target).mode & 0o777).toBe(0o600)
  })

  it('keeps an instance URL that already carries a path untouched', () => {
    getCredentialMock.mockReturnValue({ ...CREDENTIAL, instanceUrl: 'https://host/projects' })

    seedActiveCollabMcpCredentials(env)

    expect(readSeededCredentials().base_url).toBe('https://host/projects/')
  })

  it('is a clean no-op when Muster holds no ActiveCollab credential', () => {
    const result = seedActiveCollabMcpCredentials(env)

    expect(result).toMatchObject({ seeded: false })
    expect(result.seeded === false && result.reason).toMatch(/not connected/)
    expect(existsSync(join(home, '.activecollab-mcp'))).toBe(false)
  })

  it('lets a keychain refusal surface rather than reporting a silent no-op', () => {
    getCredentialMock.mockImplementation(() => {
      throw new Error('safeStorage refused the payload')
    })

    expect(() => seedActiveCollabMcpCredentials(env)).toThrow(/safeStorage refused/)
  })

  it('never resolves the real home directory in this suite', () => {
    expect(activeCollabMcpCredentialsPath(env).startsWith(`${home}/`)).toBe(true)
    expect(activeCollabMcpCredentialsPath(createDefaultActiveCollabMcpEnv())).toBe(
      join(homedir(), '.activecollab-mcp', 'credentials.json')
    )
  })
})

describe('resyncActiveCollabMcpCredentials', () => {
  it('rewrites an already-linked file so the agent follows the account Muster switched to', () => {
    write(
      '.activecollab-mcp/credentials.json',
      JSON.stringify({ base_url: 'https://old.example.com/api/v1/', api_key: 'stale-token' })
    )
    getCredentialMock.mockReturnValue(CREDENTIAL)

    const result = resyncActiveCollabMcpCredentials(env)

    expect(result).toMatchObject({ seeded: true, issuedFor: 'ada@efront.com.au' })
    const seeded = readSeededCredentials()
    expect(seeded.api_key).toBe('ac-token-secret')
    expect(seeded.base_url).toBe('https://projects.efront.com.au/api/v1/')
  })

  it('refuses to create a credential file the user never asked for', () => {
    // The security-relevant half: connecting ActiveCollab in Muster must not drop an API token on
    // disk for someone who never linked the MCP. Only the explicit card button may create it.
    getCredentialMock.mockReturnValue(CREDENTIAL)

    const result = resyncActiveCollabMcpCredentials(env)

    expect(result).toMatchObject({ seeded: false })
    expect(result.seeded === false && result.reason).toMatch(/no credential file yet/)
    expect(existsSync(join(home, '.activecollab-mcp', 'credentials.json'))).toBe(false)
  })

  it('leaves a linked file alone when Muster itself holds no credential', () => {
    const target = write('.activecollab-mcp/credentials.json', '{"api_key":"kept"}')

    const result = resyncActiveCollabMcpCredentials(env)

    expect(result).toMatchObject({ seeded: false })
    expect(readFileSync(target, 'utf8')).toContain('kept')
  })
})
