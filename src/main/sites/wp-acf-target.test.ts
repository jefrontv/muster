import { describe, expect, it } from 'vitest'
import { SiteMcpToolError } from './mcp/site-mcp-arguments'
import {
  ACF_MAX_TARGETS,
  parseAcfTarget,
  readAcfTargetSelection,
  readAcfTargets
} from './wp-acf-target'

describe('parseAcfTarget', () => {
  it('normalises options to option and omits empty id', () => {
    expect(parseAcfTarget({ kind: 'options' })).toEqual({ kind: 'option' })
  })

  it('requires id on post', () => {
    expect(() => parseAcfTarget({ kind: 'post' })).toThrow(/target.id/)
  })

  it('rejects an unknown kind', () => {
    expect(() => parseAcfTarget({ kind: 'widget' })).toThrow(/target.kind/)
  })

  it.each([
    ['post', '0'],
    ['post', 0],
    ['term', '0'],
    ['term', 0],
    ['user', '0'],
    ['user', 0]
  ])('rejects %s id %j', (kind, id) => {
    expect(() => parseAcfTarget({ kind, id })).toThrow(/positive integer/)
  })
})

describe('readAcfTargets', () => {
  it('returns nothing when targets is omitted', () => {
    expect(readAcfTargets({})).toEqual([])
  })

  it('parses every entry with the same rules as target', () => {
    expect(readAcfTargets({ targets: [{ kind: 'post', id: 672 }, { kind: 'options' }] })).toEqual([
      { kind: 'post', id: 672 },
      { kind: 'option' }
    ])
  })

  it('names the offending entry', () => {
    expect(() => readAcfTargets({ targets: [{ kind: 'post', id: 1 }, { kind: 'post' }] })).toThrow(
      SiteMcpToolError
    )
    expect(() => readAcfTargets({ targets: ['post:1'] })).toThrow(/targets\[0\]/)
  })

  it('refuses more than 20 targets', () => {
    const targets = Array.from({ length: ACF_MAX_TARGETS + 1 }, (_, i) => ({
      kind: 'post',
      id: i + 1
    }))
    expect(() => readAcfTargets({ targets })).toThrow(/at most 20/)
  })
})

describe('readAcfTargetSelection', () => {
  it('falls back to the single target', () => {
    expect(readAcfTargetSelection({ target: { kind: 'option' } })).toEqual({
      target: { kind: 'option' }
    })
  })

  it('prefers targets when only targets is given', () => {
    expect(readAcfTargetSelection({ targets: [{ kind: 'post', id: 3 }] })).toEqual({
      targets: [{ kind: 'post', id: 3 }]
    })
  })

  it('refuses both at once', () => {
    expect(() =>
      readAcfTargetSelection({ target: { kind: 'option' }, targets: [{ kind: 'post', id: 3 }] })
    ).toThrow(/not both/)
  })
})
