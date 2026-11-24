import { describe, expect, it } from 'vitest'
import { anchorAt, locateAnchor } from './project-pages-comment-anchor'

describe('page comment anchors', () => {
  it('keeps the quote with up to 32 characters either side', () => {
    const text = `${'a'.repeat(40)}QUOTE${'b'.repeat(40)}`
    const anchor = anchorAt(text, 40, 45)
    expect(anchor.quote).toBe('QUOTE')
    expect(anchor.prefix).toBe('a'.repeat(32))
    expect(anchor.suffix).toBe('b'.repeat(32))
  })

  it('finds the quote again after the page is rewritten around it', () => {
    const before = 'Intro.\nStep one: deploy.\nStep two: deploy.\n'
    const start = before.lastIndexOf('deploy')
    const anchor = anchorAt(before, start, start + 'deploy'.length)
    const after = 'New intro line.\n\nStep one: deploy.\nStep two: deploy.\nOutro.'
    const found = locateAnchor(after, anchor)
    expect(found).not.toBeNull()
    expect(after.slice(0, found!.start)).toContain('Step two: ')
  })

  it('returns null when the quote is gone', () => {
    const anchor = { quote: 'vanished', prefix: '', suffix: '' }
    expect(locateAnchor('nothing here', anchor)).toBeNull()
  })
})
