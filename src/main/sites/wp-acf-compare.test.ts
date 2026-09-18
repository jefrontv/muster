import { describe, expect, it } from 'vitest'
import { compareAcfEnvelopes } from './wp-acf-compare'

function envelope(results: unknown[], extra: Record<string, unknown> = {}) {
  return {
    ok: true,
    site: 'Acme',
    home: 'https://acme.local',
    acf_version: '6.8.10',
    warnings: [],
    results,
    ...extra
  }
}

describe('compareAcfEnvelopes', () => {
  it('pairs a plain path and counts only what differs', () => {
    const merged = compareAcfEnvelopes(
      envelope([
        {
          path: 'page_theme',
          exists: true,
          value: 'red',
          field: { key: 'field_a', type: 'select' }
        },
        { path: 'credit_text', exists: true, value: 'same' }
      ]),
      envelope(
        [
          {
            path: 'page_theme',
            exists: true,
            value: 'blue',
            field: { key: 'field_a', type: 'select' }
          },
          { path: 'credit_text', exists: true, value: 'same' }
        ],
        { environment: 'staging', home: 'https://acme.c2.dev' }
      )
    )
    expect(merged).toMatchObject({ ok: true, location: 'both', differs_count: 1 })
    expect(merged.results).toEqual([
      {
        path: 'page_theme',
        field: { key: 'field_a', type: 'select' },
        local: 'red',
        remote: 'blue',
        differs: true
      },
      { path: 'credit_text', local: 'same', remote: 'same', differs: false }
    ])
  })

  it('treats key order and nesting as equal', () => {
    const merged = compareAcfEnvelopes(
      envelope([{ path: 'hero', exists: true, value: { a: 1, b: { c: [1, 2] } } }]),
      envelope([{ path: 'hero', exists: true, value: { b: { c: [1, 2] }, a: 1 } }])
    )
    expect(merged.differs_count).toBe(0)
  })

  it('keeps list order significant', () => {
    const merged = compareAcfEnvelopes(
      envelope([{ path: 'tags', exists: true, value: ['a', 'b'] }]),
      envelope([{ path: 'tags', exists: true, value: ['b', 'a'] }])
    )
    expect(merged.differs_count).toBe(1)
  })

  it('records which side is missing a path', () => {
    const merged = compareAcfEnvelopes(
      envelope([{ path: 'only_local', exists: true, value: 'here' }]),
      envelope([{ path: 'only_local', exists: false, value: null }])
    )
    expect(merged.results).toEqual([
      {
        path: 'only_local',
        local: 'here',
        remote: null,
        differs: true,
        exists: { local: true, remote: false }
      }
    ])
    expect(merged.differs_count).toBe(1)
  })

  it('carries a per-path error under its own side and refuses to guess differs', () => {
    const merged = compareAcfEnvelopes(
      envelope([{ path: 'nope', error: 'unknown field nope' }]),
      envelope([{ path: 'nope', exists: true, value: 'x' }])
    )
    expect(merged.results[0]).toMatchObject({
      path: 'nope',
      differs: null,
      error: { local: 'unknown field nope' }
    })
    expect(merged.differs_count).toBe(0)
  })

  it('carries a whole-side failure under that side', () => {
    const merged = compareAcfEnvelopes(envelope([{ path: 'hero', exists: true, value: 'a' }]), {
      ok: false,
      site: 'Acme',
      error: 'ACF is not active',
      results: []
    })
    expect(merged.ok).toBe(false)
    expect(merged.remote).toMatchObject({ ok: false, error: 'ACF is not active' })
    expect(merged.local).toMatchObject({ ok: true, home: 'https://acme.local' })
  })

  it('pairs wildcard matches by index and lists the one-sided rows', () => {
    const merged = compareAcfEnvelopes(
      envelope([
        {
          path: 'modules.*.section_id',
          field: { key: 'field_s', type: 'text' },
          count: 3,
          matches: [
            { index_path: [0], value: 'hero' },
            { index_path: [1], value: 'same' },
            { index_path: [2], value: 'local-only' }
          ]
        }
      ]),
      envelope([
        {
          path: 'modules.*.section_id',
          field: { key: 'field_s', type: 'text' },
          count: 3,
          matches: [
            { index_path: [0], value: 'HERO' },
            { index_path: [1], value: 'same' },
            { index_path: [3], value: 'remote-only' }
          ]
        }
      ])
    )
    expect(merged.results[0]).toEqual({
      path: 'modules.*.section_id',
      field: { key: 'field_s', type: 'text' },
      count: { local: 3, remote: 3 },
      matches: [
        { index_path: [0], local: 'hero', remote: 'HERO', differs: true },
        { index_path: [1], local: 'same', remote: 'same', differs: false }
      ],
      only_local: [[2]],
      only_remote: [[3]]
    })
    expect(merged.differs_count).toBe(1)
  })

  it('compares digests the same way values are compared', () => {
    const merged = compareAcfEnvelopes(
      envelope([{ path: 'modules', digest: 'aaa' }], { target_digest: 'local-root' }),
      envelope([{ path: 'modules', digest: 'bbb' }], { target_digest: 'remote-root' })
    )
    expect(merged.results[0]).toMatchObject({ local: 'aaa', remote: 'bbb', differs: true })
    expect(merged.local).toMatchObject({ target_digest: 'local-root' })
    expect(merged.remote).toMatchObject({ target_digest: 'remote-root' })
  })
})
