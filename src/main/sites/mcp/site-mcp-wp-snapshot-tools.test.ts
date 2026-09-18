import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeSiteMcpContext } from '../site-tool-test-fixtures'
import { createAcfStateStore, type AcfStateStore } from '../wp-acf-state-store'
import { dispatchSiteMcpTool, findSiteMcpTool } from './site-mcp-tools'

// A location override sends the restore at the local WordPress, which must not reach a real wp.
vi.mock('../../lib/stream-command', () => ({
  streamCommand: vi.fn(async () => ({
    code: 0,
    stdout:
      '{"ok":true,"home":"https://acme.local","acf_version":"6.8.10","warnings":[],"results":[]}',
    stderr: '',
    timedOut: false,
    truncated: false,
    stoppedEarly: false
  }))
}))

let store: AcfStateStore
let uploads: { path: string; contents: string }[] = []
let evalPayloads: Record<string, unknown>[] = []
let downloaded: string[] = []

// The walker's .out file, verbatim: self-contained, with the values under roots.
const SNAPSHOT_FILE = JSON.stringify({
  ok: true,
  target: { kind: 'post', id: 672 },
  roots: { modules: [{ acf_fc_layout: 'media' }], page_theme: 'red' },
  digests: { modules: 'digest-a', page_theme: 'digest-b' },
  target_digest: 'root'
})
const SNAPSHOT_ROOTS = { modules: [{ acf_fc_layout: 'media' }], page_theme: 'red' }

function envelope(extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    ok: true,
    home: 'https://acme.com',
    acf_version: '6.8.10',
    warnings: [],
    results: [],
    ...extra
  })
}

function context(stdout: string, options: { writeOutputFile?: boolean } = {}) {
  return createFakeSiteMcpContext({
    acfState: store,
    uploads,
    download: (remotePath, localPath) => {
      downloaded.push(remotePath)
      if (options.writeOutputFile === false) {
        throw new Error('no such file')
      }
      writeFileSync(localPath, SNAPSHOT_FILE, 'utf8')
    },
    exec: (command) => {
      if (!command.includes('eval-file')) {
        return { code: 0, stdout: 'ok', stderr: '' }
      }
      const body = uploads.findLast((file) => file.path.endsWith('.json'))?.contents
      if (body) {
        evalPayloads.push(JSON.parse(body) as Record<string, unknown>)
      }
      return { code: 0, stdout, stderr: '' }
    }
  })
}

async function call(
  name: string,
  args: Record<string, unknown>,
  stdout = envelope(),
  options: { writeOutputFile?: boolean } = {}
) {
  const tool = findSiteMcpTool(name)
  if (!tool) {
    throw new Error(`missing ${name}`)
  }
  const result = await dispatchSiteMcpTool(context(stdout, options), tool, args)
  return {
    isError: result.isError === true,
    payload: JSON.parse(result.content[0]?.text ?? '{}')
  }
}

beforeEach(() => {
  store = createAcfStateStore(mkdtempSync(path.join(tmpdir(), 'muster-snapshot-')))
  uploads = []
  evalPayloads = []
  downloaded = []
})

describe('list_wp_reverts', () => {
  it('lists newest first with the consumed flag', async () => {
    store.save({
      kind: 'revert',
      site_id: 'site-1',
      location: 'remote',
      environment: 'main',
      target: { kind: 'option' },
      summary: 'older',
      digests: {},
      payload: { fields: [] }
    })
    const newer = store.save({
      kind: 'revert',
      site_id: 'site-1',
      location: 'local',
      environment: null,
      target: { kind: 'post', id: 672 },
      summary: 'newer',
      digests: {},
      payload: { fields: [] }
    })
    store.markConsumed('site-1', newer.token)
    const { isError, payload } = await call('list_wp_reverts', {})
    expect(isError).toBe(false)
    expect(payload.count).toBe(2)
    const summaries = (payload.reverts as { summary: string; consumed: boolean }[]).map(
      (entry) => `${entry.summary}:${entry.consumed}`
    )
    expect(summaries).toContain('newer:true')
    expect(summaries).toContain('older:false')
  })

  it('does not list a snapshot as a revert', async () => {
    store.save({
      kind: 'snapshot',
      site_id: 'site-1',
      location: 'local',
      environment: null,
      target: { kind: 'option' },
      summary: '1 root',
      digests: {},
      payload: {}
    })
    const { payload } = await call('list_wp_reverts', {})
    expect(payload.count).toBe(0)
  })
})

describe('snapshot_wp_fields', () => {
  it('collects the walker output file and stores it under a token', async () => {
    const { isError, payload } = await call(
      'snapshot_wp_fields',
      { location: 'remote', env: 'main', target: { kind: 'post', id: 672 } },
      envelope({ digests: { modules: 'digest-a', page_theme: 'digest-b' }, target_digest: 'root' })
    )
    expect(isError).toBe(false)
    expect(evalPayloads[0]).toMatchObject({ mode: 'snapshot', target: { kind: 'post', id: 672 } })
    expect(downloaded[0]).toMatch(/\.json\.out$/)
    expect(payload).toMatchObject({
      ok: true,
      paths: ['modules', 'page_theme'],
      digest: 'root',
      location: 'remote',
      environment: 'main'
    })
    const record = store.load('site-1', String(payload.token))
    expect(record?.kind).toBe('snapshot')
    expect(record?.payload).toEqual(JSON.parse(SNAPSHOT_FILE))
  })

  it('sends only the root names it was given', async () => {
    await call('snapshot_wp_fields', {
      location: 'remote',
      env: 'main',
      target: { kind: 'option' },
      fields: ['modules']
    })
    expect(evalPayloads[0]?.fields).toEqual([{ path: 'modules' }])
  })

  it('refuses a dotted path, because a snapshot captures whole roots', async () => {
    const { isError, payload } = await call('snapshot_wp_fields', {
      location: 'remote',
      env: 'main',
      target: { kind: 'option' },
      fields: ['modules.0.section_id']
    })
    expect(isError).toBe(true)
    expect(String(payload.error)).toContain('whole roots')
  })

  it('separates a file that was never written from one that could not be collected', async () => {
    const { isError, payload } = await call(
      'snapshot_wp_fields',
      { location: 'remote', env: 'main', target: { kind: 'option' } },
      envelope({ snapshot: true, output_file: '/tmp/muster-eval-1.json.out', bytes: 4096 }),
      { writeOutputFile: false }
    )
    expect(isError).toBe(true)
    expect(String(payload.error)).toContain('could not collect it from the host')
    expect(payload).toMatchObject({ output_file: '/tmp/muster-eval-1.json.out', bytes: 4096 })
  })

  it('says so when the walker wrote no file', async () => {
    const { isError, payload } = await call(
      'snapshot_wp_fields',
      { location: 'remote', env: 'main', target: { kind: 'option' } },
      envelope(),
      { writeOutputFile: false }
    )
    expect(isError).toBe(true)
    expect(String(payload.error)).toContain('wrote no snapshot file')
  })
})

describe('restore_wp_fields', () => {
  function storedSnapshot(overrides: Record<string, unknown> = {}) {
    return store.save({
      kind: 'snapshot',
      site_id: 'site-1',
      location: 'remote',
      environment: 'main',
      target: { kind: 'post', id: 672 },
      summary: '2 roots',
      digests: { modules: 'digest-a' },
      payload: JSON.parse(SNAPSHOT_FILE),
      ...overrides
    })
  }

  it('previews by default and sends the roots back with apply false', async () => {
    const record = storedSnapshot()
    const { isError, payload } = await call(
      'restore_wp_fields',
      { token: record.token },
      envelope({ results: [{ path: 'modules', changed: true }] })
    )
    expect(isError).toBe(false)
    expect(evalPayloads[0]).toMatchObject({
      mode: 'restore',
      apply: false,
      target: { kind: 'post', id: 672 },
      roots: SNAPSHOT_ROOTS
    })
    expect(payload).toMatchObject({
      snapshot: record.token,
      apply: false,
      snapshot_location: 'remote',
      snapshot_digests: { modules: 'digest-a' }
    })
  })

  it('passes apply through', async () => {
    const record = storedSnapshot()
    await call('restore_wp_fields', { token: record.token, apply: true })
    expect(evalPayloads[0]).toMatchObject({ mode: 'restore', apply: true })
  })

  it('restores onto the host the snapshot came from unless location overrides it', async () => {
    const record = storedSnapshot()
    const { payload } = await call('restore_wp_fields', { token: record.token, location: 'local' })
    expect(payload.location).toBe('local')
  })

  it('refuses an unknown token', async () => {
    const { isError, payload } = await call('restore_wp_fields', { token: 'deadbeef' })
    expect(isError).toBe(true)
    expect(String(payload.error)).toContain('No snapshot is stored')
  })

  it('refuses a revert token, which holds no roots', async () => {
    const revert = store.save({
      kind: 'revert',
      site_id: 'site-1',
      location: 'remote',
      environment: 'main',
      target: { kind: 'option' },
      summary: 'a revert',
      digests: {},
      payload: { fields: [] }
    })
    const { isError, payload } = await call('restore_wp_fields', { token: revert.token })
    expect(isError).toBe(true)
    expect(String(payload.error)).toContain('No snapshot is stored')
  })

  it('refuses a snapshot with nothing in it', async () => {
    const record = storedSnapshot({ payload: { ok: true, roots: {} } })
    const { isError, payload } = await call('restore_wp_fields', { token: record.token })
    expect(isError).toBe(true)
    expect(String(payload.error)).toContain('no roots to restore')
  })
})
