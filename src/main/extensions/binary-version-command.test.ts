import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearBinaryVersionCache,
  parseVersionOutput,
  readVersionByCommand,
  type BinaryVersionCommandEnv
} from './binary-version-command'

function env(overrides: Partial<BinaryVersionCommandEnv> = {}): BinaryVersionCommandEnv {
  return {
    run: async () => ({ stdout: '', stderr: '' }),
    fingerprint: () => '100:1',
    ...overrides
  }
}

describe('parseVersionOutput', () => {
  it('reads the version out of a named banner line', () => {
    // The exact shape `agent-local version` prints, which is what sent every Agent Local install
    // to "Version unknown" before this ran at all.
    expect(
      parseVersionOutput('agent-local 0.34.1\n   commit  419a927\n    built  2026-09-18T00:31:34Z')
    ).toBe('0.34.1')
  })

  it('reads a bare version', () => {
    expect(parseVersionOutput('1.2.3\n')).toBe('1.2.3')
  })

  it('reads a v-prefixed version without the prefix', () => {
    expect(parseVersionOutput('mytool v2.10.0')).toBe('2.10.0')
  })

  it('accepts a two-part version', () => {
    expect(parseVersionOutput('tool 1.4')).toBe('1.4')
  })

  it('keeps a pre-release suffix', () => {
    expect(parseVersionOutput('tool 1.4.0-rc.2')).toBe('1.4.0-rc.2')
  })

  it('is not fooled by a version-like path segment', () => {
    expect(parseVersionOutput('/opt/v2/bin/tool: no version flag')).toBeNull()
  })

  it('answers null when there is no version at all', () => {
    expect(parseVersionOutput('command not found')).toBeNull()
  })
})

describe('readVersionByCommand', () => {
  beforeEach(() => {
    clearBinaryVersionCache()
  })

  it('does not spawn anything when the entry declares no version args', async () => {
    const run = vi.fn()
    expect(await readVersionByCommand('/bin/tool', undefined, env({ run }))).toBeNull()
    expect(await readVersionByCommand('/bin/tool', [], env({ run }))).toBeNull()
    expect(run).not.toHaveBeenCalled()
  })

  it('runs the declared args and returns the parsed version', async () => {
    const run = vi.fn(async () => ({ stdout: 'agent-local 0.34.1', stderr: '' }))
    expect(await readVersionByCommand('/bin/agent-local', ['version'], env({ run }))).toBe('0.34.1')
    expect(run).toHaveBeenCalledWith('/bin/agent-local', ['version'])
  })

  it('falls back to stderr, where plenty of tools print their banner', async () => {
    const run = async () => ({ stdout: '', stderr: 'tool 3.1.4' })
    expect(await readVersionByCommand('/bin/tool', ['--version'], env({ run }))).toBe('3.1.4')
  })

  it('answers null when the program cannot be run', async () => {
    const run = async () => {
      throw new Error('ENOENT')
    }
    expect(await readVersionByCommand('/bin/tool', ['version'], env({ run }))).toBeNull()
  })

  it('caches per executable, so a focus rescan does not respawn it', async () => {
    const run = vi.fn(async () => ({ stdout: 'tool 1.0.0', stderr: '' }))
    const shared = env({ run })
    expect(await readVersionByCommand('/bin/tool', ['version'], shared)).toBe('1.0.0')
    expect(await readVersionByCommand('/bin/tool', ['version'], shared)).toBe('1.0.0')
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('caches a null answer too, so an unversioned binary is asked once', async () => {
    const run = vi.fn(async () => ({ stdout: 'no idea', stderr: '' }))
    const shared = env({ run })
    expect(await readVersionByCommand('/bin/tool', ['version'], shared)).toBeNull()
    expect(await readVersionByCommand('/bin/tool', ['version'], shared)).toBeNull()
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('re-reads once the file changes, which is what an update looks like', async () => {
    const run = vi.fn(async () => ({ stdout: 'tool 2.0.0', stderr: '' }))
    let fingerprint = '100:1'
    const shared = env({ run, fingerprint: () => fingerprint })
    await readVersionByCommand('/bin/tool', ['version'], shared)
    fingerprint = '120:2'
    await readVersionByCommand('/bin/tool', ['version'], shared)
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('does not cache when the file cannot be fingerprinted', async () => {
    // Nothing identifies the answer, so caching it would pin a stale version indefinitely.
    const run = vi.fn(async () => ({ stdout: 'tool 1.0.0', stderr: '' }))
    const shared = env({ run, fingerprint: () => null })
    await readVersionByCommand('/bin/tool', ['version'], shared)
    await readVersionByCommand('/bin/tool', ['version'], shared)
    expect(run).toHaveBeenCalledTimes(2)
  })
})
