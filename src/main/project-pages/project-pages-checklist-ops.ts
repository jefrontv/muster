// Ticks checklist items by their text, so an agent can check one off without rewriting the page.
import { ProjectPagesError } from './project-pages-store'

const ITEM = /^(\s*[-*+]\s+\[)([ xX])(\]\s+)(.*)$/

type ChecklistItem = { index: number; text: string }

function checklistItems(lines: readonly string[]): ChecklistItem[] {
  const items: ChecklistItem[] = []
  let fence: string | null = null
  lines.forEach((line, index) => {
    const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/)?.[1]
    if (marker) {
      fence = fence === null ? marker[0] : fence === marker[0] ? null : fence
      return
    }
    const match = fence === null ? line.match(ITEM) : null
    if (match) {
      items.push({ index, text: match[4].trim() })
    }
  })
  return items
}

const names = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : [])

/** setChecklistItems from the tool's check and uncheck arguments. */
export function tickChecklist(markdown: string, args: Record<string, unknown>) {
  return setChecklistItems(markdown, names(args.check), names(args.uncheck))
}

const normal = (text: string): string => text.replace(/\s+/g, ' ').trim().toLowerCase()

/** Checks and unchecks items named by their exact text (case ignored); every same-named item moves. */
export function setChecklistItems(
  markdown: string,
  check: readonly string[],
  uncheck: readonly string[]
): { markdown: string; checked: string[]; unchecked: string[] } {
  if (check.length === 0 && uncheck.length === 0) {
    throw new ProjectPagesError('invalid', 'Name at least one item in check or uncheck.')
  }
  const lines = markdown.split('\n')
  const items = checklistItems(lines)
  const set = (name: string, done: boolean): string => {
    const found = items.filter((item) => normal(item.text) === normal(name))
    if (found.length === 0) {
      const listed = items.slice(0, 40).map((item) => item.text)
      throw new ProjectPagesError(
        'invalid',
        listed.length
          ? `No checklist item "${name}". Items: ${listed.join('; ')}.`
          : 'This page has no checklist items.'
      )
    }
    for (const { index } of found) {
      lines[index] = lines[index].replace(ITEM, (_line, open, _state, close, text) =>
        [open, done ? 'x' : ' ', close, text].join('')
      )
    }
    return found[0].text
  }
  const checked = check.map((name) => set(name, true))
  const unchecked = uncheck.map((name) => set(name, false))
  return { markdown: lines.join('\n'), checked, unchecked }
}
