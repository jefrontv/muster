import { describe, expect, it } from 'vitest'
import { describeExtensionRunFailure, summarizeExtensionRunError } from './extension-run-types'
import { stripAnsiEscapes } from './strip-ansi-escapes'

// The real thing pipx printed when `pipx install --force` fought uv's venv reuse.
const PIPX_FAILURE = [
  'creating virtual environment...',
  'error: Failed to create virtual environment',
  '  Caused by: A virtual environment already exists at: .',
  "hint: Use the `--clear` flag or set `UV_VENV_CLEAR=1` to replace it",
  "'/Users/dev/.local/bin/uv venv --python ...' failed",
  "Installing to existing venv 'activecollab-mcp'"
].join('\n')

describe('summarizeExtensionRunError', () => {
  it('prefers the cause over the generic error line', () => {
    expect(summarizeExtensionRunError(PIPX_FAILURE)).toBe(
      'A virtual environment already exists at: .'
    )
  })

  it('falls back to an error line when there is no cause', () => {
    expect(summarizeExtensionRunError('warming up\nerror: no such package\ndone')).toBe(
      'no such package'
    )
  })

  it('falls back to a failure line when nothing says "error"', () => {
    expect(summarizeExtensionRunError('step one\nthe build failed badly')).toBe(
      'the build failed badly'
    )
  })

  it('falls back to the last line when nothing matches', () => {
    expect(summarizeExtensionRunError('one\ntwo\nthree')).toBe('three')
  })

  it('answers null for empty output rather than an empty string', () => {
    expect(summarizeExtensionRunError('   \n  ')).toBeNull()
  })

  it('caps a runaway line', () => {
    expect(summarizeExtensionRunError('x'.repeat(500))).toHaveLength(240)
  })
})

describe('describeExtensionRunFailure', () => {
  it('names a timeout as a timeout', () => {
    expect(describeExtensionRunFailure(-1, true, 'anything')).toContain('time limit')
  })

  it('names a cancellation', () => {
    expect(describeExtensionRunFailure(-1, false, '')).toContain('stopped')
  })

  it('uses the real cause instead of the exit code', () => {
    expect(describeExtensionRunFailure(1, false, PIPX_FAILURE)).toBe(
      'A virtual environment already exists at: .'
    )
  })

  it('falls back to the exit code when there is nothing to quote', () => {
    expect(describeExtensionRunFailure(127, false, '')).toContain('127')
  })
})

describe('stripAnsiEscapes', () => {
  it('removes the colour codes pipx emits even with CI set', () => {
    expect(stripAnsiEscapes('\u001B[1m\u001B[31merror\u001B[39m\u001B[0m: nope')).toBe(
      'error: nope'
    )
  })

  it('removes an OSC sequence', () => {
    expect(stripAnsiEscapes('\u001B]0;title\u0007done')).toBe('done')
  })

  it('drops a progress-bar carriage return but keeps a real line break', () => {
    expect(stripAnsiEscapes('a\rb\r\nc')).toBe('ab\r\nc')
  })

  it('leaves plain text alone', () => {
    expect(stripAnsiEscapes('upgraded activecollab-mcp from 1.18.0 to 1.20.0')).toBe(
      'upgraded activecollab-mcp from 1.18.0 to 1.20.0'
    )
  })
})
