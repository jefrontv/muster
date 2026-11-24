import { describe, expect, it } from 'vitest'
import { mergeMarkdownBlocks, splitMarkdownBlocks } from './project-pages-block-merge'

const BASE = '# Plan\n\nIntro.\n\n- one\n- two\n\nOutro.\n'

describe('mergeMarkdownBlocks', () => {
  it('keeps a user edit and an agent append to different blocks', () => {
    const ours = BASE.replace('Intro.', 'Intro, edited.')
    const theirs = `${BASE}\nAgent note.\n`
    const result = mergeMarkdownBlocks(BASE, ours, theirs)
    expect(result).toEqual({
      ok: true,
      markdown: '# Plan\n\nIntro, edited.\n\n- one\n- two\n\nOutro.\n\nAgent note.\n'
    })
  })

  it('keeps an agent append right after a block the user edited', () => {
    const base = 'Intro.\n\nBody.'
    const result = mergeMarkdownBlocks(
      base,
      'Intro.\n\nBody. Typed.',
      'Intro.\n\nBody.\n\nAgent line.\n'
    )
    expect(result).toEqual({ ok: true, markdown: 'Intro.\n\nBody. Typed.\n\nAgent line.\n' })
  })

  it('refuses when both sides changed the same block differently', () => {
    const ours = BASE.replace('Outro.', 'Mine.')
    const theirs = BASE.replace('Outro.', 'Theirs.')
    expect(mergeMarkdownBlocks(BASE, ours, theirs)).toEqual({ ok: false })
  })

  it('treats trailing whitespace and blank-line runs as formatting only', () => {
    const ours = BASE.replace('Intro.', 'Intro.   ').replace('\n\n- one', '\n\n\n\n- one')
    const theirs = BASE.replace('Outro.', 'Outro, by agent.')
    const result = mergeMarkdownBlocks(BASE, ours, theirs)
    expect(result.ok && result.markdown).toContain('Outro, by agent.')
  })

  it('keeps fenced code with blank lines as one block', () => {
    expect(splitMarkdownBlocks('```\na\n\nb\n```\n\nafter')).toEqual(['```\na\n\nb\n```', 'after'])
  })

  it('returns the other side when one side is unchanged', () => {
    expect(mergeMarkdownBlocks(BASE, BASE, 'x')).toEqual({ ok: true, markdown: 'x' })
    expect(mergeMarkdownBlocks(BASE, 'y', BASE)).toEqual({ ok: true, markdown: 'y' })
  })
})
