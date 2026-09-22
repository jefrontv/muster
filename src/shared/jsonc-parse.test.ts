import { describe, expect, it } from 'vitest'
import { parseJsonc, stripJsonc } from './jsonc-parse'

describe('stripJsonc', () => {
  it('leaves plain JSON untouched', () => {
    expect(stripJsonc('{"a":1}')).toBe('{"a":1}')
  })

  it('removes a line comment', () => {
    expect(parseJsonc('{\n  // the name\n  "a": 1\n}')).toEqual({ a: 1 })
  })

  it('removes a trailing line comment', () => {
    expect(parseJsonc('{"a": 1 // why\n}')).toEqual({ a: 1 })
  })

  it('removes a block comment', () => {
    expect(parseJsonc('{/* header */ "a": 1}')).toEqual({ a: 1 })
  })

  it('removes a multi-line block comment', () => {
    expect(parseJsonc('{\n/*\n a note\n*/\n"a": 1}')).toEqual({ a: 1 })
  })

  it('keeps a double slash inside a string', () => {
    // The reason this is not a regex. A theme file's homepage value looks exactly like a comment.
    expect(parseJsonc('{"url": "https://example.com/x"}')).toEqual({
      url: 'https://example.com/x'
    })
  })

  it('keeps a block comment opener inside a string', () => {
    expect(parseJsonc('{"glob": "/*.ts"}')).toEqual({ glob: '/*.ts' })
  })

  it('does not end a string on an escaped quote', () => {
    expect(parseJsonc('{"q": "say \\" then // not a comment"}')).toEqual({
      q: 'say " then // not a comment'
    })
  })

  it('handles an escaped backslash before the closing quote', () => {
    expect(parseJsonc('{"p": "C:\\\\path\\\\", "b": 2}')).toEqual({ p: 'C:\\path\\', b: 2 })
  })

  it('drops a trailing comma in an object', () => {
    expect(parseJsonc('{"a": 1,}')).toEqual({ a: 1 })
  })

  it('drops a trailing comma in an array', () => {
    expect(parseJsonc('{"a": [1, 2,]}')).toEqual({ a: [1, 2] })
  })

  it('drops a trailing comma separated from the closer by a comment', () => {
    expect(parseJsonc('{"a": [1, 2, /* done */]}')).toEqual({ a: [1, 2] })
  })

  it('drops a trailing comma separated from the closer by a line comment', () => {
    expect(parseJsonc('{"a": 1, // last\n}')).toEqual({ a: 1 })
  })

  it('keeps a comma that is not trailing', () => {
    expect(parseJsonc('{"a": 1, "b": 2}')).toEqual({ a: 1, b: 2 })
  })

  it('keeps a comma inside a string', () => {
    expect(parseJsonc('{"a": "x,}"}')).toEqual({ a: 'x,}' })
  })
})

describe('parseJsonc', () => {
  it('answers null for input that is broken beyond comments and commas', () => {
    expect(parseJsonc('{"a": }')).toBeNull()
  })

  it('answers null for empty input rather than throwing', () => {
    expect(parseJsonc('')).toBeNull()
  })

  it('reads a theme-shaped document', () => {
    const text = `{
      // Bluloco Light
      "name": "Bluloco Light",
      "type": "light",
      "colors": {
        "editor.background": "#f9f9f9", // page
      },
      "tokenColors": [
        { "scope": ["entity.name.namespace"], "settings": { "foreground": "#ee5672" } },
      ],
    }`
    expect(parseJsonc(text)).toEqual({
      name: 'Bluloco Light',
      type: 'light',
      colors: { 'editor.background': '#f9f9f9' },
      tokenColors: [
        { scope: ['entity.name.namespace'], settings: { foreground: '#ee5672' } }
      ]
    })
  })
})
