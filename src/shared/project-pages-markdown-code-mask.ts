// Markdown with code and escaped characters blanked out, same length, so link scans skip text
// that renders literally while match positions still line up with the original.
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/
const ESCAPABLE = /[!-/:-@[-`{-~]/

const blank = (text: string): string => text.replace(/[^\n]/g, '\n')

function closesFence(line: string, fence: string): boolean {
  const match = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(line)
  return Boolean(match && match[1][0] === fence[0] && match[1].length >= fence.length)
}

function maskInline(text: string): string {
  let out = ''
  let index = 0
  while (index < text.length) {
    const char = text[index]
    if (char === '\\' && ESCAPABLE.test(text[index + 1] ?? '')) {
      out += '\n\n'
      index += 2
      continue
    }
    if (char !== '`') {
      out += char
      index += 1
      continue
    }
    let run = 1
    while (text[index + run] === '`') {
      run += 1
    }
    const close = new RegExp(`(?<!\`)\`{${run}}(?!\`)`, 'g')
    close.lastIndex = index + run
    const end = close.exec(text)
    if (!end) {
      out += text.slice(index, index + run)
      index += run
      continue
    }
    const stop = end.index + run
    out += blank(text.slice(index, stop))
    index = stop
  }
  return out
}

export function maskMarkdownCode(markdown: string): string {
  const out: string[] = []
  let prose: string[] = []
  let fence: string | null = null
  const flushProse = (): void => {
    if (prose.length > 0) {
      out.push(maskInline(prose.join('\n')))
      prose = []
    }
  }
  for (const line of markdown.split('\n')) {
    if (fence) {
      out.push(blank(line))
      fence = closesFence(line, fence) ? null : fence
      continue
    }
    const open = FENCE_OPEN.exec(line)
    if (open) {
      flushProse()
      fence = open[1]
      out.push(blank(line))
      continue
    }
    prose.push(line)
  }
  flushProse()
  return out.join('\n')
}
