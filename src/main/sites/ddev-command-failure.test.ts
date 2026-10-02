import { describe, expect, it } from 'vitest'
import { ddevCommandFailure, ddevOutputLines } from './ddev-command-failure'

const result = (over: Partial<Parameters<typeof ddevCommandFailure>[1]>) => ({
  code: 1,
  stdout: '',
  stderr: '',
  timedOut: false,
  ...over
})

describe('ddevCommandFailure', () => {
  it('says the command ran out of time instead of quoting a progress line', () => {
    const cut = result({
      code: 143,
      timedOut: true,
      stdout:
        "\u001b[32mConfiguring a 'wordpress' project.\nFor full details use 'ddev describe'.\u001b[0m\n"
    })
    expect(ddevCommandFailure('ddev config', cut, 120_000)).toBe(
      "ddev config didn't finish within 120 s and was stopped. Docker may be busy; try again."
    )
  })

  it('picks the error line over the last progress line, without colour codes', () => {
    const failed = result({
      stdout:
        "\u001b[31mFailed to write config: permission denied\u001b[0m\nFor full details use 'ddev describe'.\u001b[0m\n"
    })
    expect(ddevCommandFailure('ddev config', failed, 120_000)).toBe(
      'ddev config failed: Failed to write config: permission denied'
    )
  })

  it('falls back to the last line, then the exit code', () => {
    expect(ddevCommandFailure('ddev config', result({ stdout: 'odd output\n' }), 1)).toBe(
      'ddev config failed: odd output'
    )
    expect(ddevCommandFailure('ddev config', result({ code: 2 }), 1)).toBe(
      'ddev config failed: exit code 2'
    )
  })
})

describe('ddevOutputLines', () => {
  it('cleans and caps the output for the step log', () => {
    const lines = ddevOutputLines(
      result({ stdout: '\u001b[32ma\u001b[0m\n\n b \n', stderr: 'c' }),
      2
    )
    expect(lines).toEqual(['a', 'b'])
  })
})
