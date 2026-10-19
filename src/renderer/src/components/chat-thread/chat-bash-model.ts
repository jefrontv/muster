// What a Bash call ran and how it ended. A non-zero exit is an error unless the
// CLI explained the code (grep's "no matches" exits 1 and is not a failure).

import { inputRecord, inputText, type ChatToolItem } from './chat-tool-input'

export type ChatBashExit = { code: number | null; label: string; ok: boolean }

export type ChatBashModel = {
  command: string
  description: string | null
  background: boolean
  stdout: string
  stderr: string
  exit: ChatBashExit | null
  isError: boolean
}

function exitCodeOf(text: string): number | null {
  const match = /^Exit code (-?\d+)/m.exec(text)
  return match ? Number(match[1]) : null
}

function exitOf(item: ChatToolItem, background: boolean): ChatBashExit | null {
  const result = item.result
  if (background || !result || (item.status !== 'done' && item.status !== 'error')) {
    return null
  }
  if (result.interrupted) {
    return { code: null, label: 'interrupted', ok: false }
  }
  const code = exitCodeOf(result.text)
  if (result.exitInterpretation) {
    return { code, label: result.exitInterpretation, ok: item.status !== 'error' }
  }
  if (code !== null && code !== 0) {
    return { code, label: `exit ${code}`, ok: false }
  }
  return item.status === 'error'
    ? { code, label: 'failed', ok: false }
    : { code: 0, label: 'exit 0', ok: true }
}

export function bashModel(item: ChatToolItem): ChatBashModel {
  const input = item.input
  const result = item.result
  const background =
    result?.backgroundTaskId !== undefined || inputRecord(input).run_in_background === true
  const exit = exitOf(item, background)
  // Older CLIs send no structured stdout; the tool_result text is the output then.
  const stdout = result?.stdout ?? (result && !result.stderr ? result.text : '')
  return {
    command: inputText(input, 'command') ?? '',
    description: inputText(input, 'description'),
    background,
    stdout,
    stderr: result?.stderr ?? '',
    exit,
    isError: item.status === 'error' || (exit !== null && !exit.ok)
  }
}
