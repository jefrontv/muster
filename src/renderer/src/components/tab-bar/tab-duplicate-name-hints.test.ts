import { describe, expect, it } from 'vitest'
import { computeDuplicateNameHints } from './tab-duplicate-name-hints'

describe('computeDuplicateNameHints', () => {
  it('leaves unique names alone', () => {
    const hints = computeDuplicateNameHints([
      { id: 'a', label: 'index.ts', path: 'src/editor/index.ts' },
      { id: 'b', label: 'main.ts', path: 'src/main.ts' }
    ])
    expect(hints.size).toBe(0)
  })

  it('uses the nearest differing parent folder', () => {
    const hints = computeDuplicateNameHints([
      { id: 'a', label: 'index.ts', path: 'src/editor/index.ts' },
      { id: 'b', label: 'index.ts', path: 'src/terminal/index.ts' }
    ])
    expect(hints.get('a')).toBe('editor')
    expect(hints.get('b')).toBe('terminal')
  })

  it('walks up until the folders differ', () => {
    const hints = computeDuplicateNameHints([
      { id: 'a', label: 'index.ts', path: 'app/one/lib/index.ts' },
      { id: 'b', label: 'index.ts', path: 'app/two/lib/index.ts' }
    ])
    expect(hints.get('a')).toBe('one/lib')
    expect(hints.get('b')).toBe('two/lib')
  })

  it('splits Windows paths and keeps their separator', () => {
    const hints = computeDuplicateNameHints([
      { id: 'a', label: 'index.ts', path: 'C:\\repo\\one\\lib\\index.ts' },
      { id: 'b', label: 'index.ts', path: 'C:\\repo\\two\\lib\\index.ts' }
    ])
    expect(hints.get('a')).toBe('one\\lib')
  })

  it('handles absolute SSH paths and root files', () => {
    const hints = computeDuplicateNameHints([
      { id: 'a', label: 'README.md', path: '/home/dev/site/README.md' },
      { id: 'b', label: 'README.md', path: 'README.md' },
      { id: 'c', label: 'README.md', path: null }
    ])
    expect(hints.get('a')).toBe('site')
    expect(hints.has('b')).toBe(false)
    expect(hints.has('c')).toBe(false)
  })
})
