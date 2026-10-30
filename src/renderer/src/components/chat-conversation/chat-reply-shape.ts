// Ported from the muster-bots fork (src/lib/formatted-reply.ts, shared/reply-style.ts), Apache-2.0.
// How a reply reads: a chat line in a card, a document as prose, a document with a table wider.

const TABLE_DIVIDER = /^ {0,3}\|? *:?-{3,}:? *\|/m
const BLOCK_MARKDOWN = [
  /^ {0,3}(?:[-*+]|\d{1,3}[.)]) \S/m,
  /^ {0,3}#{1,6} \S/m,
  /^ {0,3}(?:```|~~~)/m,
  /^ {0,3}> ?\S/m,
  TABLE_DIVIDER
]

/** line = a card, prose = bare at the prose width, table = bare at the card width. */
export type ChatReplyShape = 'line' | 'prose' | 'table'

/** A reply with block markdown (a list, heading, code, quote or table) reads as a document. */
export function isFormattedReply(text: string): boolean {
  return BLOCK_MARKDOWN.some((pattern) => pattern.test(text))
}

export function chatReplyShape(text: string): ChatReplyShape {
  if (!isFormattedReply(text)) {
    return 'line'
  }
  return TABLE_DIVIDER.test(text) ? 'table' : 'prose'
}

export type ChatReplyBlock = { kind: 'prose' | 'table'; text: string }

const PIPE_ROW = /^ {0,3}\|/
const DELIMITER_ROW = /^ {0,3}\|?(?: *:?-+:? *\|)+(?: *:?-+:? *)?$/
const FENCE = /^ {0,3}(```|~~~)/

/** Splits prose from its tables; a table opens on a pipe row followed by a delimiter row, outside any fence. */
export function splitReplyBlocks(text: string): ChatReplyBlock[] {
  const lines = text.split(/\r?\n/)
  const blocks: ChatReplyBlock[] = []
  const push = (kind: ChatReplyBlock['kind'], chunk: string[]): void => {
    const body = chunk.join('\n').replace(/^\n+|\n+$/g, '')
    if (!body.trim()) {
      return
    }
    const last = blocks.at(-1)
    if (kind === 'prose' && last?.kind === 'prose') {
      last.text = `${last.text}\n\n${body}`
    } else {
      blocks.push({ kind, text: body })
    }
  }
  let prose: string[] = []
  let fence: string | null = null
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!
    const marker = FENCE.exec(line)?.[1]
    if (marker && (!fence || marker === fence)) {
      fence = fence ? null : marker
    }
    if (fence || marker || !PIPE_ROW.test(line) || !DELIMITER_ROW.test(lines[index + 1] ?? '')) {
      prose.push(line)
      continue
    }
    let end = index + 2
    while (end < lines.length && PIPE_ROW.test(lines[end]!)) {
      end++
    }
    push('prose', prose)
    prose = []
    push('table', lines.slice(index, end))
    index = end - 1
  }
  push('prose', prose)
  return blocks.length ? blocks : [{ kind: 'prose', text }]
}

const OPEN_FENCE = /^ {0,3}(`{3,}|~{3,})/
const LIST_OR_TABLE = /^ {0,3}([-*+]\s|\d{1,3}[.)]\s|\|)/

/** Conversational replies split on blank lines, never inside a fence; a loose list or table stays whole.
 *  An unclosed fence keeps the rest in the last part, so finished parts never change while streaming. */
export function splitConversationalReply(text: string): string[] {
  const parts: string[] = []
  let current: string[] = []
  let fence: string | null = null
  const flush = (): void => {
    // Leading indentation can make a code block, so only trailing space goes.
    const block = current.join('\n').trimEnd()
    current = []
    if (!block.trim()) {
      return
    }
    const prev = parts.at(-1)
    if (
      prev !== undefined &&
      LIST_OR_TABLE.test(block) &&
      LIST_OR_TABLE.test(prev.split('\n').at(-1) ?? '')
    ) {
      parts[parts.length - 1] = `${prev}\n\n${block}`
    } else {
      parts.push(block)
    }
  }
  for (const line of text.split('\n')) {
    const open = OPEN_FENCE.exec(line)
    if (fence) {
      current.push(line)
      if (
        open &&
        open[1]![0] === fence[0] &&
        open[1]!.length >= fence.length &&
        line.trim() === open[1]
      ) {
        fence = null
      }
      continue
    }
    if (open) {
      fence = open[1]!
      current.push(line)
      continue
    }
    if (!line.trim()) {
      flush()
    } else {
      current.push(line)
    }
  }
  flush()
  return parts
}
