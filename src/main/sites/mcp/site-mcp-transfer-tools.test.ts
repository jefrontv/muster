import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEmptySiteEnvironment, type Site } from '../../../shared/site-types'
import type { SiteMcpContext } from './site-mcp-context'
import { SITE_MCP_TRANSFER_TOOLS } from './site-mcp-transfer-tools'

const uploadTool = SITE_MCP_TRANSFER_TOOLS.find((tool) => tool.name === 'upload_files')!
const downloadTool = SITE_MCP_TRANSFER_TOOLS.find((tool) => tool.name === 'download_files')!

let dir: string
/** Every command the tool ran, so the mkdir/chmod/checksum contract is observable. */
let commands: string[]
/** Remote path -> contents, as the fake host sees them. */
let remote: Map<string, string>

function sha256(value: string): string {
  return createHash('sha256').update(Buffer.from(value)).digest('hex')
}

function session(): Record<string, unknown> {
  return {
    exec: vi.fn(async (command: string) => {
      commands.push(command)
      const hashMatch = command.match(/^sha256sum '([^']+)'/)
      if (hashMatch) {
        const contents = remote.get(hashMatch[1]!)
        return contents === undefined
          ? { code: 1, stdout: '', stderr: 'no such file' }
          : { code: 0, stdout: `${sha256(contents)}  ${hashMatch[1]}\n`, stderr: '' }
      }
      const testMatch = command.match(/^test -e '([^']+)'/)
      if (testMatch) {
        return { code: remote.has(testMatch[1]!) ? 0 : 1, stdout: '', stderr: '' }
      }
      return { code: 0, stdout: '', stderr: '' }
    }),
    upload: vi.fn(async (localPath: string, remotePath: string) => {
      remote.set(remotePath, readFileSync(localPath, 'utf8'))
    }),
    download: vi.fn(async (remotePath: string, localPath: string) => {
      writeFileSync(localPath, remote.get(remotePath) ?? '')
    }),
    close: vi.fn(async () => undefined)
  }
}

/** A site whose branch matches its only environment, so the run guard lets the transfer through. */
function context(overrides: Record<string, unknown> = {}): SiteMcpContext {
  const site: Site = {
    id: 'site-1',
    path: dir,
    repoId: null,
    displayName: 'acme',
    localWpRoot: '',
    localDomain: 'acme.local',
    localStack: 'plain',
    dbUser: 'root',
    dbSocket: '',
    dbPort: null,
    phpVersion: '8.2',
    activeEnvironment: 'main',
    environments: {
      main: {
        ...createEmptySiteEnvironment(),
        hostname: 'acme.example.com',
        username: 'deploy',
        rootPath: '/srv'
      }
    },
    notes: '',
    searchReplaceTimeoutSeconds: 600
  }
  return {
    cwd: dir,
    store: {
      listSites: () => [site],
      getSite: (id: string) => (id === site.id ? site : null),
      findSiteByPath: (path: string) => (path === dir ? site : null)
    },
    summarize: async () => ({ site, branch: 'main', pathExists: true }),
    hasSshSecret: () => true,
    openSshSession: async () => session(),
    ...overrides
  } as unknown as SiteMcpContext
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'transfer-tool-'))
  commands = []
  remote = new Map()
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('upload_files', () => {
  it('uploads and verifies by checksum', async () => {
    const local = join(dir, 'plugin.php')
    writeFileSync(local, '<?php // hello')

    const result = (await uploadTool.run(context(), {
      files: [{ local, remote: '/srv/plugin.php' }]
    })) as { ok: boolean; files: { verified: boolean; sha256: string; bytes: number }[] }

    expect(result.ok).toBe(true)
    expect(result.files[0]).toMatchObject({ verified: true, sha256: sha256('<?php // hello') })
    expect(remote.get('/srv/plugin.php')).toBe('<?php // hello')
  })

  it('creates parent directories by default, and not when told otherwise', async () => {
    const local = join(dir, 'a.txt')
    writeFileSync(local, 'a')

    await uploadTool.run(context(), { files: [{ local, remote: '/srv/deep/a.txt' }] })
    expect(commands.some((command) => command.startsWith('mkdir -p'))).toBe(true)

    commands = []
    await uploadTool.run(context(), {
      files: [{ local, remote: '/srv/deep/b.txt' }],
      mkdir: false
    })
    expect(commands.some((command) => command.startsWith('mkdir -p'))).toBe(false)
  })

  it('refuses to clobber an existing remote file unless told to', async () => {
    const local = join(dir, 'a.txt')
    writeFileSync(local, 'new')
    remote.set('/srv/a.txt', 'existing')

    const blocked = (await uploadTool.run(context(), {
      files: [{ local, remote: '/srv/a.txt' }]
    })) as { ok: boolean; files: { error?: string }[] }
    expect(blocked.ok).toBe(false)
    expect(blocked.files[0]?.error).toContain('overwrite=true')
    // Why assert the bytes: refusing but writing anyway is the failure that matters.
    expect(remote.get('/srv/a.txt')).toBe('existing')

    const allowed = (await uploadTool.run(context(), {
      files: [{ local, remote: '/srv/a.txt' }],
      overwrite: true
    })) as { ok: boolean }
    expect(allowed.ok).toBe(true)
    expect(remote.get('/srv/a.txt')).toBe('new')
  })

  it('applies a mode only when one is given', async () => {
    const local = join(dir, 'a.txt')
    writeFileSync(local, 'a')

    await uploadTool.run(context(), { files: [{ local, remote: '/srv/a.txt' }], mode: '0644' })
    expect(commands.some((command) => command.startsWith("chmod '0644'"))).toBe(true)

    commands = []
    await uploadTool.run(context(), {
      files: [{ local, remote: '/srv/b.txt' }],
      overwrite: true
    })
    expect(commands.some((command) => command.startsWith('chmod'))).toBe(false)
  })

  it('reports a checksum mismatch rather than claiming success', async () => {
    const local = join(dir, 'a.txt')
    writeFileSync(local, 'intended')
    // A host that silently writes something else is exactly what verification is for.
    const corrupting = context({
      openSshSession: async () => ({
        ...session(),
        upload: vi.fn(async (_local: string, remotePath: string) => {
          remote.set(remotePath, 'truncated')
        })
      })
    })

    const result = (await uploadTool.run(corrupting, {
      files: [{ local, remote: '/srv/a.txt' }]
    })) as { ok: boolean; files: { verified: boolean; error?: string }[] }

    expect(result.ok).toBe(false)
    expect(result.files[0]?.verified).toBe(false)
    expect(result.files[0]?.error).toContain('Checksum mismatch')
  })

  it('says unverified rather than failing when the host has no digest tool', async () => {
    const local = join(dir, 'a.txt')
    writeFileSync(local, 'a')
    const noHash = context({
      openSshSession: async () => ({
        ...session(),
        exec: vi.fn(async (command: string) => {
          commands.push(command)
          if (command.startsWith('sha256sum')) {
            return { code: 127, stdout: '', stderr: '' }
          }
          if (command.startsWith('test -e')) {
            return { code: 1, stdout: '', stderr: '' }
          }
          return { code: 0, stdout: '', stderr: '' }
        })
      })
    })
    const result = (await uploadTool.run(noHash, {
      files: [{ local, remote: '/srv/a.txt' }]
    })) as { ok: boolean; files: { verified: boolean | null }[] }

    // Transferred, but nobody checked — better than failing a good upload on a minimal image.
    expect(result.ok).toBe(true)
    expect(result.files[0]?.verified).toBeNull()
  })

  it('rejects a relative path on either side', async () => {
    await expect(
      uploadTool.run(context(), { files: [{ local: 'a.txt', remote: '/srv/a.txt' }] })
    ).rejects.toThrow(/absolute/)
    await expect(
      uploadTool.run(context(), { files: [{ local: join(dir, 'a.txt'), remote: 'srv/a.txt' }] })
    ).rejects.toThrow(/absolute/)
  })

  it('refuses when the branch matches no environment, because the fallback is production', async () => {
    const unmatched = context({
      summarize: async () => ({ branch: 'feature/x', pathExists: true })
    })
    const local = join(dir, 'a.txt')
    writeFileSync(local, 'a')

    const result = (await uploadTool.run(unmatched, {
      files: [{ local, remote: '/srv/a.txt' }]
    })) as { ok: boolean; blocked: boolean; message: string }

    expect(result.ok).toBe(false)
    expect(result.blocked).toBe(true)
    expect(result.message).toContain('production')
    // Nothing may reach the host while the target is in doubt.
    expect(remote.size).toBe(0)
  })
})

describe('download_files', () => {
  it('downloads and verifies by checksum', async () => {
    remote.set('/srv/wp-config.php', '<?php // remote')
    const local = join(dir, 'wp-config.php')

    const result = (await downloadTool.run(context(), {
      files: [{ local, remote: '/srv/wp-config.php' }]
    })) as { ok: boolean; files: { verified: boolean }[] }

    expect(result.ok).toBe(true)
    expect(result.files[0]?.verified).toBe(true)
    expect(readFileSync(local, 'utf8')).toBe('<?php // remote')
  })

  it('reports a missing remote file instead of writing an empty one', async () => {
    const local = join(dir, 'missing.php')

    const result = (await downloadTool.run(context(), {
      files: [{ local, remote: '/srv/missing.php' }]
    })) as { ok: boolean; files: { error?: string }[] }

    expect(result.ok).toBe(false)
    expect(result.files[0]?.error).toContain('No such file')
    expect(() => readFileSync(local)).toThrow()
  })
})
