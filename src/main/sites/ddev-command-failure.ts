// What a failed DDEV command says: its own error line, or that it ran out of time.

import { stripAnsi } from './ddev-host'

type DdevRunResult = { code: number; stdout: string; stderr: string; timedOut: boolean }

const ERROR_LINE = /\b(error|failed|unable|cannot|can't|refus\w*|not found|denied|invalid)\b/i

/** DDEV's output as clean lines, error stream first; capped so a log stays readable. */
export function ddevOutputLines(result: DdevRunResult, limit = 40): string[] {
  return stripAnsi(`${result.stderr}\n${result.stdout}`)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-limit)
}

/**
 * One sentence for the setup step. DDEV prints progress lines on stdout, so its last line is
 * often "For full details use 'ddev describe'." rather than the error.
 */
export function ddevCommandFailure(
  label: string,
  result: DdevRunResult,
  timeoutMs: number
): string {
  if (result.timedOut) {
    return `${label} didn't finish within ${Math.round(timeoutMs / 1000)} s and was stopped. Docker may be busy; try again.`
  }
  const lines = ddevOutputLines(result)
  const errorLine = lines.findLast((line) => ERROR_LINE.test(line))
  const detail = errorLine ?? lines.at(-1) ?? `exit code ${result.code}`
  return `${label} failed: ${detail}`
}
