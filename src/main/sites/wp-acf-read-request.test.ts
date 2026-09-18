import { describe, expect, it } from 'vitest'
import { readAcfContainerPaths, readAcfGetLocation, readAcfGetRequest } from './wp-acf-read-request'

describe('readAcfContainerPaths', () => {
  it('accepts an omitted list, meaning describe the whole target', () => {
    expect(readAcfContainerPaths({}, 'describe')).toEqual([])
    expect(readAcfContainerPaths({ fields: [] }, 'describe')).toEqual([])
  })

  it('keeps root and container paths', () => {
    expect(readAcfContainerPaths({ fields: ['modules', 'modules.10.slides'] }, 'describe')).toEqual(
      ['modules', 'modules.10.slides']
    )
  })

  it('refuses a wildcard, which has no rows to expand here', () => {
    expect(() => readAcfContainerPaths({ fields: ['modules.*'] }, 'describe')).toThrow(/wildcard/)
  })

  it('refuses more than 40 paths', () => {
    expect(() =>
      readAcfContainerPaths({ fields: Array.from({ length: 41 }, () => 'modules') }, 'describe')
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

describe('readAcfGetLocation', () => {
  it.each(['local', 'remote', 'both'])('accepts %s', (location) => {
    expect(readAcfGetLocation({ location })).toBe(location)
  })

  it('refuses anything else', () => {
    expect(() => readAcfGetLocation({ location: 'staging' })).toThrow(/local.*remote.*both/)
  })
})

describe('checksum mode', () => {
  it('asks for digests and allows an omitted fields list', () => {
    expect(readAcfGetRequest({ checksum: true })).toEqual({ mode: 'checksum', fields: [] })
    expect(readAcfGetRequest({ checksum: 'true', fields: ['modules'] })).toEqual({
      mode: 'checksum',
      fields: ['modules']
    })
  })

  it('refuses a wildcard, which has no single digest', () => {
    expect(() => readAcfGetRequest({ checksum: true, fields: ['modules.*'] })).toThrow(/checksum/)
  })

  it('refuses describe and checksum together', () => {
    expect(() => readAcfGetRequest({ checksum: true, describe: true })).toThrow(/different modes/)
  })
})
