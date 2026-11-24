import { describe, expect, it } from 'vitest'
import type { ProjectPageMeta } from '../../shared/project-pages-types'
import { resolveWikiLinks } from './project-pages-wiki-links'

const page = (id: string, title: string, parentId: string | null = null): ProjectPageMeta =>
  ({ id, title, parentId, archivedAt: null }) as ProjectPageMeta

describe('wiki links from agents', () => {
  it('links by path or unique title and reports misses', () => {
    const pages = [
      page('a', 'Launch'),
      page('b', 'Brief', 'a'),
      page('c', 'Notes'),
      page('d', 'Notes', 'a')
    ]
    const out = resolveWikiLinks(
      'See [[Launch/Brief]], [[brief|the brief]], [[Notes]] and [[Nope]].\n```\n[[Launch]]\n```',
      pages
    )
    expect(out.markdown).toBe(
      'See [Brief](muster-page://b), [the brief](muster-page://b), [Notes](muster-page://c) and [[Nope]].\n```\n[[Launch]]\n```'
    )
    expect(out.unresolved).toEqual(['Nope'])
  })
})
