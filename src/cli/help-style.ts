import { isCliStyleEnabled, tone } from './cli-style'

const SECTION_TITLE = /^[A-Z][A-Za-z ]*:$/
// Two-space indent, a command or flag, then a 2+ space gap before its summary.
const ALIGNED_ENTRY = /^( {2})(\S(?:.*?\S)?)( {2,})(\S.*)$/
const EXAMPLE = /^( {2})\$ (.*)$/

/** Colours help text on a styled TTY; returns it untouched otherwise. */
export function styleHelpText(text: string): string {
  if (!isCliStyleEnabled()) {
    return text
  }
  return text
    .split('\n')
    .map((line, index) => {
      if (index === 0 && line.startsWith('muster')) {
        return tone('bold', tone('accent', line))
      }
      if (line.startsWith('Usage: ')) {
        return `${tone('bold', 'Usage:')} ${tone('accent', line.slice('Usage: '.length))}`
      }
      if (SECTION_TITLE.test(line)) {
        return tone('bold', line)
      }
      const example = EXAMPLE.exec(line)
      if (example) {
        return `${example[1]}${tone('muted', '$')} ${example[2]}`
      }
      const entry = ALIGNED_ENTRY.exec(line)
      if (entry) {
        return `${entry[1]}${tone('accent', entry[2])}${entry[3]}${entry[4]}`
      }
      return line
    })
    .join('\n')
}
