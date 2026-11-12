import { describe, expect, it } from 'vitest'
import { spaceParagraphsForActiveCollab } from './activecollab-paragraph-spacing'

describe('spaceParagraphsForActiveCollab', () => {
  it('puts a blank paragraph between paragraphs, as ActiveCollab draws them', () => {
    expect(
      spaceParagraphsForActiveCollab('<p>Hey :)</p><p>Fixed.</p><p><a href="x">x</a></p>')
    ).toBe('<p>Hey :)</p><p>&nbsp;</p><p>Fixed.</p><p>&nbsp;</p><p><a href="x">x</a></p>')
  })

  it('spaces lists from the paragraphs around them', () => {
    expect(spaceParagraphsForActiveCollab('<p>Changes:</p><ul><li>a</li></ul><p>Thanks</p>')).toBe(
      '<p>Changes:</p><p>&nbsp;</p><ul><li>a</li></ul><p>&nbsp;</p><p>Thanks</p>'
    )
  })

  it('leaves spacing a person already added, and single-paragraph comments', () => {
    const edited = '<p>Hey</p><p>&nbsp;</p><p><br>Fixed.</p><p><br></p><p>Bye</p>'
    expect(spaceParagraphsForActiveCollab(edited)).toBe(edited)
    expect(spaceParagraphsForActiveCollab('<p>Just one</p>')).toBe('<p>Just one</p>')
  })
})
