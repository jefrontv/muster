import { describe, expect, it } from 'vitest'
import type { Site } from '../../../shared/site-types'
import { writeSiteToDataFile, type SiteDataFileIo } from './site-mcp-disk-write'

function memoryIo(initial: unknown): SiteDataFileIo & { contents: () => Record<string, unknown> } {
  let text = JSON.stringify(initial)
  return {
    read: () => text,
    write: (_path, next) => {
      text = next
    },
    contents: () => JSON.parse(text) as Record<string, unknown>
  }
}

describe('writeSiteToDataFile', () => {
  it('changes only the one site and leaves everything else as the file had it', () => {
    // Repos and settings a GUI session wrote after this process started must survive.
    const io = memoryIo({
      repos: [{ id: 'r1', path: '/Sites/acme' }],
      settings: { theme: 'dark' },
      sites: [
        { id: 's1', displayName: 'Acme', notes: '' },
        { id: 's2', displayName: 'Other', notes: 'keep' }
      ]
    })

    const written = writeSiteToDataFile(
      '/data.json',
      's1',
      (site) => ({ ...site, notes: 'from the agent' }) as Site,
      io
    )

    expect(written).toMatchObject({ id: 's1', notes: 'from the agent' })
    expect(io.contents()).toEqual({
      repos: [{ id: 'r1', path: '/Sites/acme' }],
      settings: { theme: 'dark' },
      sites: [
        { id: 's1', displayName: 'Acme', notes: 'from the agent' },
        { id: 's2', displayName: 'Other', notes: 'keep' }
      ]
    })
  })

  it('returns null and writes nothing for a site that is not in the file', () => {
    const io = memoryIo({ sites: [] })
    let wrote = false
    const result = writeSiteToDataFile('/data.json', 'missing', (site) => site, {
      ...io,
      write: () => {
        wrote = true
      }
    })
    expect(result).toBeNull()
    expect(wrote).toBe(false)
  })
})
