import { afterEach, describe, expect, it } from 'vitest'
import { i18n } from '@/i18n/i18n'
import type { ProjectPageMeta } from '../../../../shared/project-pages-types'
import { trashRowDetail } from './project-pages-trash-detail'

const NOW = 1_800_000_000_000
const HOUR = 3_600_000
const page = (id: string, parentId: string | null, archivedAt: number | null, kind = {}) =>
  ({ id, title: id, parentId, archivedAt, ...kind }) as ProjectPageMeta

describe('trashRowDetail', () => {
  it('names the kind, what went in with it and when', () => {
    const at = NOW - 2 * HOUR
    const pages = [
      page('f', null, at, { folder: true }),
      page('a', 'f', at),
      page('b', 'a', at),
      page('c', 'f', NOW - 5 * HOUR),
      page('d', 'f', null)
    ]
    expect(trashRowDetail(pages[0], pages, NOW)).toBe(
      'Folder · 2 pages inside · Deleted 2 hours ago'
    )
    expect(trashRowDetail(pages[3], pages, NOW)).toBe('Page · Deleted 5 hours ago')
    const diagram = page('g', null, NOW - 3 * 24 * HOUR, { diagram: true })
    expect(trashRowDetail(diagram, [diagram], NOW)).toBe('Diagram · Deleted 3 days ago')
    const fresh = page('h', null, NOW - 20_000)
    expect(trashRowDetail(fresh, [fresh], NOW)).toBe('Page · Deleted just now')
  })

  it('words the time in the app language, not the system one', async () => {
    await i18n.changeLanguage('ja')
    const gone = page('j', null, NOW - 2 * HOUR)
    expect(trashRowDetail(gone, [gone], NOW)).toContain(
      new Intl.RelativeTimeFormat('ja', { numeric: 'auto' }).format(-2, 'hour')
    )
  })
})

afterEach(async () => {
  await i18n.changeLanguage('en')
})
