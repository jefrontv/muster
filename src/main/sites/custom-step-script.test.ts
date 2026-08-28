// Moving a script between checkouts. The install side must never clobber a file the target site is
// already using, because that edit is unrecoverable and would silently change what runs there.

import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readScriptWithin, resolveScriptWithin, writeScriptWithin } from './custom-step-script'

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'muster-script-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('resolveScriptWithin', () => {
  it('resolves a nested repo-relative path', () => {
    expect(resolveScriptWithin('/Sites/acme', '.muster/steps/a.sh')).toBe(
      '/Sites/acme/.muster/steps/a.sh'
    )
  })

  it.each(['/etc/passwd', '../escape.sh', 'a/../../escape.sh', '~/x.sh', 'a\\b.sh'])(
    'refuses %s',
    (candidate) => {
      expect(resolveScriptWithin('/Sites/acme', candidate)).toBeNull()
    }
  )
})

describe('readScriptWithin', () => {
  it('returns null rather than throwing when the file is absent', async () => {
    await expect(readScriptWithin(root, '.muster/steps/missing.sh')).resolves.toBeNull()
  })

  it('returns null for an unsafe path even if such a file exists', async () => {
    await expect(readScriptWithin(root, '/etc/hosts')).resolves.toBeNull()
  })
})

describe('writeScriptWithin', () => {
  it('creates parent directories and writes the script', async () => {
    const outcome = await writeScriptWithin(root, '.muster/steps/purge.sh', 'echo hi\n')

    expect(outcome).toBe('written')
    expect(readFileSync(join(root, '.muster/steps/purge.sh'), 'utf8')).toBe('echo hi\n')
  })

  it('reports an identical file as already installed rather than rewriting it', async () => {
    await writeScriptWithin(root, 'steps/a.sh', 'same\n')

    await expect(writeScriptWithin(root, 'steps/a.sh', 'same\n')).resolves.toBe('identical')
  })

  it('refuses to overwrite a different script and leaves it untouched', async () => {
    mkdirSync(join(root, 'steps'), { recursive: true })
    writeFileSync(join(root, 'steps/a.sh'), 'mine\n')

    const outcome = await writeScriptWithin(root, 'steps/a.sh', 'theirs\n')

    expect(outcome).toBe('conflict')
    expect(readFileSync(join(root, 'steps/a.sh'), 'utf8')).toBe('mine\n')
  })

  it('refuses an unsafe path without touching the filesystem', async () => {
    await expect(writeScriptWithin(root, '../outside.sh', 'x')).resolves.toBe('unsafe')
  })
})
