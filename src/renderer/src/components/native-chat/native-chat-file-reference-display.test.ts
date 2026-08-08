import { describe, expect, it } from 'vitest'
import {
  formatNativeChatImagePathNote,
  parseNativeChatFileReferences,
  stripNativeChatImagePathNotes
} from './native-chat-file-reference-display'

describe('parseNativeChatFileReferences', () => {
  it('lifts a quoted reference out of the prompt text', () => {
    const parsed = parseNativeChatFileReferences(
      'summarize\n@"/Users/me/Downloads/Fabbrica GEO Audit.pdf"'
    )
    expect(parsed.files).toEqual(['/Users/me/Downloads/Fabbrica GEO Audit.pdf'])
    expect(parsed.text).toBe('summarize')
  })

  it('lifts bare and home-relative references', () => {
    const parsed = parseNativeChatFileReferences('check @/tmp/report.csv and @~/notes/todo.md')
    expect(parsed.files).toEqual(['/tmp/report.csv', '~/notes/todo.md'])
    expect(parsed.text).toBe('check and')
  })

  it('unescapes quotes inside quoted paths', () => {
    const parsed = parseNativeChatFileReferences('@"/tmp/say \\"hi\\".txt"')
    expect(parsed.files).toEqual(['/tmp/say "hi".txt'])
  })

  it('ignores emails and untouched text passes through by reference', () => {
    const text = 'mail jake@efront.com.au about it'
    const parsed = parseNativeChatFileReferences(text)
    expect(parsed.files).toEqual([])
    expect(parsed.text).toBe(text)
  })
})

describe('image path notes', () => {
  it('round-trips: formatted note lines strip cleanly from display text', () => {
    const sent = `look at this\n${formatNativeChatImagePathNote('/tmp/shot 1.png')}`
    expect(stripNativeChatImagePathNotes(sent)).toBe('look at this')
  })

  it('leaves ordinary text alone', () => {
    expect(stripNativeChatImagePathNotes('no notes here')).toBe('no notes here')
  })

  it('strips several notes and collapses the leftover gap', () => {
    const sent = `a\n\n${formatNativeChatImagePathNote('/a.png')}\n${formatNativeChatImagePathNote('/b.png')}\n\nb`
    expect(stripNativeChatImagePathNotes(sent)).toBe('a\n\nb')
  })
})
