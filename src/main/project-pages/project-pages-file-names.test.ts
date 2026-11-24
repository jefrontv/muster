import { describe, expect, it } from 'vitest'
import {
  linkPath,
  rewriteMarkdownLinks,
  safeFileName,
  titleFromImportName,
  uniqueName
} from './project-pages-file-names'

describe('page file names', () => {
  it('makes titles safe on every platform', () => {
    expect(safeFileName('Plan: Q3/Q4?')).toBe('Plan- Q3-Q4-')
    expect(safeFileName('  notes.  ')).toBe('notes')
    expect(safeFileName('CON')).toBe('CON_')
    expect(safeFileName('')).toBe('Untitled')
  })

  it('numbers clashing sibling names regardless of case', () => {
    const taken = new Set<string>()
    expect(['Notes', 'notes', 'Notes'].map((n) => uniqueName(n, taken))).toEqual([
      'Notes',
      'notes (2)',
      'Notes (3)'
    ])
  })

  it('drops the id Notion adds to exported names', () => {
    expect(titleFromImportName('Roadmap 0123456789abcdef0123456789abcdef.md')).toBe('Roadmap')
    expect(titleFromImportName('Plain.md')).toBe('Plain')
  })

  it('rewrites link targets and leaves others alone', () => {
    const out = rewriteMarkdownLinks(
      '[a](one.md) [b](<two words.md> "t") [c](https://x.y)',
      (href) => (href.endsWith('.md') ? `muster-page://${href.length}` : null)
    )
    expect(out).toBe('[a](muster-page://6) [b](muster-page://12 "t") [c](https://x.y)')
    expect(linkPath('Q3 plan/Launch (2).md')).toBe('Q3%20plan/Launch%20(2).md')
  })
})
