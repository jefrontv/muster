import { describe, expect, it } from 'vitest'
import { extractTags } from './project-pages-tags'

describe('page tags', () => {
  it('reads tags from prose only', () => {
    const md = [
      '# Heading',
      'Kickoff for #client/acme and #Launch-2026, also #launch-2026 again.',
      'Issue #123, a [link](https://x.y/#anchor), mail a#b, `#code`',
      '```',
      '#fenced',
      '```',
      '- [ ] #todo item'
    ].join('\n')
    expect(extractTags(md)).toEqual([
      { key: 'client/acme', label: 'client/acme' },
      { key: 'launch-2026', label: 'Launch-2026' },
      { key: 'todo', label: 'todo' }
    ])
  })
})
