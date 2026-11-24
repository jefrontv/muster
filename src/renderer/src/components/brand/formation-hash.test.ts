import { describe, expect, it } from 'vitest'
import { fnv1a32, identiconCells } from './formation-hash'

describe('identiconCells', () => {
  it('is stable for an id and differs between ids', () => {
    expect(identiconCells('workspace-a')).toEqual(identiconCells('workspace-a'))
    expect(identiconCells('workspace-a')).not.toEqual(identiconCells('workspace-b'))
  })

  it('mirrors left to right on a 5x5 grid', () => {
    const cells = identiconCells('research')
    expect(cells).toHaveLength(25)
    for (let row = 0; row < 5; row++) {
      expect(cells[row * 5]).toBe(cells[row * 5 + 4])
      expect(cells[row * 5 + 1]).toBe(cells[row * 5 + 3])
    }
  })

  it('never draws an empty grid', () => {
    for (let i = 0; i < 500; i++) {
      expect(identiconCells(`id-${i}`).some(Boolean)).toBe(true)
    }
  })

  it('hashes with FNV-1a', () => {
    expect(fnv1a32('')).toBe(0x811c9dc5)
    expect(fnv1a32('a')).toBe(0xe40c292c)
  })
})
