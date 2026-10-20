// One process row per tool call: a verb, the object it acted on, and short
// trailing facts. Every claim of work names its object.

import { bashModel, type ChatBashExit } from './chat-bash-model'
import {
  displayPath,
  inputList,
  inputRecord,
  inputText,
  type ChatToolItem
} from './chat-tool-input'

export type ChatToolIconKey =
  | 'file'
  | 'pen'
  | 'plus'
  | 'terminal'
  | 'search'
  | 'globe'
  | 'plug'
  | 'question'
  | 'plan'
  | 'list'
  | 'sparkles'
  | 'tool'

export type ChatToolRow = {
  icon: ChatToolIconKey
  verb: string
  object: string
  /** Sans rather than mono: the object is prose (a question, a description). */
  plainObject: boolean
  meta: string[]
  additions?: number
  deletions?: number
  exit?: ChatBashExit
  isError: boolean
  /** A failed call's first error line; replaces the object in the collapsed row. */
  errorSummary?: string
}

function firstLine(text: string): string {
  const line = text.split('\n').find((entry) => entry.trim() !== '') ?? ''
  return line.length > 160 ? `${line.slice(0, 157)}…` : line
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** Whole seconds only; tenths read as noise next to a ticking timer. */
export function formatElapsed(seconds: number): string {
  const total = Math.round(seconds)
  if (total < 60) {
    return `${total}s`
  }
  return `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, '0')}s`
}

/** MCP tool names are mcp__<server>__<tool>; plugin servers carry a plugin_ prefix. */
export function mcpToolParts(name: string): { server: string; tool: string } | null {
  const match = /^mcp__(.+?)__(.+)$/.exec(name)
  if (!match?.[1] || !match[2]) {
    return null
  }
  const server = match[1].replace(/^plugin_[^_]+_/, '').replace(/^claude_ai_/, '')
  return { server, tool: match[2].replace(/_/g, ' ') }
}

function inputSummary(input: unknown): string {
  const text = Object.entries(inputRecord(input))
    .filter(([, value]) => typeof value === 'string' || typeof value === 'number')
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(', ')
  return text.length > 120 ? `${text.slice(0, 117)}…` : text
}

const plural = (count: number, one: string): string => `${count} ${one}${count === 1 ? '' : 's'}`

/** "Found 3 files" and friends, once a search tool answered. */
function resultCount(item: ChatToolItem, one: string): string[] {
  if (item.status !== 'done' || !item.result) {
    return []
  }
  const found = /^Found (\d+) /.exec(item.result.text)
  if (found) {
    return [plural(Number(found[1]), one)]
  }
  if (/^No (files|matches) found/.test(item.result.text)) {
    return [`no ${one}s`]
  }
  return []
}

function readRange(input: unknown): string[] {
  const offset = Number(inputText(input, 'offset') ?? '')
  const limit = Number(inputText(input, 'limit') ?? '')
  if (offset > 0 && limit > 0) {
    return [`lines ${offset}–${offset + limit - 1}`]
  }
  return limit > 0 ? [`lines 1–${limit}`] : []
}

function questionTitle(input: unknown): string {
  const first = inputRecord(inputList(input, 'questions')[0])
  return typeof first.question === 'string' ? first.question : 'a question'
}

const asking = (item: ChatToolItem, now: string, past: string): string =>
  item.status === 'awaiting-approval' || item.status === 'streaming' ? now : past

export function toolRowModel(item: ChatToolItem, cwd: string | null): ChatToolRow {
  const row = rowFor(item, cwd)
  // Bash failures already say how they ended through the exit badge.
  const failure =
    item.status === 'error' && item.name !== 'Bash' ? firstLine(item.result?.text ?? '') : ''
  return failure ? { ...row, errorSummary: failure } : row
}

function rowFor(item: ChatToolItem, cwd: string | null): ChatToolRow {
  const input = item.input
  const path =
    inputText(input, 'file_path') ?? inputText(input, 'notebook_path') ?? inputText(input, 'path')
  const shownPath = path ? displayPath(path, cwd) : ''
  const elapsed = item.elapsedSeconds ? [formatElapsed(item.elapsedSeconds)] : []
  const base = { plainObject: false, meta: [] as string[], isError: item.status === 'error' }
  const counts = {
    ...(item.result?.additions !== undefined ? { additions: item.result.additions } : {}),
    ...(item.result?.deletions ? { deletions: item.result.deletions } : {})
  }
  switch (item.name) {
    case 'Read':
      return { ...base, icon: 'file', verb: 'Read', object: shownPath, meta: readRange(input) }
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return {
        ...base,
        icon: 'pen',
        verb: asking(item, 'Edit', 'Edited'),
        object: shownPath,
        ...counts
      }
    case 'Write':
      return {
        ...base,
        icon: 'plus',
        verb: asking(item, 'Write', 'Wrote'),
        object: shownPath,
        ...counts
      }
    case 'Bash': {
      const bash = bashModel(item)
      return {
        ...base,
        icon: 'terminal',
        verb: asking(item, 'Run', bash.background ? 'Started' : 'Ran'),
        object: firstLine(bash.command) || (bash.description ?? ''),
        meta: [...(bash.background ? ['in background'] : []), ...elapsed],
        ...(bash.exit ? { exit: bash.exit } : {}),
        isError: bash.isError
      }
    }
    case 'Grep': {
      const glob = inputText(input, 'glob')
      const where = path ? ` in ${shownPath}` : glob ? ` in ${glob}` : ''
      const object = `"${inputText(input, 'pattern') ?? ''}"${where}`
      return { ...base, icon: 'search', verb: 'Searched', object, meta: resultCount(item, 'file') }
    }
    case 'Glob':
      return {
        ...base,
        icon: 'search',
        verb: 'Listed',
        object: inputText(input, 'pattern') ?? '',
        meta: resultCount(item, 'file')
      }
    case 'LS':
      return { ...base, icon: 'search', verb: 'Listed', object: shownPath }
    case 'WebFetch':
      return {
        ...base,
        icon: 'globe',
        verb: 'Fetched',
        object: domainOf(inputText(input, 'url') ?? ''),
        meta: elapsed
      }
    case 'WebSearch':
      return {
        ...base,
        icon: 'globe',
        verb: 'Searched the web',
        object: inputText(input, 'query') ?? '',
        plainObject: true
      }
    case 'TodoWrite':
      return { ...base, icon: 'list', verb: 'Updated the plan', object: '' }
    case 'AskUserQuestion':
      return {
        ...base,
        icon: 'question',
        verb: 'Asked',
        object: questionTitle(input),
        plainObject: true
      }
    case 'ExitPlanMode':
      return { ...base, icon: 'plan', verb: 'Proposed a plan', object: '' }
    case 'Skill':
      return {
        ...base,
        icon: 'sparkles',
        verb: 'Used skill',
        object: inputText(input, 'skill') ?? inputText(input, 'name') ?? ''
      }
    default: {
      const mcp = mcpToolParts(item.name)
      if (mcp) {
        return {
          ...base,
          icon: 'plug',
          verb: `${mcp.server}:`,
          object: mcp.tool,
          plainObject: true,
          meta: elapsed
        }
      }
      return { ...base, icon: 'tool', verb: item.name, object: inputSummary(input), meta: elapsed }
    }
  }
}
