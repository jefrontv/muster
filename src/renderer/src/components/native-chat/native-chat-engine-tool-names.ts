// Codex and Grok name their tools differently from Claude. The chat-thread tool
// registry speaks Claude's names, so calls whose input fits are renamed and
// reshaped here; anything that doesn't fit keeps its own name and the generic card.

import type { NativeChatTranscriptAgent } from '../../../../shared/native-chat-agent-support'

export type NativeChatEngineToolCall = {
  name: string
  input: unknown
  /** Set when one call fans out into several rows (a multi-file patch). */
  part?: number
}

type Fields = Record<string, unknown>

function record(input: unknown): Fields | null {
  return typeof input === 'object' && input !== null && !Array.isArray(input)
    ? (input as Fields)
    : null
}

/** Codex and Grok record arguments as JSON text. */
export function parseNativeChatToolInput(input: unknown): unknown {
  if (typeof input !== 'string') {
    return input
  }
  const trimmed = input.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return input
  }
  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    return input
  }
}

function text(fields: Fields | null, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = fields?.[key]
    if (typeof value === 'string' && value !== '') {
      return value
    }
  }
  return null
}

function count(fields: Fields | null, key: string): number | undefined {
  const value = fields?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

const SHELL_WRAPPERS = new Set(['bash', 'sh', 'zsh', '/bin/bash', '/bin/sh', '/bin/zsh'])

/** `["bash","-lc","make"]` reads as `make`; other argv joins with spaces. */
function commandText(value: unknown): string | null {
  if (typeof value === 'string') {
    return value
  }
  if (!Array.isArray(value) || !value.every((part) => typeof part === 'string')) {
    return null
  }
  const argv = value as string[]
  if (argv.length === 3 && SHELL_WRAPPERS.has(argv[0]!) && /^-l?c$/.test(argv[1]!)) {
    return argv[2]!
  }
  return argv.join(' ')
}

type PatchFile = {
  op: 'add' | 'update' | 'delete'
  path: string
  chunks: { old: string[]; next: string[] }[]
}

const PATCH_HEADER = /^\*\*\* (Add|Update|Delete) File: (.+)$/

/** Codex's apply_patch envelope, one entry per file it touches. */
export function parseCodexPatch(patch: string): PatchFile[] {
  const files: PatchFile[] = []
  let file: PatchFile | null = null
  let chunk: PatchFile['chunks'][number] | null = null
  for (const line of patch.split('\n')) {
    const header = PATCH_HEADER.exec(line)
    if (header) {
      const op = header[1]!.toLowerCase() as PatchFile['op']
      file = { op, path: header[2]!.trim(), chunks: [] }
      chunk = null
      files.push(file)
      continue
    }
    if (!file || line.startsWith('*** ')) {
      continue
    }
    if (line.startsWith('@@') || !chunk) {
      chunk = { old: [], next: [] }
      file.chunks.push(chunk)
      if (line.startsWith('@@')) {
        continue
      }
    }
    const body = line.slice(1)
    if (line.startsWith('+')) {
      chunk.next.push(body)
    } else if (line.startsWith('-')) {
      chunk.old.push(body)
    } else {
      chunk.old.push(body)
      chunk.next.push(body)
    }
  }
  for (const entry of files) {
    entry.chunks = entry.chunks.filter((part) => part.old.length + part.next.length > 0)
  }
  return files
}

function patchCalls(patch: string, original: NativeChatEngineToolCall): NativeChatEngineToolCall[] {
  const files = parseCodexPatch(patch)
  if (files.length === 0) {
    return [original]
  }
  return files.map((file, part): NativeChatEngineToolCall => {
    const at = files.length > 1 ? { part } : {}
    if (file.op === 'add') {
      const content = file.chunks.flatMap((chunk) => chunk.next).join('\n')
      return { name: 'Write', input: { file_path: file.path, content }, ...at }
    }
    if (file.op === 'delete' || file.chunks.length === 0) {
      return { name: original.name, input: { path: file.path, operation: file.op }, ...at }
    }
    const edits = file.chunks.map((chunk) => ({
      old_string: chunk.old.join('\n'),
      new_string: chunk.next.join('\n')
    }))
    return edits.length === 1
      ? { name: 'Edit', input: { file_path: file.path, ...edits[0] }, ...at }
      : { name: 'MultiEdit', input: { file_path: file.path, edits }, ...at }
  })
}

function bash(command: string | null, original: NativeChatEngineToolCall) {
  return command ? [{ name: 'Bash', input: { command } }] : [original]
}

function codexCalls(call: NativeChatEngineToolCall): NativeChatEngineToolCall[] {
  const fields = record(call.input)
  switch (call.name) {
    case 'shell':
    case 'container.exec':
    case 'local_shell':
    case 'tool': {
      const argv = fields?.command ?? record(fields?.action)?.command
      // Older Codex builds ran apply_patch through the shell tool.
      if (Array.isArray(argv) && argv[0] === 'apply_patch' && typeof argv[1] === 'string') {
        return patchCalls(argv[1], { ...call, name: 'apply_patch' })
      }
      return bash(commandText(argv), call)
    }
    case 'exec_command':
    case 'shell_command':
      return bash(commandText(fields?.cmd ?? fields?.command), call)
    case 'apply_patch': {
      const patch = typeof call.input === 'string' ? call.input : text(fields, 'input', 'patch')
      return patch ? patchCalls(patch, call) : [call]
    }
    case 'update_plan': {
      const plan = Array.isArray(fields?.plan) ? fields.plan : null
      if (!plan) {
        return [call]
      }
      const todos = plan.flatMap((entry) => {
        const step = text(record(entry), 'step')
        const status = text(record(entry), 'status')
        return step ? [{ content: step, activeForm: step, status: status ?? 'pending' }] : []
      })
      return [{ name: 'TodoWrite', input: { todos } }]
    }
    case 'view_image': {
      const path = text(fields, 'path', 'file_path')
      return path ? [{ name: 'Read', input: { file_path: path } }] : [call]
    }
    default:
      return [call]
  }
}

const GROK_SHELL = new Set([
  'bash',
  'shell',
  'terminal',
  'run_terminal_command',
  'run_terminal_cmd',
  'run_shell_command',
  'run_command',
  'execute_command'
])
const GROK_READ = new Set(['read_file', 'view_file', 'view', 'read'])
const GROK_WRITE = new Set(['write_file', 'create_file', 'write_to_file', 'create', 'write'])
const GROK_EDIT = new Set([
  'search_replace',
  'str_replace',
  'str_replace_editor',
  'edit_file',
  'replace',
  'edit'
])
const GROK_TODO = new Set(['create_todo_list', 'update_todo_list', 'todo_write'])

function grokCalls(call: NativeChatEngineToolCall): NativeChatEngineToolCall[] {
  const fields = record(call.input)
  const name = call.name
  const path = text(fields, 'file_path', 'path', 'target_file', 'TargetFile', 'AbsolutePath')
  if (GROK_SHELL.has(name)) {
    return bash(commandText(fields?.command ?? fields?.cmd ?? fields?.CommandLine), call)
  }
  if (GROK_READ.has(name) && path) {
    const range = {
      ...(count(fields, 'offset') !== undefined ? { offset: count(fields, 'offset') } : {}),
      ...(count(fields, 'limit') !== undefined ? { limit: count(fields, 'limit') } : {})
    }
    return [{ name: 'Read', input: { file_path: path, ...range } }]
  }
  const content = text(fields, 'content', 'file_text', 'CodeContent')
  if (GROK_WRITE.has(name) && path && content !== null) {
    return [{ name: 'Write', input: { file_path: path, content } }]
  }
  const oldText = text(fields, 'old_string', 'old_str', 'old_text')
  const newText = fields?.new_string ?? fields?.new_str ?? fields?.new_text
  if (GROK_EDIT.has(name) && path && oldText !== null && typeof newText === 'string') {
    return [{ name: 'Edit', input: { file_path: path, old_string: oldText, new_string: newText } }]
  }
  const pattern = text(fields, 'pattern', 'query')
  if ((name === 'grep' || name === 'search_file_content' || name === 'search') && pattern) {
    return [{ name: 'Grep', input: { pattern, ...(path ? { path } : {}) } }]
  }
  if ((name === 'glob' || name === 'find_by_name') && text(fields, 'pattern', 'Pattern')) {
    return [{ name: 'Glob', input: { pattern: text(fields, 'pattern', 'Pattern') } }]
  }
  const dir = text(fields, 'path', 'DirectoryPath')
  if (name === 'list_dir' && dir) {
    return [{ name: 'LS', input: { path: dir } }]
  }
  if (name === 'web_search' && text(fields, 'query')) {
    return [{ name: 'WebSearch', input: { query: text(fields, 'query') } }]
  }
  const url = text(fields, 'url')
  if ((name === 'web_fetch' || name === 'fetch_url' || name === 'fetch_content') && url) {
    return [{ name: 'WebFetch', input: { url } }]
  }
  if (GROK_TODO.has(name) && Array.isArray(fields?.todos)) {
    return [{ name: 'TodoWrite', input: { todos: fields.todos } }]
  }
  return [call]
}

/** The call as the chat-thread registry names it; Claude's own names pass through. */
export function nativeChatEngineToolCalls(
  agent: NativeChatTranscriptAgent | null,
  name: string,
  rawInput: unknown
): NativeChatEngineToolCall[] {
  const call = { name, input: parseNativeChatToolInput(rawInput) }
  if (agent === 'codex') {
    return codexCalls(call)
  }
  if (agent === 'grok') {
    return grokCalls(call)
  }
  return [call]
}

export type NativeChatCommandOutput = { stdout: string; exitCode: number | null }

/** Codex wraps command output with its exit code; split them so the Bash card shows both. */
export function codexCommandOutput(output: string): NativeChatCommandOutput | null {
  const parsed = record(parseNativeChatToolInput(output))
  if (parsed && typeof parsed.output === 'string') {
    const exitCode = count(record(parsed.metadata), 'exit_code')
    return { stdout: parsed.output, exitCode: exitCode ?? null }
  }
  const exited =
    /^Process exited with code (-?\d+)$/m.exec(output) ?? /^Exit code: (-?\d+)$/m.exec(output)
  if (!exited) {
    return null
  }
  const body = /^Output:\n([\s\S]*)$/m.exec(output)
  return { stdout: body ? body[1]! : output, exitCode: Number(exited[1]) }
}
