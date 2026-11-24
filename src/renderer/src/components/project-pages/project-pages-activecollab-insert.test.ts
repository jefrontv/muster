// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { descriptionParagraphs } from './project-pages-activecollab-insert'

describe('descriptionParagraphs', () => {
  it('splits blocks and line breaks into plain paragraphs', () => {
    expect(
      descriptionParagraphs(
        '<p>Hi <b>there</b></p><p>Line one<br>line two</p><ul><li>A</li><li>B</li></ul>'
      )
    ).toEqual(['Hi there', 'Line one line two', '• A', '• B'])
  })

  it('returns nothing for an empty description', () => {
    expect(descriptionParagraphs('')).toEqual([])
    expect(descriptionParagraphs('<p> </p>')).toEqual([])
  })

  it('cuts very long descriptions', () => {
    const out = descriptionParagraphs(`<p>${'a'.repeat(1500)}</p><p>${'b'.repeat(1500)}</p>`)
    expect(out).toHaveLength(2)
    expect(out[1].endsWith('…')).toBe(true)
    expect(out.join('').length).toBeLessThanOrEqual(2001)
  })
})
