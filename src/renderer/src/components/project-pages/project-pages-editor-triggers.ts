// What the text before the caret asks for: a page link ("[[" or "@") or a tag ("#"), and the
// picker items for it.
import type { Editor } from '@tiptap/react'
import type { ProjectPageMeta } from '../../../../shared/project-pages-types'
import type { SlashMenuState } from '../editor/rich-markdown-slash-command-primitives'
import { pageTitle } from './project-pages-tree-model'

const WIKI_TRIGGER = /\[\[([^[\]\n\uFFFC]{0,60})$/
// "@" only at a word start, so emails never open it; no leading space after it.
const MENTION_TRIGGER = /(?<=^|\s)@([^\s@\uFFFC][^@\n\uFFFC]{0,40})?$/
const TAG_TRIGGER = /(?<=^|\s)#([\p{L}\p{N}_/-]{0,48})$/u

export type PagePickerKind = 'link' | 'tag'
export type PagePickerState = SlashMenuState & { kind: PagePickerKind }

export type PagePickerItem =
  | { kind: 'page'; page: ProjectPageMeta }
  | { kind: 'create'; title: string }
  | { kind: 'tag'; label: string }

export function syncPagePicker(editor: Editor, root: HTMLElement | null): PagePickerState | null {
  const { selection } = editor.state
  if (!root || !selection.empty || !selection.$from.parent.isTextblock) {
    return null
  }
  const { $from } = selection
  if ($from.parent.type.spec.code) {
    return null
  }
  const before = $from.parent.textBetween(0, $from.parentOffset, '\n', '\uFFFC')
  const wiki = before.match(WIKI_TRIGGER)
  const mention = wiki ? null : before.match(MENTION_TRIGGER)
  const tag = wiki || mention ? null : before.match(TAG_TRIGGER)
  const match = wiki ?? mention ?? tag
  // A mention ending in two spaces means the user moved on.
  if (!match || (mention && /\s\s$/.test(before))) {
    return null
  }
  const coords = editor.view.coordsAtPos(selection.from)
  const rect = root.getBoundingClientRect()
  return {
    kind: tag ? 'tag' : 'link',
    query: match[1] ?? '',
    from: selection.from - match[0].length,
    to: selection.from,
    left: coords.left - rect.left,
    top: coords.bottom - rect.top + 8
  }
}

export function pagePickerItems(
  picker: PagePickerState | null,
  pages: readonly ProjectPageMeta[],
  pageId: string,
  tags: readonly string[]
): PagePickerItem[] {
  if (!picker) {
    return []
  }
  const query = picker.query.trim().toLowerCase()
  if (picker.kind === 'tag') {
    return tags
      .filter((label) => label.toLowerCase().startsWith(query) && label.toLowerCase() !== query)
      .slice(0, 8)
      .map((label) => ({ kind: 'tag', label }))
  }
  const found: PagePickerItem[] = pages
    .filter((page) => page.archivedAt === null && page.id !== pageId)
    .filter((page) => !query || pageTitle(page).toLowerCase().includes(query))
    .slice(0, 12)
    .map((page) => ({ kind: 'page', page }))
  const exact = pages.some(
    (page) => page.archivedAt === null && pageTitle(page).toLowerCase() === query
  )
  return query && !exact ? [...found, { kind: 'create', title: picker.query.trim() }] : found
}
