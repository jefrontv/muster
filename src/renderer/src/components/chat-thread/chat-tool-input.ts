// Field readers for tool inputs, which arrive as unknown JSON (and may be
// half-written while the call streams).

import type { ChatEngineItem } from '../../../../shared/chat-engine-types'

export type ChatToolItem = Extract<ChatEngineItem, { kind: 'tool' }>

export function inputRecord(input: unknown): Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {}
}

/** A non-empty string, or a number as text; null otherwise. */
export function inputText(input: unknown, key: string): string | null {
  const value = inputRecord(input)[key]
  return typeof value === 'string' && value !== ''
    ? value
    : typeof value === 'number'
      ? String(value)
      : null
}

export function inputList(input: unknown, key: string): unknown[] {
  const value = inputRecord(input)[key]
  return Array.isArray(value) ? value : []
}

/** Shows paths relative to the chat's folder; others stay absolute. */
export function displayPath(path: string, cwd: string | null): string {
  if (cwd && path.startsWith(cwd)) {
    const rest = path.slice(cwd.length).replace(/^[\\/]+/, '')
    return rest || path
  }
  return path
}
