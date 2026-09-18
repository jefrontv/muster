import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { createFakeSiteMcpContext } from '../site-tool-test-fixtures'
import { createAcfStateStore, type AcfStateStore } from '../wp-acf-state-store'
import { dispatchSiteMcpTool, findSiteMcpTool } from './site-mcp-tools'

let store: AcfStateStore
let uploads: { path: string; contents: string }[] = []
let evalPayloads: Record<string, unknown>[] = []

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

/** Answers each eval-file run in turn, so a two-half replay can be scripted half by half. */
function context(responses: string[], options: { branch?: string | null } = {}) {
  let index = 0
  return createFakeSiteMcpContext({
    ...options,
    acfState: store,
    uploads,
    exec: (command) => {
      if (!command.includes('eval-file')) {
        return { code: 0, stdout: 'ok', stderr: '' }
      }
      const body = uploads.findLast((file) => file.path.endsWith('.json'))?.contents
      if (body) {
        evalPayloads.push(JSON.parse(body) as Record<string, unknown>)
      }
      const stdout = responses[Math.min(index, responses.length - 1)] ?? envelope()
      index += 1
      return { code: 0, stdout, stderr: '' }
    }
  })
}

async function call(responses: string[], args: Record<string, unknown>, name = 'update_wp_fields') {
  const tool = findSiteMcpTool(name)
  if (!tool) {
    throw new Error(`missing ${name}`)
  }
  const result = await dispatchSiteMcpTool(context(responses), tool, args)
  return {
    isError: result.isError === true,
    payload: JSON.parse(result.content[0]?.text ?? '{}')
  }
}

function storedRevert(overrides: Record<string, unknown> = {}) {
  return store.save({
    kind: 'revert',
    site_id: 'site-1',
    location: 'remote',
    environment: 'main',
    target: { kind: 'post', id: 672 },
    summary: '1 field, 1 row op on kind post id 672',
    digests: { modules: 'digest-a' },
    payload: {
      target: { kind: 'post', id: 672 },
      fields: [{ path: 'page_theme', value: 'red' }],
      rows: [{ op: 'delete', path: 'modules', index: 3 }]
    },
    ...overrides
  })
}

beforeEach(() => {
  store = createAcfStateStore(mkdtempSync(path.join(tmpdir(), 'muster-undo-')))
  uploads = []
  evalPayloads = []
})

describe('revert_token', () => {
  it('stores the revert after an apply and hands back a token', async () => {
    const { payload } = await call(
      [
        envelope({
          apply: true,
          revert: { target: { kind: 'option' }, fields: [{ path: 'hero_title', value: 'Old' }] },
          digests: { hero_title: 'digest-a' }
        })
      ],
      {
        location: 'remote',
        env: 'main',
        target: { kind: 'option' },
        fields: [{ path: 'hero_title', value: 'New' }],
        apply: true
      }
    )
    expect(typeof payload.revert_token).toBe('string')
    const record = store.load('site-1', String(payload.revert_token))
    expect(record).toMatchObject({
      kind: 'revert',
      location: 'remote',
      environment: 'main',
      digests: { hero_title: 'digest-a' }
    })
    expect(record?.summary).toContain('1 field')
  })

  it('issues no token for a preview', async () => {
    const { payload } = await call(
      [envelope({ apply: false, revert: { fields: [{ path: 'hero_title', value: 'Old' }] } })],
      {
        location: 'remote',
        env: 'main',
        target: { kind: 'option' },
        fields: [{ path: 'hero_title', value: 'New' }]
      }
    )
    expect(payload).not.toHaveProperty('revert_token')
  })
})

describe('undo', () => {
  it('refuses fields alongside a token', async () => {
    const record = storedRevert()
    const { isError, payload } = await call([envelope()], {
      location: 'remote',
      env: 'main',
      undo: record.token,
      fields: [{ path: 'hero_title', value: 'x' }]
    })
    expect(isError).toBe(true)
    expect(String(payload.error)).toContain('no fields, rows or targets')
  })

  it('refuses a token this site never issued', async () => {
    const { isError, payload } = await call([envelope()], { undo: 'deadbeef' })
    expect(isError).toBe(true)
    expect(String(payload.error)).toContain('list_wp_reverts')
  })

  it('refuses a token that was already replayed', async () => {
    const record = storedRevert()
    store.markConsumed('site-1', record.token)
    const { isError, payload } = await call([envelope()], { undo: record.token })
    expect(isError).toBe(true)
    expect(String(payload.error)).toContain('already replayed')
    expect(String(payload.error)).toContain(record.summary)
  })

  it('refuses when a touched root changed since the write, naming the root', async () => {
    const record = storedRevert()
    const { isError, payload } = await call(
      [envelope({ results: [{ path: 'modules', digest: 'digest-b' }] })],
      { undo: record.token, apply: true }
    )
    expect(isError).toBe(true)
    expect(String(payload.error)).toContain('modules changed since')
    expect(payload.drifted).toEqual(['modules'])
    expect(store.load('site-1', record.token)?.consumed).toBeUndefined()
  })

  it('replays rows before fields and consumes the token on apply', async () => {
    const record = storedRevert()
    const { isError, payload } = await call(
      [
        envelope({ results: [{ path: 'modules', digest: 'digest-a' }] }),
        envelope({ apply: true }),
        envelope({ apply: true })
      ],
      { undo: record.token, apply: true }
    )
    expect(isError).toBe(false)
    expect(payload).toMatchObject({ ok: true, undo: record.token, apply: true, consumed: true })
    const modes = evalPayloads.map((entry) => entry.mode)
    expect(modes).toEqual(['checksum', 'apply', 'apply'])
    expect(evalPayloads[1]).toHaveProperty('rows')
    expect(evalPayloads[2]?.fields).toEqual([{ path: 'page_theme', value: 'red' }])
    expect(store.load('site-1', record.token)?.consumed).toBeTruthy()
  })

  it('stores a redo token for each half that applied', async () => {
    const record = storedRevert()
    const { payload } = await call(
      [
        envelope({ results: [{ path: 'modules', digest: 'digest-a' }] }),
        envelope({
          apply: true,
          revert: { rows: [{ op: 'insert', path: 'modules', index: 3 }] },
          digests: { modules: 'digest-c' }
        }),
        envelope({
          apply: true,
          revert: { fields: [{ path: 'page_theme', value: 'blue' }] },
          digests: { page_theme: 'digest-d' }
        })
      ],
      { undo: record.token, apply: true }
    )
    const tokens = payload.revert_tokens as { rows: string; fields: string }
    expect(Object.keys(tokens).sort()).toEqual(['fields', 'rows'])
    expect(store.load('site-1', tokens.rows)?.digests).toEqual({ modules: 'digest-c' })
    expect(store.load('site-1', tokens.fields)?.digests).toEqual({ page_theme: 'digest-d' })
  })

  it('issues no redo token for a preview', async () => {
    const record = storedRevert()
    const { payload } = await call(
      [
        envelope({ results: [{ path: 'modules', digest: 'digest-a' }] }),
        envelope({ revert: { rows: [{ op: 'insert', path: 'modules', index: 3 }] } }),
        envelope({ revert: { fields: [{ path: 'page_theme', value: 'blue' }] } })
      ],
      { undo: record.token }
    )
    expect(payload).not.toHaveProperty('revert_tokens')
  })

  it('previews both halves and leaves the token unconsumed', async () => {
    const record = storedRevert()
    const { payload } = await call(
      [envelope({ results: [{ path: 'modules', digest: 'digest-a' }] }), envelope(), envelope()],
      { undo: record.token }
    )
    expect(payload).toMatchObject({ apply: false, consumed: false })
    expect(evalPayloads.map((entry) => entry.mode)).toEqual(['checksum', 'preview', 'preview'])
    expect(store.load('site-1', record.token)?.consumed).toBeUndefined()
  })

  it('stops after a failed rows half and keeps the token', async () => {
    const record = storedRevert()
    const { payload } = await call(
      [
        envelope({ results: [{ path: 'modules', digest: 'digest-a' }] }),
        envelope({ ok: false, apply: false, apply_skipped: true })
      ],
      { undo: record.token, apply: true }
    )
    expect(payload).toMatchObject({ ok: false, consumed: false })
    expect(payload.fields).toBeNull()
    expect(String(payload.warnings)).toContain('rows half failed')
    expect(evalPayloads.map((entry) => entry.mode)).toEqual(['checksum', 'apply'])
    expect(store.load('site-1', record.token)?.consumed).toBeUndefined()
  })

  it('skips the drift check when the record carries no digests', async () => {
    const record = storedRevert({ digests: {} })
    const { payload } = await call([envelope(), envelope()], { undo: record.token })
    expect(payload.drift_checked).toEqual([])
    expect(evalPayloads.map((entry) => entry.mode)).toEqual(['preview', 'preview'])
  })
})
