import { describe, expect, it } from 'vitest'
import { collectBitbucketPages, mapPool } from './bitbucket-page-collection'

describe('mapPool', () => {
  it('runs at most `limit` tasks at once and keeps input order', async () => {
    let live = 0
    let peak = 0
    const result = await mapPool([1, 2, 3, 4, 5], 2, async (value) => {
      live += 1
      peak = Math.max(peak, live)
      await Promise.resolve()
      live -= 1
      return value * 10
    })
    expect(result).toEqual([10, 20, 30, 40, 50])
    expect(peak).toBeLessThanOrEqual(2)
  })
})

describe('collectBitbucketPages', () => {
  it('addresses leftover pages with page= instead of walking next', async () => {
    const urls: string[] = []
    const result = await collectBitbucketPages({
      startUrl: 'https://api.bitbucket.org/2.0/repositories/efront_au?pagelen=100',
      fetchJson: async (url) => {
        urls.push(url)
        const page = new URL(url).searchParams.get('page')
        const slug = page === '3' ? 'c' : page === '2' ? 'b' : 'a'
        return {
          ok: true,
          status: 200,
          body: {
            size: 250,
            next: 'https://api.bitbucket.org/ignored',
            values: [{ slug }]
          }
        }
      },
      headers: {},
      parse: (body) => {
        const record = body as { size: number; next: string; values: { slug: string }[] }
        return { items: record.values.map((row) => row.slug), next: record.next, size: record.size }
      },
      describeError: (status) => `HTTP ${status}`,
      pageLength: 100,
      maxPages: 100,
      pageConcurrency: 4
    })
    expect(urls).toHaveLength(3)
    expect(urls[1]).toContain('page=2')
    expect(urls[2]).toContain('page=3')
    expect(result).toEqual({ items: ['a', 'b', 'c'], error: '' })
  })
})
