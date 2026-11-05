import { describe, expect, it } from 'vitest'
import { markdownPreviewText } from './markdown-preview-text'

describe('markdownPreviewText', () => {
  it('drops emphasis, code and link syntax', () => {
    expect(markdownPreviewText('**AIDC structure summary**')).toBe('AIDC structure summary')
    expect(markdownPreviewText("Pepper's _guesses_: `npm test` and [docs](https://x.y)")).toBe(
      "Pepper's guesses: npm test and docs"
    )
  })

  it('flattens headings, quotes and lists onto one line', () => {
    expect(markdownPreviewText('## Plan\n> note\n- one\n2. two')).toBe('Plan note one two')
  })

  it('leaves snake_case, globs and lone asterisks alone', () => {
    expect(markdownPreviewText('rename my_var_name in *.ts files')).toBe(
      'rename my_var_name in *.ts files'
    )
    expect(markdownPreviewText('2 * 3 = 6')).toBe('2 * 3 = 6')
  })
})
