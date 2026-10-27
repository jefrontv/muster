import { afterEach, describe, expect, it } from 'vitest'
import {
  isCliStyleEnabled,
  keyValueBlock,
  setCliStyleEnabled,
  startSpinner,
  statusLine,
  stripStyle,
  table,
  tone
} from './cli-style'

const tty = { isTTY: true }
const pipe = { isTTY: false }

describe('isCliStyleEnabled', () => {
  afterEach(() => setCliStyleEnabled(null))

  it('styles a TTY and leaves pipes plain', () => {
    expect(isCliStyleEnabled(tty, {})).toBe(true)
    expect(isCliStyleEnabled(pipe, {})).toBe(false)
    expect(isCliStyleEnabled({}, {})).toBe(false)
  })

  it('honours NO_COLOR and TERM=dumb on a TTY', () => {
    expect(isCliStyleEnabled(tty, { NO_COLOR: '1' })).toBe(false)
    expect(isCliStyleEnabled(tty, { NO_COLOR: '' })).toBe(true)
    expect(isCliStyleEnabled(tty, { TERM: 'dumb' })).toBe(false)
  })

  it('lets FORCE_COLOR override detection both ways', () => {
    expect(isCliStyleEnabled(pipe, { FORCE_COLOR: '1' })).toBe(true)
    expect(isCliStyleEnabled(tty, { FORCE_COLOR: '0' })).toBe(false)
    expect(isCliStyleEnabled(pipe, { FORCE_COLOR: '1', NO_COLOR: '1' })).toBe(true)
  })

  it('uses the test override before anything else', () => {
    setCliStyleEnabled(false)
    expect(isCliStyleEnabled(tty, { FORCE_COLOR: '1' })).toBe(false)
  })
})

describe('styled helpers', () => {
  afterEach(() => setCliStyleEnabled(null))

  it('returns plain text when styling is off', () => {
    setCliStyleEnabled(false)
    expect(tone('accent', 'muster')).toBe('muster')
    expect(keyValueBlock([['path', '/a']])).toBe('  path  /a')
  })

  it('wraps text in escapes when styling is on', () => {
    setCliStyleEnabled(true)
    const styled = tone('danger', 'boom')
    expect(styled).not.toBe('boom')
    expect(stripStyle(styled)).toBe('boom')
    expect(stripStyle(statusLine('failure', 'boom'))).toMatch(/^. boom$/)
  })

  it('aligns table columns and shrinks the flexible one to fit', () => {
    setCliStyleEnabled(true)
    const rendered = table(
      [{ header: 'NAME' }, { header: 'PATH', flexible: true }],
      [
        ['site', '/Users/me/Sites/a-very-long-folder-name/that-keeps-going'],
        ['muster-ui', '/x']
      ],
      40
    )
    const lines = rendered.split('\n').map(stripStyle)
    expect(lines[0]).toBe('NAME       PATH')
    expect(lines[1].length).toBeLessThanOrEqual(40)
    expect(lines[1].endsWith('…')).toBe(true)
    expect(lines[2]).toBe('muster-ui  /x')
  })

  it('prints only the final line when the spinner stream is not styled', () => {
    setCliStyleEnabled(false)
    const writes: string[] = []
    const spinner = startSpinner('Waiting', { isTTY: false, write: (chunk) => writes.push(chunk) })
    spinner.stop('done')
    expect(writes).toEqual(['done\n'])
  })
})
