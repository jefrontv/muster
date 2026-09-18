import { describe, expect, it } from 'vitest'
import { readAcfDescribePaths, readAcfGetRequest } from './wp-acf-read-request'

describe('readAcfDescribePaths', () => {
  it('accepts an omitted list, meaning describe the whole target', () => {
    expect(readAcfDescribePaths({})).toEqual([])
    expect(readAcfDescribePaths({ fields: [] })).toEqual([])
  })

  it('keeps root and container paths', () => {
    expect(readAcfDescribePaths({ fields: ['modules', 'modules.10.slides'] })).toEqual([
      'modules',
      'modules.10.slides'
    ])
  })

  it('refuses a wildcard, which has no rows to expand here', () => {
    expect(() => readAcfDescribePaths({ fields: ['modules.*'] })).toThrow(/wildcard/)
  })

  it('refuses more than 40 paths', () => {
    expect(() =>
      readAcfDescribePaths({ fields: Array.from({ length: 41 }, () => 'modules') })
    ).toThrow(/at most 40/)
  })
})

describe('readAcfGetRequest', () => {
  it('reads values when describe is absent', () => {
    expect(readAcfGetRequest({ fields: ['hero_title'] })).toEqual({
      mode: 'get',
      fields: ['hero_title']
    })
  })

  it('keeps demanding paths for a plain read', () => {
    expect(() => readAcfGetRequest({})).toThrow(/'fields'/)
  })

  it('allows an omitted fields list in describe mode', () => {
    expect(readAcfGetRequest({ describe: true })).toEqual({ mode: 'describe', fields: [] })
  })

  it('carries layout_filter through describe', () => {
    expect(
      readAcfGetRequest({ describe: 'true', fields: ['modules'], layout_filter: 'media' })
    ).toEqual({ mode: 'describe', fields: ['modules'], layoutFilter: 'media' })
  })

  it('refuses layout_filter without describe', () => {
    expect(() => readAcfGetRequest({ fields: ['modules'], layout_filter: 'media' })).toThrow(
      /describe/
    )
  })
})
