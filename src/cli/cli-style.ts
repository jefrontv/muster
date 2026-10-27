import { styleText } from 'node:util'

type StyleStream = { isTTY?: boolean; columns?: number; write?: (chunk: string) => unknown }
type Tone = 'accent' | 'success' | 'warning' | 'danger' | 'muted' | 'bold'

// Why: styleText format names closest to the app's accent/success/warning/danger/muted tokens.
const TONE_FORMATS: Record<Tone, Parameters<typeof styleText>[0]> = {
  accent: 'cyan',
  success: 'green',
  warning: 'yellow',
  danger: 'red',
  muted: 'gray',
  bold: 'bold'
}

const UNICODE_GLYPHS = { success: '✓', failure: '✗', live: '●', idle: '○', pointer: '›' }
const ASCII_GLYPHS = { success: '+', failure: 'x', live: '*', idle: 'o', pointer: '>' }
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

let enabledOverride: boolean | null = null

/** Tests force styling on or off; `null` restores detection. */
export function setCliStyleEnabled(enabled: boolean | null): void {
  enabledOverride = enabled
}

export function isCliStyleEnabled(
  stream: StyleStream = process.stdout,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  if (enabledOverride !== null) {
    return enabledOverride
  }
  if (env.FORCE_COLOR !== undefined && env.FORCE_COLOR !== '') {
    return env.FORCE_COLOR !== '0' && env.FORCE_COLOR !== 'false'
  }
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== '') {
    return false
  }
  return stream.isTTY === true && env.TERM !== 'dumb'
}

function supportsUnicode(env: NodeJS.ProcessEnv = process.env): boolean {
  if (process.platform !== 'win32') {
    return env.TERM !== 'linux'
  }
  // Why: legacy conhost renders box/check glyphs as '?'; Windows Terminal and VS Code do not.
  return Boolean(env.WT_SESSION) || env.TERM_PROGRAM === 'vscode' || Boolean(env.ConEmuANSI)
}

export function glyph(name: keyof typeof UNICODE_GLYPHS): string {
  return (supportsUnicode() ? UNICODE_GLYPHS : ASCII_GLYPHS)[name]
}

export function tone(name: Tone, text: string, stream: StyleStream = process.stdout): string {
  if (!isCliStyleEnabled(stream) || text.length === 0) {
    return text
  }
  return styleText(TONE_FORMATS[name], text, { validateStream: false })
}

export function stripStyle(text: string): string {
  // oxlint-disable-next-line no-control-regex -- matching ANSI SGR escapes is the point
  return text.replace(/\u001b\[[0-9;]*m/g, '')
}

function visibleWidth(text: string): number {
  return [...stripStyle(text)].length
}

function padVisible(text: string, width: number): string {
  return text + ' '.repeat(Math.max(0, width - visibleWidth(text)))
}

function truncateVisible(text: string, width: number): string {
  const plain = stripStyle(text)
  const chars = [...plain]
  if (chars.length <= width) {
    return text
  }
  // Why: a cut through an escape sequence would bleed colour; truncated cells drop styling.
  return `${chars.slice(0, Math.max(0, width - 1)).join('')}…`
}

export function statusLine(
  kind: 'success' | 'failure' | 'warning',
  text: string,
  stream: StyleStream = process.stdout
): string {
  const mark =
    kind === 'success' ? glyph('success') : kind === 'failure' ? glyph('failure') : glyph('pointer')
  const color = kind === 'success' ? 'success' : kind === 'failure' ? 'danger' : 'warning'
  return `${tone(color, mark, stream)} ${kind === 'failure' ? tone('danger', text, stream) : text}`
}

/** Aligned `label  value` rows with muted labels, indented under a status line. */
export function keyValueBlock(rows: readonly (readonly [string, string])[], indent = 2): string {
  const width = Math.max(0, ...rows.map(([label]) => label.length))
  return rows
    .map(([label, value]) => `${' '.repeat(indent)}${tone('muted', label.padEnd(width))}  ${value}`)
    .join('\n')
}

export type TableColumn = {
  header: string
  /** Shrinks first when the table is wider than the terminal. */
  flexible?: boolean
}

export function table(
  columns: readonly TableColumn[],
  rows: readonly (readonly string[])[],
  maxWidth = process.stdout.columns ?? 120
): string {
  const gap = 2
  const widths = columns.map((column, index) =>
    Math.max(column.header.length, ...rows.map((row) => visibleWidth(row[index] ?? '')))
  )
  let overflow =
    widths.reduce((sum, width) => sum + width, 0) + gap * (columns.length - 1) - maxWidth
  for (let index = columns.length - 1; index >= 0 && overflow > 0; index -= 1) {
    if (!columns[index].flexible) {
      continue
    }
    const shrink = Math.min(overflow, widths[index] - Math.max(8, columns[index].header.length))
    if (shrink > 0) {
      widths[index] -= shrink
      overflow -= shrink
    }
  }
  const renderRow = (cells: readonly string[]): string =>
    cells
      .map((cell, index) => {
        const fitted = truncateVisible(cell, widths[index])
        return index === cells.length - 1 ? fitted : padVisible(fitted, widths[index])
      })
      .join(' '.repeat(gap))
      .trimEnd()
  const header = renderRow(columns.map((column) => tone('muted', column.header)))
  return [header, ...rows.map(renderRow)].join('\n')
}

export type CliSpinner = { stop: (finalLine?: string) => void }

/** Spinner on stderr so stdout stays clean for pipes; a no-op when stderr is not styled. */
export function startSpinner(text: string, stream: StyleStream = process.stderr): CliSpinner {
  if (!isCliStyleEnabled(stream) || !stream.write || !supportsUnicode()) {
    return { stop: (finalLine) => finalLine && stream.write?.(`${finalLine}\n`) }
  }
  let frame = 0
  const render = (): void => {
    stream.write?.(`\r${tone('accent', SPINNER_FRAMES[frame], stream)} ${text}\u001b[K`)
    frame = (frame + 1) % SPINNER_FRAMES.length
  }
  render()
  const timer = setInterval(render, 80)
  timer.unref?.()
  let stopped = false
  return {
    stop: (finalLine) => {
      if (stopped) {
        return
      }
      stopped = true
      clearInterval(timer)
      stream.write?.(`\r\u001b[K${finalLine ? `${finalLine}\n` : ''}`)
    }
  }
}
