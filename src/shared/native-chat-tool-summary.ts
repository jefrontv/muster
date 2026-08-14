import { isToolCallBlock, type NativeChatBlock } from './native-chat-types'

const MAX_PREVIEW_LENGTH = 80
const MAX_PREVIEW_STRING_INPUT = 160
const MAX_PREVIEW_COLLECTION_ITEMS = 8
const MAX_PREVIEW_DEPTH = 2
const MAX_TOOL_RUN_SUMMARY_PARTS = 3

/** claude.ai connector servers are prefixed `claude_ai_` — the product name is the tail. */
function parseMcpToolName(rawName: string): { server: string; tool: string } | null {
  const match = /^mcp__([^_].*?)__(.+)$/.exec(rawName.trim())
  if (!match) {
    return null
  }
  const server = match[1]!
    .replace(/^claude_ai_/i, '')
    .replace(/_+/g, ' ')
    .trim()
  return {
    server: server.charAt(0).toUpperCase() + server.slice(1),
    tool: match[2]!.replace(/_+/g, ' ').trim()
  }
}

/** Reads `mcp__server__tool` into "Server · tool words"; other names pass through. */
export function humanizeToolName(rawName: string): string {
  const mcp = parseMcpToolName(rawName)
  return mcp ? `${mcp.server} · ${mcp.tool}` : rawName
}

/** Plain-English sentence for a tool call — "Reading main.js", "Asking Activecollab to
 *  get task bundle" — so chat activity reads as actions, not API plumbing. Without
 *  `input` the sentence stays generic ("Reading a file"), which keeps it usable as a
 *  grouping key. */
export function describeToolCall(rawName: string, input?: unknown): string {
  const mcp = parseMcpToolName(rawName)
  if (mcp) {
    return `Asking ${mcp.server} to ${mcp.tool.toLowerCase()}`
  }
  const file = toolFilePath(input)
  const fileName = file ? (file.split(/[\\/]/).findLast((part) => part !== '') ?? null) : null
  switch (rawName.trim()) {
    case 'Read':
      return fileName ? `Reading ${fileName}` : 'Reading a file'
    case 'Write':
      return fileName ? `Writing ${fileName}` : 'Writing a file'
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return fileName ? `Editing ${fileName}` : 'Editing a file'
    case 'Bash':
    case 'BashOutput':
      return 'Running a command'
    case 'Grep':
    case 'Glob':
      return 'Searching the project'
    case 'WebSearch':
      return 'Searching the web'
    case 'WebFetch':
      return 'Reading a web page'
    case 'Task':
    case 'Agent':
      return 'Starting a helper agent'
    case 'TodoWrite':
      return 'Updating the plan'
    case 'Skill':
      return 'Using a skill'
    default:
      return `Using ${rawName.trim()}`
  }
}

/** The one input fragment worth showing beside the sentence — a description, command,
 *  query, or URL. Object payloads with none of those return '' so raw JSON never
 *  reaches a collapsed row; the expanded detail still shows the full input. */
export function humanToolCallPreview(input: unknown): string {
  if (typeof input === 'string') {
    return summarizeToolInput(input)
  }
  if (!input || typeof input !== 'object') {
    return ''
  }
  const value = input as Record<string, unknown>
  // Description first: agent-written plain English beats the raw command.
  const text =
    value.description ??
    value.command ??
    value.cmd ??
    value.query ??
    value.pattern ??
    value.url ??
    value.prompt
  return typeof text === 'string' ? summarizeToolInput(text) : ''
}

export function summarizeToolInput(input: unknown): string {
  const collapsed = toRawPreview(input).replace(/\s+/g, ' ').trim()
  return collapsed.length <= MAX_PREVIEW_LENGTH
    ? collapsed
    : `${collapsed.slice(0, MAX_PREVIEW_LENGTH - 1)}…`
}

/** Full, pretty-printed tool-call input for the expanded detail view. Strings
 *  pass through as-is; objects/arrays print as indented JSON so a diff-less call
 *  (e.g. a question payload) reads cleanly instead of one long minified line. */
export function formatToolInput(input: unknown): string {
  if (input === null || input === undefined) {
    return ''
  }
  if (typeof input === 'string') {
    return input
  }
  if (typeof input === 'number' || typeof input === 'boolean') {
    return String(input)
  }
  try {
    return JSON.stringify(input, null, 2) ?? ''
  } catch {
    return ''
  }
}

export function toolFilePath(input: unknown): string | null {
  if (!input || typeof input !== 'object') {
    return null
  }
  const value = input as Record<string, unknown>
  const path = value.file_path ?? value.filePath ?? value.path ?? value.notebook_path
  return typeof path === 'string' && path.length > 0 ? path : null
}

export function briefToolArg(input: unknown): string {
  if (input && typeof input === 'object') {
    const value = input as Record<string, unknown>
    const path = value.file_path ?? value.filePath ?? value.path ?? value.notebook_path
    if (typeof path === 'string' && path.length > 0) {
      const parts = path.split(/[\\/]/).filter(Boolean)
      return parts.at(-1) ?? path
    }
    const command = value.command ?? value.cmd ?? value.query ?? value.pattern
    if (typeof command === 'string') {
      return summarizeToolInput(command).slice(0, 28)
    }
  }
  return summarizeToolInput(input).slice(0, 28)
}

export function summarizeToolRun(blocks: readonly NativeChatBlock[]): string {
  const parts: string[] = []
  for (const block of blocks) {
    if (!isToolCallBlock(block)) {
      continue
    }
    const name = humanizeToolName(block.name.trim())
    if (!name) {
      continue
    }
    const detail = briefToolArg(block.input)
    parts.push(detail ? `${name} ${detail}` : name)
    if (parts.length >= MAX_TOOL_RUN_SUMMARY_PARTS) {
      break
    }
  }
  return parts.join('  ·  ')
}

export function countToolCalls(blocks: readonly NativeChatBlock[]): number {
  return blocks.filter(isToolCallBlock).length
}

/** Distinct call sentences in call order with per-name counts — the collapsed
 *  run row reads "Reading a file ×3 · Searching the web ×2" instead of raw arg spam. */
export function toolRunNameCounts(
  blocks: readonly NativeChatBlock[]
): { name: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const block of blocks) {
    if (!isToolCallBlock(block)) {
      continue
    }
    const name = describeToolCall(block.name)
    if (!name) {
      continue
    }
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return [...counts.entries()].map(([name, count]) => ({ name, count }))
}

function toRawPreview(input: unknown): string {
  if (input === null || input === undefined) {
    return ''
  }
  if (typeof input === 'string') {
    return input
  }
  if (typeof input !== 'object') {
    return String(input)
  }
  try {
    return JSON.stringify(boundedPreviewValue(input, 0, new WeakSet<object>())) ?? ''
  } catch {
    return ''
  }
}

function boundedPreviewValue(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') {
    return value.length > MAX_PREVIEW_STRING_INPUT
      ? `${value.slice(0, MAX_PREVIEW_STRING_INPUT)}…`
      : value
  }
  if (!value || typeof value !== 'object') {
    return value
  }
  if (seen.has(value)) {
    return '[circular]'
  }
  if (depth >= MAX_PREVIEW_DEPTH) {
    return '[…]'
  }
  seen.add(value)
  if (Array.isArray(value)) {
    const result = value
      .slice(0, MAX_PREVIEW_COLLECTION_ITEMS)
      .map((item) => boundedPreviewValue(item, depth + 1, seen))
    if (value.length > MAX_PREVIEW_COLLECTION_ITEMS) {
      result.push('…')
    }
    return result
  }
  const result: Record<string, unknown> = {}
  let count = 0
  for (const key in value) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      continue
    }
    if (count >= MAX_PREVIEW_COLLECTION_ITEMS) {
      result['…'] = '…'
      break
    }
    result[key] = boundedPreviewValue((value as Record<string, unknown>)[key], depth + 1, seen)
    count += 1
  }
  return result
}
