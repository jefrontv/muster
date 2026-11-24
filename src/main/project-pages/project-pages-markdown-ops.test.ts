import { describe, expect, it } from 'vitest'
import {
  appendMarkdown,
  matchSnippet,
  readSection,
  replaceAnchor
} from './project-pages-markdown-ops'

const DOC = ['# Plan', '', '## Goals', '', '- ship', '', '## Risks', '', '- none', ''].join('\n')

describe('project pages markdown ops', () => {
  it('appends under a heading before the next heading of the same level', () => {
    const next = appendMarkdown(DOC, '- docs', 'goals')
    expect(next).toContain('- ship\n\n- docs\n\n## Risks')
    expect(appendMarkdown('', 'hello')).toBe('hello\n')
    expect(appendMarkdown(DOC, 'end')).toMatch(/- none\n\nend\n$/)
  })

  it('ignores headings inside code fences', () => {
    const doc = ['## Goals', '```', '## not a heading', '```', '## Risks'].join('\n')
    expect(readSection(doc, 'Goals')).toBe(
      ['## Goals', '```', '## not a heading', '```'].join('\n')
    )
    expect(() => readSection(doc, 'not a heading')).toThrow(/No heading/)
  })

  it('replaces exactly one anchor and refuses missing or repeated ones', () => {
    expect(replaceAnchor(DOC, '- ship', '- ship it')).toContain('- ship it')
    expect(() => replaceAnchor(DOC, '- nope', 'x')).toThrow(/not in the page/)
    expect(() => replaceAnchor('a a', 'a', 'b')).toThrow(/more than once/)
  })

  it('cuts a snippet around the first match', () => {
    expect(matchSnippet('Hello Launch World', 'launch', 3)).toBe('…lo Launch Wo…')
    expect(matchSnippet('abc', 'z')).toBeNull()
  })
})
