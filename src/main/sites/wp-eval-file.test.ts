import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { streamCommand, type StreamCommandResult } from '../lib/stream-command'
import { SiteRunStepError } from './pipeline-contract'
import { createFakeSshSession } from './site-tool-test-fixtures'
import {
  runLocalWpEvalFile,
  runRemoteWpEvalFile,
  WP_EVAL_BUNDLED_MAX_OUTPUT_CHARS,
  WP_EVAL_FILE_MAX_BYTES
} from './wp-eval-file'

vi.mock('../lib/stream-command', () => ({ streamCommand: vi.fn() }))

const streamCommandMock = vi.mocked(streamCommand)

function commandResult(overrides: Partial<StreamCommandResult> = {}): StreamCommandResult {
  return {
    code: 0,
    stdout: '{"ok":true}',
    stderr: '',
    timedOut: false,
    truncated: false,
    stoppedEarly: false,
    ...overrides
  }
}

beforeEach(() => {
  streamCommandMock.mockReset()
  streamCommandMock.mockResolvedValue(commandResult())
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('runLocalWpEvalFile', () => {
  it('writes a temp file, spawns eval-file, and unlinks even when spawn throws', async () => {
    const written: string[] = []
    streamCommandMock.mockImplementation(async (_bin, args) => {
      written.push(String(args[2]))
      throw new Error('spawn wp ENOENT')
    })
    await expect(
      runLocalWpEvalFile({ wpDir: '/sites/acme', php: '<?php echo 1;' })
    ).rejects.toThrow(SiteRunStepError)
    expect(written).toHaveLength(1)
    expect(written[0]).toMatch(/muster-eval-.*\.php$/)
    const { access } = await import('node:fs/promises')
    await expect(access(written[0])).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('passes the sidecar path as the first extra eval-file argument', async () => {
    await runLocalWpEvalFile({
      wpDir: '/sites/acme',
      php: '<?php echo 1;',
      sidecar: '{"apply":false}'
    })
    const args = streamCommandMock.mock.calls[0]?.[1] as string[]
    expect(args[0]).toBe('--no-color')
    expect(args[1]).toBe('eval-file')
    expect(args[2]).toMatch(/muster-eval-.*\.php$/)
    expect(args[3]).toMatch(/muster-eval-.*\.json$/)
  })

  it('refuses extra args with shell metacharacters before writing', async () => {
    await expect(
      runLocalWpEvalFile({
        wpDir: '/sites/acme',
        php: '<?php echo 1;',
        args: ['x; rm -rf /']
      })
    ).rejects.toThrow(/shell metacharacters/)
    expect(streamCommandMock).not.toHaveBeenCalled()
  })

  it('cuts stdout at 50,000 chars by default and at the given cap for a bundled runner', async () => {
    const long = 'x'.repeat(120_000)
    streamCommandMock.mockResolvedValue(commandResult({ stdout: long }))
    const capped = await runLocalWpEvalFile({ wpDir: '/sites/acme', php: '<?php echo 1;' })
    expect(capped.stdout).toHaveLength(50_000)
    expect(capped.stdoutTruncated).toBe(true)
    const raised = await runLocalWpEvalFile({
      wpDir: '/sites/acme',
      php: '<?php echo 1;',
      maxOutputChars: WP_EVAL_BUNDLED_MAX_OUTPUT_CHARS
    })
    expect(raised.stdout).toHaveLength(120_000)
    expect(raised.stdoutTruncated).toBe(false)
  })

  it('refuses an oversize PHP body', async () => {
    await expect(
      runLocalWpEvalFile({
        wpDir: '/sites/acme',
        php: 'x'.repeat(WP_EVAL_FILE_MAX_BYTES + 1)
      })
    ).rejects.toThrow(/cap/)
    expect(streamCommandMock).not.toHaveBeenCalled()
  })
})

describe('runRemoteWpEvalFile', () => {
  it('uploads php+json, runs quoted eval-file, and deletes both on success', async () => {
    const fake = createFakeSshSession(() => ({ stdout: '{"ok":true}' }))
    const result = await runRemoteWpEvalFile(fake.session, {
      webroot: 'public_html',
      php: '<?php echo 1;',
      sidecar: '{"apply":false}'
    })
    expect(fake.secureFiles).toHaveLength(2)
    expect(fake.secureFiles[0]?.path).toMatch(/^\/tmp\/muster-eval-.*\.php$/)
    expect(fake.secureFiles[1]?.path).toMatch(/^\/tmp\/muster-eval-.*\.json$/)
    expect(fake.commands[0]).toContain('eval-file')
    expect(fake.commands[0]).toContain("'public_html'")
    expect(fake.removed).toEqual([fake.secureFiles[0]?.path, fake.secureFiles[1]?.path])
    expect(result.stdout).toBe('{"ok":true}')
  })

  it('applies the same cap over SSH', async () => {
    const long = 'y'.repeat(120_000)
    const fake = createFakeSshSession(() => ({ stdout: long }))
    const capped = await runRemoteWpEvalFile(fake.session, {
      webroot: 'public_html',
      php: '<?php echo 1;'
    })
    expect(capped.stdout).toHaveLength(50_000)
    const raised = await runRemoteWpEvalFile(fake.session, {
      webroot: 'public_html',
      php: '<?php echo 1;',
      maxOutputChars: WP_EVAL_BUNDLED_MAX_OUTPUT_CHARS
    })
    expect(raised.stdout).toHaveLength(120_000)
  })

  it('deletes uploaded files when exec throws', async () => {
    const fake = createFakeSshSession((command) => {
      if (command.includes('eval-file')) {
        throw new Error('ssh dropped')
      }
      return undefined
    })
    await expect(
      runRemoteWpEvalFile(fake.session, { webroot: '/var/www', php: '<?php echo 1;' })
    ).rejects.toThrow('ssh dropped')
    expect(fake.secureFiles).toHaveLength(1)
    expect(fake.removed).toEqual([fake.secureFiles[0]?.path])
  })

  it('refuses metacharacters before any remote write', async () => {
    const fake = createFakeSshSession()
    await expect(
      runRemoteWpEvalFile(fake.session, {
        webroot: 'public_html',
        php: '<?php echo 1;',
        args: ['$(whoami)']
      })
    ).rejects.toThrow(/shell metacharacters/)
    expect(fake.secureFiles).toHaveLength(0)
  })
})
