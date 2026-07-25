import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import { SiteRunStepError } from './pipeline-contract'
import { findRemoteFiles, isLikelyTextFilename } from './remote-file-find'
import { createFakeSshSession, type FakeExecHandler } from './site-tool-test-fixtures'

const ROOT = 'public_html'

type RemoteFile = {
  /** Bytes the server would hand back. */
  contents: Buffer
  /** Overrides the real byte length, to exercise the size gate without allocating. */
  reportedSize?: number
  directory?: boolean
}

/**
 * A tiny remote filesystem: `find` lists the keys, and the per-file probes answer from the map.
 * Content always travels base64-encoded, exactly as the implementation asks for it.
 */
function remoteFilesystem(files: Record<string, RemoteFile>): FakeExecHandler {
  const pathOf = (command: string, prefix: string): string =>
    command
      .slice(prefix.length)
      .trim()
      .replace(/^'|'.*$/g, '')
  return (command) => {
    if (command.startsWith('find ')) {
      return { stdout: Object.keys(files).join('\n') }
    }
    if (command.startsWith('test -d ')) {
      const target = pathOf(command, 'test -d ')
      return { code: files[target]?.directory ? 0 : 1 }
    }
    if (command.startsWith('test -f ') || command.startsWith('test -e ')) {
      const target = pathOf(command, command.slice(0, 8))
      return { code: files[target] ? 0 : 1 }
    }
    if (command.startsWith('stat -c %s ')) {
      const target = pathOf(command, 'stat -c %s ')
      const file = files[target]
      return { stdout: `${file?.reportedSize ?? file?.contents.byteLength ?? 'nope'}\n` }
    }
    if (command.startsWith('head -c ')) {
      const target = command.slice(command.indexOf("'") + 1, command.lastIndexOf("'"))
      return { stdout: files[target]?.contents.subarray(0, 8192).toString('base64') ?? '' }
    }
    if (command.startsWith('base64 < ')) {
      const target = pathOf(command, 'base64 < ')
      return { stdout: files[target]?.contents.toString('base64') ?? '' }
    }
    return undefined
  }
}

async function search(handler: FakeExecHandler, overrides: Record<string, unknown> = {}) {
  const fake = createFakeSshSession(handler)
  const result = await findRemoteFiles(fake.session, {
    pattern: '*.php',
    searchRoot: ROOT,
    kind: 'file',
    environment: 'main',
    ...overrides
  })
  return { result, fake }
}

describe('isLikelyTextFilename', () => {
  it.each([['a/wp-config.php'], ['b/.htaccess'], ['c/style.css'], ['d/README']])(
    'treats %s as text',
    (name) => {
      expect(isLikelyTextFilename(name)).toBe(true)
    }
  )

  it.each([['a/logo.png'], ['b/font.woff2'], ['c/archive.tar']])(
    'does not assume %s is text',
    (name) => {
      expect(isLikelyTextFilename(name)).toBe(false)
    }
  )
})

describe('findRemoteFiles pattern validation', () => {
  it.each([[''], ['   '], ['foo;rm -rf /'], ['$(whoami)'], ['a|b'], ['a&b']])(
    'refuses the pattern %j before contacting the server',
    async (pattern) => {
      const fake = createFakeSshSession()
      await expect(
        findRemoteFiles(fake.session, {
          pattern,
          searchRoot: ROOT,
          kind: 'file',
          environment: 'main'
        })
      ).rejects.toThrow(SiteRunStepError)
      expect(fake.commands).toEqual([])
    }
  )

  it('refuses a search root with shell metacharacters', async () => {
    const fake = createFakeSshSession()
    await expect(
      findRemoteFiles(fake.session, {
        pattern: '*.php',
        searchRoot: 'public_html; id',
        kind: 'file',
        environment: 'main'
      })
    ).rejects.toThrow(/disallowed characters/)
  })
})

describe('findRemoteFiles', () => {
  it('returns decoded contents for a small text file', async () => {
    const contents = "<?php\ndefine('DB_NAME','x');\n"
    const { result } = await search(
      remoteFilesystem({ 'public_html/wp-config.php': { contents: Buffer.from(contents) } })
    )
    expect(result).toMatchObject({ environment: 'main', searchRoot: ROOT, moreAvailable: false })
    expect(result.matches).toEqual([
      {
        path: 'public_html/wp-config.php',
        kind: 'file',
        sizeBytes: Buffer.byteLength(contents),
        content: contents,
        encoding: 'utf-8',
        detail: null
      }
    ])
  })

  it('falls back to latin-1 for content that is not valid UTF-8', async () => {
    const { result } = await search(
      remoteFilesystem({
        // 0xFF is never a legal UTF-8 lead byte, so a utf8 round trip would corrupt it.
        'public_html/legacy.php': { contents: Buffer.from([0x3c, 0x3f, 0x70, 0xff, 0x0a]) }
      })
    )
    expect(result.matches[0]).toMatchObject({ kind: 'file', encoding: 'latin-1' })
    expect(result.matches[0].content).toContain('ÿ')
  })

  it('reports a directory match without trying to read it', async () => {
    const { result, fake } = await search(
      remoteFilesystem({
        'public_html/themes': { contents: Buffer.alloc(0), directory: true }
      }),
      { kind: 'any' }
    )
    expect(result.matches[0]).toMatchObject({ kind: 'directory', sizeBytes: null, content: null })
    expect(fake.commands.some((command) => command.startsWith('base64 <'))).toBe(false)
  })

  it('sniffs an unknown extension and refuses to decode a binary blob', async () => {
    const { result, fake } = await search(
      remoteFilesystem({
        'public_html/blob.dat': { contents: Buffer.from([0x01, 0x00, 0x02]) }
      })
    )
    expect(result.matches[0]).toMatchObject({ kind: 'binary', sizeBytes: 3, content: null })
    expect(fake.commands.some((command) => command.startsWith('head -c'))).toBe(true)
    expect(fake.commands.some((command) => command.startsWith('base64 <'))).toBe(false)
  })

  it('decodes an extension-less text file that the sniff clears', async () => {
    const { result } = await search(
      remoteFilesystem({ 'public_html/notes': { contents: Buffer.from('plain text\n') } })
    )
    expect(result.matches[0]).toMatchObject({ kind: 'file', content: 'plain text\n' })
  })

  it('refuses a file over the size cap before reading a single byte', async () => {
    const { result, fake } = await search(
      remoteFilesystem({
        'public_html/dump.sql': { contents: Buffer.from('x'), reportedSize: 50_000_000 }
      }),
      { maxSizeBytes: 1024 }
    )
    expect(result.matches[0]).toMatchObject({ kind: 'too-large', sizeBytes: 50_000_000 })
    expect(result.matches[0].detail).toContain('1024-byte content cap')
    expect(fake.commands.some((command) => command.startsWith('base64 <'))).toBe(false)
  })

  it('marks a file whose size cannot be determined as unreadable', async () => {
    const { result } = await search((command) => {
      if (command.startsWith('find ')) {
        return { stdout: 'public_html/ghost.php' }
      }
      if (command.startsWith('stat -c %s ')) {
        return { stdout: '\n' }
      }
      return { code: 1 }
    })
    expect(result.matches[0]).toMatchObject({ kind: 'unreadable', sizeBytes: null })
  })

  it('caps the match list and says more were available', async () => {
    const files = Object.fromEntries(
      Array.from({ length: 4 }, (_, index) => [
        `public_html/f${index}.php`,
        { contents: Buffer.from('x') }
      ])
    )
    const { result } = await search(remoteFilesystem(files), { maxMatches: 2 })
    expect(result.matches).toHaveLength(2)
    expect(result.moreAvailable).toBe(true)
  })

  it('probes an absolute pattern directly instead of running find', async () => {
    const { result, fake } = await search(
      remoteFilesystem({ '/etc/nginx/nginx.conf': { contents: Buffer.from('server {}\n') } }),
      { pattern: '/etc/nginx/nginx.conf' }
    )
    expect(fake.commands.some((command) => command.startsWith('find '))).toBe(false)
    expect(fake.commands[0]).toBe("test -f '/etc/nginx/nginx.conf'")
    expect(result.matches[0]).toMatchObject({ kind: 'file', content: 'server {}\n' })
  })

  it('reports no matches for an absolute path the server does not have', async () => {
    const { result } = await search(remoteFilesystem({}), { pattern: '/etc/nope.conf' })
    expect(result.matches).toEqual([])
    expect(result.moreAvailable).toBe(false)
  })

  it('asks find for the requested node type and clamps the depth', async () => {
    const { fake } = await search(remoteFilesystem({}), { kind: 'dir', maxDepth: 99 })
    expect(fake.commands[0]).toContain('-maxdepth 12')
    expect(fake.commands[0]).toContain('-type d')

    const any = await search(remoteFilesystem({}), { kind: 'any' })
    expect(any.fake.commands[0]).toContain(String.raw`\( -type f -o -type d \)`)
  })

  it('surfaces a find failure that produced no output at all', async () => {
    const fake = createFakeSshSession(() => ({ code: 2, stderr: 'find: permission denied' }))
    await expect(
      findRemoteFiles(fake.session, {
        pattern: '*.php',
        searchRoot: ROOT,
        kind: 'file',
        environment: 'main'
      })
    ).rejects.toThrow(/permission denied/)
  })
})
