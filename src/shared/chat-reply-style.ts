// Ported from the muster-bots fork (shared/reply-style.ts, server/system-prompt.ts), Apache-2.0.
// A workspace's reply style: Default, or Conversational (short replies sent as a few parts).

export type ChatReplyStyle = 'default' | 'conversational'

export function normalizeChatReplyStyle(raw: unknown): ChatReplyStyle {
  return raw === 'conversational' ? 'conversational' : 'default'
}

export const CHAT_CONVERSATIONAL_STYLE_PROMPT =
  "Reply style: conversational. Talk like a person in a chat. Keep replies short unless the person asks for detail. Use plain text with no headings, bullet lists, tables or bold unless the person asks for them or the content truly needs them; code always goes in a fenced code block. Send each distinct point as its own short message, separated by a blank line, in the order you find things. When it helps, end with one brief follow-up question. Match the person's language and roughly the length of their message."

const FENCE = /^ {0,3}(`{3,}|~{3,})/
const LIST_OR_TABLE = /^ {0,3}([-*+]\s|\d{1,3}[.)]\s|\|)/

/** Splits on blank lines but never inside a code fence, and keeps a loose list or table together.
 *  An unclosed fence keeps the rest in the last part, so finished parts never change. */
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
    const open = FENCE.exec(line)
    if (fence) {
      current.push(line)
      if (
        open &&
        open[1][0] === fence[0] &&
        open[1].length >= fence.length &&
        line.trim() === open[1]
      ) {
        fence = null
      }
      continue
    }
    if (open) {
      fence = open[1]
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
