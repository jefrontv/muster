import { describe, expect, it } from 'vitest'
import { maskMarkdownCode } from './project-pages-markdown-code-mask'

const kept = (markdown: string): string => maskMarkdownCode(markdown).replace(/\s+/g, ' ').trim()

describe('maskMarkdownCode', () => {
  it('blanks inline code, fences and escapes but keeps length and prose', () => {
    const markdown = 'a `[[x]]` b ``c ` d`` \\[[y]]\n```ts\n[[z]]\n```\ne'
    expect(maskMarkdownCode(markdown)).toHaveLength(markdown.length)
    expect(kept(markdown)).toBe('a b [y]] e')
  })

  it('treats an unclosed fence as code to the end and a lone backtick as text', () => {
    expect(kept('a ` b\n~~~~\n[[x]]\n~~~\n[[y]]')).toBe('a ` b')
  })
})
