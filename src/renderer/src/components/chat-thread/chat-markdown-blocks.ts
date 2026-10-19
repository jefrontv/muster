// Top-level markdown blocks keyed by source offset. While text streams, every
// block but the last two is frozen and only the tail is lexed again, so a token
// re-renders one block instead of the whole message.

import { lexer } from 'marked'

export type ChatMarkdownBlock = { key: number; raw: string }

export type ChatMarkdownBlocks = { text: string; blocks: ChatMarkdownBlock[] }

/** A new token can still reshape this many trailing blocks (a list gaining an item, a closing fence). */
const UNSTABLE_TAIL_BLOCKS = 2

function lexBlocks(text: string, offset: number): ChatMarkdownBlock[] {
  const blocks: ChatMarkdownBlock[] = []
  let at = offset
  for (const token of lexer(text)) {
    const last = blocks.at(-1)
    // Blank lines belong to the block before them, so offsets stay contiguous.
    if (token.type === 'space' && last) {
      last.raw += token.raw
    } else {
      blocks.push({ key: at, raw: token.raw })
    }
    at += token.raw.length
  }
  return blocks
}

export function markdownBlocks(
  text: string,
  streaming: boolean,
  prev: ChatMarkdownBlocks | null
): ChatMarkdownBlocks {
  if (prev?.text === text) {
    return prev
  }
  const frozen =
    streaming && prev && text.startsWith(prev.text)
      ? prev.blocks.slice(0, Math.max(0, prev.blocks.length - UNSTABLE_TAIL_BLOCKS))
      : []
  const last = frozen.at(-1)
  const frozenEnd = last ? last.key + last.raw.length : 0
  return { text, blocks: [...frozen, ...lexBlocks(text.slice(frozenEnd), frozenEnd)] }
}
