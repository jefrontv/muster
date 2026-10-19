import { describe, expect, it } from 'vitest'
import { markdownBlocks, type ChatMarkdownBlocks } from './chat-markdown-blocks'

const TEXT = [
  '# Changes',
  '',
  'I updated the header.',
  '',
  '- one',
  '- two',
  '',
  '```css',
  'body { height: 100dvh; }',
  '```',
  '',
  'Done.'
].join('\n')

describe('markdownBlocks', () => {
  it('covers the text with contiguous blocks keyed by offset', () => {
    const { blocks } = markdownBlocks(TEXT, false, null)
    expect(blocks.map((block) => block.raw).join('')).toBe(TEXT)
    blocks.forEach((block, index) => {
      const next = blocks[index + 1]
      if (next) {
        expect(next.key).toBe(block.key + block.raw.length)
      }
    })
    expect(blocks).toHaveLength(5)
  })

  it('keeps settled blocks as the same objects while the tail streams', () => {
    let state: ChatMarkdownBlocks | null = null
    const frozenSeen = new Map<number, object>()
    for (let end = 1; end <= TEXT.length; end += 1) {
      state = markdownBlocks(TEXT.slice(0, end), true, state)
      for (const block of state.blocks.slice(0, -2)) {
        const seen = frozenSeen.get(block.key)
        if (seen) {
          expect(block).toBe(seen)
        }
        frozenSeen.set(block.key, block)
      }
    }
    expect(state!.blocks.map((block) => block.raw).join('')).toBe(TEXT)
  })

  it('settles to the same blocks a full parse gives', () => {
    let state: ChatMarkdownBlocks | null = null
    for (let end = 1; end <= TEXT.length; end += 7) {
      state = markdownBlocks(TEXT.slice(0, end), true, state)
    }
    const settled = markdownBlocks(TEXT, false, state)
    expect(settled.blocks).toEqual(markdownBlocks(TEXT, false, null).blocks)
  })

  it('starts over when the text is replaced rather than extended', () => {
    const first = markdownBlocks('Hello\n\nworld', true, null)
    const next = markdownBlocks('Bye', true, first)
    expect(next.blocks).toEqual([{ key: 0, raw: 'Bye' }])
  })
})
