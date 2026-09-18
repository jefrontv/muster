import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { acfStateDir, createAcfStateStore, isAcfStateToken } from './wp-acf-state-store'

let baseDir = ''

function record(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'revert' as const,
    site_id: 'site-1',
    location: 'remote' as const,
    environment: 'staging',
    target: { kind: 'post', id: 672 },
    summary: 'page_theme on post 672',
    digests: { page_theme: 'aaa' },
    payload: { fields: [{ path: 'page_theme', value: 'red' }] },
    ...overrides
  }
}

function plant(siteId: string, token: string, body: Record<string, unknown> | string): void {
  const dir = path.join(baseDir, siteId)
  const text = typeof body === 'string' ? body : JSON.stringify(body)
  writeFileSync(path.join(dir, `${token}.json`), text, 'utf8')
}

beforeEach(() => {
  baseDir = mkdtempSync(path.join(tmpdir(), 'muster-acf-state-'))
})

describe('acfStateDir', () => {
  it('sits beside the run logs', () => {
    expect(acfStateDir(path.join('/data', 'site-runs'))).toBe(path.join('/data', 'acf-state'))
  })
})

describe('tokens', () => {
  it('issues 8 hex characters and rejects anything else', () => {
    const store = createAcfStateStore(baseDir)
    const saved = store.save(record())
    expect(saved.token).toMatch(/^[0-9a-f]{8}$/)
    expect(isAcfStateToken('../../etc/passwd')).toBe(false)
    expect(store.load('site-1', '../../etc/passwd')).toBeNull()
  })
})

describe('save and load', () => {
  it('round-trips a record and stamps when', () => {
    const store = createAcfStateStore(baseDir)
    const saved = store.save(record())
    const loaded = store.load('site-1', saved.token)
    expect(loaded).toEqual(saved)
    expect(Date.parse(saved.when)).toBeGreaterThan(0)
  })

  it('returns null for a token that was never issued', () => {
    expect(createAcfStateStore(baseDir).load('site-1', 'deadbeef')).toBeNull()
  })

  it('keeps one site out of another site directory', () => {
    const store = createAcfStateStore(baseDir)
    const saved = store.save(record())
    expect(store.load('site-2', saved.token)).toBeNull()
  })
})

describe('markConsumed', () => {
  it('stamps consumed and leaves the record readable', () => {
    const store = createAcfStateStore(baseDir)
    const saved = store.save(record())
    const consumed = store.markConsumed('site-1', saved.token)
    expect(consumed?.consumed).toBeTruthy()
    expect(store.load('site-1', saved.token)?.consumed).toBe(consumed?.consumed)
    expect(store.load('site-1', saved.token)?.payload).toEqual(saved.payload)
  })

  it('returns null for an unknown token', () => {
    expect(createAcfStateStore(baseDir).markConsumed('site-1', 'deadbeef')).toBeNull()
  })
})

describe('list', () => {
  it('returns newest first, filtered by kind and capped', () => {
    const store = createAcfStateStore(baseDir)
    store.save(record({ summary: 'first' }))
    store.save(record({ summary: 'second' }))
    store.save(record({ kind: 'snapshot', summary: 'snap' }))
    const reverts = store.list('site-1', 'revert', 10)
    expect(reverts.map((entry) => entry.summary)).toContain('first')
    expect(reverts).toHaveLength(2)
    expect(store.list('site-1', 'snapshot', 10).map((entry) => entry.summary)).toEqual(['snap'])
    expect(store.list('site-1', 'revert', 1)).toHaveLength(1)
  })

  it('skips a corrupt file instead of failing the listing', () => {
    const store = createAcfStateStore(baseDir)
    const saved = store.save(record())
    plant('site-1', 'badbadba', '{"kind": "revert"')
    plant('site-1', 'nulltok1', { kind: 'revert', site_id: 'site-1' })
    const listed = store.list('site-1', 'revert', 10)
    expect(listed.map((entry) => entry.token)).toEqual([saved.token])
  })

  it('is empty for a site that has never stored anything', () => {
    expect(createAcfStateStore(baseDir).list('nobody', 'revert', 10)).toEqual([])
  })
})

describe('retention', () => {
  it('keeps the newest 20 reverts and drops the rest on the next write', () => {
    const store = createAcfStateStore(baseDir)
    for (let i = 0; i < 23; i += 1) {
      store.save(record({ summary: `write ${i}` }))
    }
    expect(store.list('site-1', 'revert', 100)).toHaveLength(20)
  })

  it('drops a revert older than 24 hours and a snapshot older than 7 days', () => {
    const store = createAcfStateStore(baseDir)
    store.save(record())
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()
    plant('site-1', 'aaaaaaa1', { ...record(), token: 'aaaaaaa1', when: old })
    const ancient = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()
    plant('site-1', 'aaaaaaa2', {
      ...record({ kind: 'snapshot' }),
      token: 'aaaaaaa2',
      when: ancient
    })
    store.save(record({ summary: 'triggers the prune' }))
    store.save(record({ kind: 'snapshot', summary: 'triggers the snapshot prune' }))
    const files = readdirSync(path.join(baseDir, 'site-1'))
    expect(files).not.toContain('aaaaaaa1.json')
    expect(files).not.toContain('aaaaaaa2.json')
  })

  it('keeps reverts and snapshots on separate counters', () => {
    const store = createAcfStateStore(baseDir)
    for (let i = 0; i < 22; i += 1) {
      store.save(record())
    }
    store.save(record({ kind: 'snapshot' }))
    expect(store.list('site-1', 'snapshot', 100)).toHaveLength(1)
    expect(store.list('site-1', 'revert', 100)).toHaveLength(20)
  })
})
