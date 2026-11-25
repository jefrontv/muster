import { describe, expect, it } from 'vitest'
import { extractPageLinks } from '../../shared/project-pages-plain-text'
import type { ProjectPageMeta } from '../../shared/project-pages-types'
import { extractWikiLinkRefs, findWikiLinkPage } from '../../shared/project-pages-wiki-link-target'
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

  it('leaves [[links]] in inline code, fences and escapes literal', () => {
    const pages = [page('a', 'Launch')]
    const markdown = 'Use `[[Launch]]` or \\[[Launch]], not\n~~~\n[[Launch]]\n~~~\nbut [[Launch]].'
    expect(resolveWikiLinks(markdown, pages)).toEqual({
      markdown: markdown.replace('but [[Launch]]', 'but [Launch](muster-page://a)'),
      unresolved: []
    })
    expect(extractWikiLinkRefs('`[[Code]]` \\[[Escaped]] [[Real]]')).toEqual(['Real'])
    expect(extractPageLinks('`[x](muster-page://a)` [y](muster-page://b)')).toEqual(['b'])
  })

  it('finds a page created after the link was written, and drops it once archived', () => {
    const pages = [page('a', 'Launch')]
    expect(extractWikiLinkRefs('[[Later|soon]] and [[Launch]]\n```\n[[Code]]\n```')).toEqual([
      'Later',
      'Launch'
    ])
    expect(findWikiLinkPage(pages, 'Later')).toBeNull()
    pages.push(page('b', 'Later'))
    expect(findWikiLinkPage(pages, 'Later')?.id).toBe('b')
    expect(findWikiLinkPage([{ ...pages[1], archivedAt: 1 }], 'Later')).toBeNull()
  })
})
