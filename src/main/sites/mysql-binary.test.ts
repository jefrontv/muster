import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  checkMysqlBinaryHealth,
  FALLBACK_MYSQL_DIRECTORIES,
  findMysqlBinary,
  mysqlSearchDirectories,
  redactPassword,
  renderMysqlOptionFile,
  resolveMysqlBinary,
  resolveMysqldumpBinary
} from './mysql-binary'
import { SiteRunStepError } from './pipeline-contract'

let root = ''
let preferred = ''
let fallback = ''
let empty = ''

function makeExecutable(directory: string, name: string): string {
  const path = join(directory, name)
  writeFileSync(path, '#!/bin/sh\nexit 0\n')
  chmodSync(path, 0o755)
  return path
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'muster-mysql-binary-'))
  preferred = join(root, 'preferred')
  fallback = join(root, 'fallback')
  empty = join(root, 'empty')
  for (const directory of [preferred, fallback, empty]) {
    mkdirSync(directory)
  }
  for (const directory of [preferred, fallback]) {
    makeExecutable(directory, 'mysql')
    makeExecutable(directory, 'mysqldump')
  }
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('findMysqlBinary', () => {
  it('returns the first directory that holds the binary', () => {
    expect(findMysqlBinary('mysql', [preferred, fallback])).toBe(join(preferred, 'mysql'))
  })

  it('honours search order rather than a fixed preference', () => {
    expect(findMysqlBinary('mysql', [fallback, preferred])).toBe(join(fallback, 'mysql'))
  })

  it('skips directories that do not hold the binary', () => {
    expect(findMysqlBinary('mysqldump', [empty, fallback])).toBe(join(fallback, 'mysqldump'))
  })

  it('ignores a directory that happens to be named like the binary', () => {
    const shadow = join(root, 'shadow')
    mkdirSync(join(shadow, 'mysql'), { recursive: true })
    expect(findMysqlBinary('mysql', [shadow])).toBeNull()
  })

  it.skipIf(process.platform === 'win32')('ignores a non-executable file', () => {
    const inert = join(root, 'inert')
    mkdirSync(inert, { recursive: true })
    writeFileSync(join(inert, 'mysql'), 'not a program')
    chmodSync(join(inert, 'mysql'), 0o644)
    expect(findMysqlBinary('mysql', [inert])).toBeNull()
  })

  it('returns null when nothing matches', () => {
    expect(findMysqlBinary('mysql', [empty])).toBeNull()
  })
})

describe('mysqlSearchDirectories', () => {
  it('searches PATH before the known macOS install locations', () => {
    const directories = mysqlSearchDirectories(['/first', '/second'].join(delimiter))
    expect(directories).toEqual(['/first', '/second', ...FALLBACK_MYSQL_DIRECTORIES])
  })

  it('drops empty PATH entries', () => {
    const directories = mysqlSearchDirectories(`${delimiter}/only${delimiter}`)
    expect(directories).toEqual(['/only', ...FALLBACK_MYSQL_DIRECTORIES])
  })

  it('still offers the fallbacks when PATH is unset', () => {
    expect(mysqlSearchDirectories('')).toEqual(FALLBACK_MYSQL_DIRECTORIES)
  })
})

describe('resolveMysqlBinary', () => {
  it('resolves through the supplied directories', () => {
    expect(resolveMysqlBinary([empty, preferred])).toBe(join(preferred, 'mysql'))
    expect(resolveMysqldumpBinary([empty, preferred])).toBe(join(preferred, 'mysqldump'))
  })

  it('throws a step error naming the missing binary and the fix', () => {
    let thrown: unknown
    try {
      resolveMysqlBinary([empty])
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(SiteRunStepError)
    expect((thrown as SiteRunStepError).step).toBe('mysql-binary')
    expect((thrown as Error).message).toBe(
      'Could not find the mysql binary. Install MySQL (`brew install mysql`) or add its bin directory to PATH.'
    )
  })

  it('names mysqldump specifically when that is the missing one', () => {
    expect(() => resolveMysqldumpBinary([empty])).toThrow(/Could not find the mysqldump binary/)
  })
})

describe('checkMysqlBinaryHealth', () => {
  it('reports both binaries as found', () => {
    expect(checkMysqlBinaryHealth([preferred])).toEqual({
      ok: true,
      remedy: null,
      binaries: [
        { binary: 'mysql', path: join(preferred, 'mysql') },
        { binary: 'mysqldump', path: join(preferred, 'mysqldump') }
      ]
    })
  })

  it('reports a null path plus a remedy when nothing resolves', () => {
    const health = checkMysqlBinaryHealth([empty])
    expect(health.ok).toBe(false)
    expect(health.binaries.map((status) => status.path)).toEqual([null, null])
    expect(health.remedy).toContain('brew install mysql')
  })
})

describe('renderMysqlOptionFile', () => {
  it('renders the bare [client] body the remote dump needs', () => {
    expect(renderMysqlOptionFile({ user: 'wp_user', password: 's3cret' })).toBe(
      '[client]\nuser="wp_user"\npassword="s3cret"\n'
    )
  })

  it('escapes backslashes and double quotes so the value cannot break out', () => {
    const body = renderMysqlOptionFile({ user: 'ad\\min', password: 'he said "hi"' })
    expect(body).toBe('[client]\nuser="ad\\\\min"\npassword="he said \\"hi\\""\n')
  })

  it('escapes a backslash before a quote without swallowing it', () => {
    // A naive quote-first pass would turn \" into \\" and re-escape its own backslash.
    expect(renderMysqlOptionFile({ user: 'u', password: 'a\\"b' })).toContain(
      'password="a\\\\\\"b"'
    )
  })

  it('leaves a password containing a comment marker intact', () => {
    // Bare `password=p#1` would be truncated at the `#`; quoting is what protects it.
    expect(renderMysqlOptionFile({ user: 'u', password: 'p#1 ' })).toContain('password="p#1 "')
  })

  it('adds a socket line for a LocalWP per-site daemon', () => {
    const body = renderMysqlOptionFile({
      user: 'root',
      password: 'root',
      transport: { kind: 'socket', socketPath: '/tmp/mysql.sock' }
    })
    expect(body).toBe('[client]\nuser="root"\npassword="root"\nsocket="/tmp/mysql.sock"\n')
  })

  it('pins loopback TCP with an explicit port for MAMP or DBngin', () => {
    const body = renderMysqlOptionFile({
      user: 'root',
      password: 'root',
      transport: { kind: 'tcp', port: 8889 }
    })
    expect(body).toBe(
      '[client]\nuser="root"\npassword="root"\nhost="127.0.0.1"\nprotocol=tcp\nport=8889\n'
    )
  })

  it('omits the port line when there is no configured port', () => {
    const body = renderMysqlOptionFile({
      user: 'root',
      password: 'root',
      transport: { kind: 'tcp', port: null }
    })
    expect(body).toBe('[client]\nuser="root"\npassword="root"\nhost="127.0.0.1"\nprotocol=tcp\n')
  })
})

describe('redactPassword', () => {
  it('replaces every occurrence', () => {
    expect(redactPassword('tried hunter2, then hunter2', 'hunter2')).toBe(
      'tried ********, then ********'
    )
  })

  it('leaves the text alone when there is no password to redact', () => {
    expect(redactPassword('connection refused', '')).toBe('connection refused')
  })
})
