import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  EXTENSION_CATALOG_TTL_MS,
  loadExtensionCatalog,
  type ExtensionCatalogEnv
} from './catalog-source'

const bundled = {
  schemaVersion: 1,
  updatedAt: '2026-01-01',
  entries: [
    {
      id: 'bundled-entry',
      kind: 'mcp',
      name: 'Bundled',
      description: 'From the app bundle.',
      keywords: [],
      version: '1.0.0',
      install: { method: 'bundled-skill', skill: 'inert' },
      latest: { source: 'bundled' }
    }
  ]
}

function remoteCatalog(id: string): typeof bundled {
  return { ...bundled, entries: [{ ...bundled.entries[0], id }] }
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 })
}

let directory: string
let env: ExtensionCatalogEnv
let now = 1_000_000

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'extension-catalog-'))
  await writeFile(join(directory, 'bundled.json'), JSON.stringify(bundled), 'utf8')
  now = 1_000_000
  env = {
    bundledPath: join(directory, 'bundled.json'),
    cachePath: join(directory, 'cache.json'),
    url: 'https://example.invalid/extension-catalog.json',
    now: () => now,
    fetch: vi.fn()
  }
})

describe('loadExtensionCatalog', () => {
  it('fetches and caches a valid remote catalog', async () => {
    env.fetch = vi.fn().mockResolvedValue(jsonResponse(remoteCatalog('remote-entry')))

    const result = await loadExtensionCatalog({}, env)

    expect(result.origin).toBe('remote')
    expect(result.catalog.entries[0].id).toBe('remote-entry')
    const cached = JSON.parse(await readFile(env.cachePath, 'utf8'))
    expect(cached.catalog.entries[0].id).toBe('remote-entry')
  })

  it('serves a fresh cache without touching the network', async () => {
    await writeFile(
      env.cachePath,
      JSON.stringify({ fetchedAt: now, catalog: remoteCatalog('cached-entry') }),
      'utf8'
    )

    const result = await loadExtensionCatalog({}, env)

    expect(result.origin).toBe('cache')
    expect(env.fetch).not.toHaveBeenCalled()
  })

  it('refetches once the cache is past its TTL', async () => {
    await writeFile(
      env.cachePath,
      JSON.stringify({ fetchedAt: now - EXTENSION_CATALOG_TTL_MS - 1, catalog: bundled }),
      'utf8'
    )
    env.fetch = vi.fn().mockResolvedValue(jsonResponse(remoteCatalog('refreshed')))

    const result = await loadExtensionCatalog({}, env)

    expect(result.origin).toBe('remote')
    expect(result.catalog.entries[0].id).toBe('refreshed')
  })

  it('keeps the last good cache when the network fails', async () => {
    await writeFile(
      env.cachePath,
      JSON.stringify({ fetchedAt: now, catalog: remoteCatalog('last-good') }),
      'utf8'
    )
    env.fetch = vi.fn().mockRejectedValue(new Error('offline'))

    const result = await loadExtensionCatalog({ force: true }, env)

    expect(result.origin).toBe('cache')
    expect(result.catalog.entries[0].id).toBe('last-good')
    expect(result.error).toBe('offline')
  })

  it('discards a corrupt remote catalog rather than adopting it', async () => {
    env.fetch = vi.fn().mockResolvedValue(jsonResponse({ schemaVersion: 1, entries: 'nope' }))

    const result = await loadExtensionCatalog({}, env)

    expect(result.origin).toBe('bundled')
    expect(result.catalog.entries[0].id).toBe('bundled-entry')
    expect(result.error).toContain('schema')
  })

  it('ignores a corrupt cache file', async () => {
    await writeFile(env.cachePath, '{ not json', 'utf8')
    env.fetch = vi.fn().mockRejectedValue(new Error('offline'))

    const result = await loadExtensionCatalog({}, env)

    expect(result.origin).toBe('bundled')
  })

  it('falls back to an empty catalog when even the bundled copy is missing', async () => {
    env.bundledPath = join(directory, 'absent.json')
    env.fetch = vi.fn().mockRejectedValue(new Error('offline'))

    const result = await loadExtensionCatalog({}, env)

    expect(result.origin).toBe('bundled')
    expect(result.catalog.entries).toEqual([])
  })

  it('refuses a response larger than a catalog can be', async () => {
    env.fetch = vi.fn().mockResolvedValue(new Response('x'.repeat(600 * 1024), { status: 200 }))

    const result = await loadExtensionCatalog({}, env)

    expect(result.origin).toBe('bundled')
    expect(result.error).toContain('larger')
  })

  it('treats a non-200 as a failure', async () => {
    env.fetch = vi.fn().mockResolvedValue(new Response('nope', { status: 404 }))

    const result = await loadExtensionCatalog({}, env)

    expect(result.origin).toBe('bundled')
    expect(result.error).toContain('404')
  })
})

describe('the shipped catalog', () => {
  it('parses against the schema it is validated by', async () => {
    const shipped = await loadExtensionCatalog(
      {},
      {
        ...env,
        bundledPath: join(process.cwd(), 'resources', 'extensions', 'extension-catalog.json'),
        fetch: vi.fn().mockRejectedValue(new Error('offline'))
      }
    )

    expect(shipped.origin).toBe('bundled')
    expect(shipped.catalog.entries.map((entry) => entry.id)).toContain('activecollab-mcp')
  })
})
