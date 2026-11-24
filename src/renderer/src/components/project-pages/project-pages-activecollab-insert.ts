// Puts ActiveCollab tasks and projects on a page: as a card (link on its own line), an inline link,
// or a quote of the task's description that links back.
import type { Editor, JSONContent } from '@tiptap/core'
import {
  activeCollabUrl,
  type ActiveCollabPageRef
} from '../../../../shared/project-pages-activecollab-links'
import { activeCollabInstance, loadPageRef } from './project-pages-activecollab-data'

export type ActiveCollabInsertMode = 'card' | 'link' | 'quote'

export type ActiveCollabPick = {
  mode: ActiveCollabInsertMode
  ref: ActiveCollabPageRef
  title: string
  bodyHtml?: string
}

type PickerRequest = { editor: Editor; kind: ActiveCollabPageRef['kind'] }
const pickerListeners = new Set<(request: PickerRequest) => void>()

/** Asks the mounted picker dialog to open for this editor. */
export function openActiveCollabPicker(editor: Editor, kind: PickerRequest['kind']): void {
  pickerListeners.forEach((listener) => listener({ editor, kind }))
}

export function onActiveCollabPicker(listener: (request: PickerRequest) => void): () => void {
  pickerListeners.add(listener)
  return () => pickerListeners.delete(listener)
}

const MAX_QUOTE_CHARS = 2000

/** Plain paragraphs from ActiveCollab's description HTML. */
export function descriptionParagraphs(html: string): string[] {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('br').forEach((br) => br.replaceWith('\n'))
  doc.querySelectorAll('li').forEach((li) => li.prepend('• '))
  doc
    .querySelectorAll('p, li, div, h1, h2, h3, h4, h5, h6, pre, blockquote, tr')
    .forEach((block) => {
      block.append('\n\n')
    })
  const paragraphs: string[] = []
  let used = 0
  for (const raw of (doc.body.textContent ?? '').split(/\n\s*\n/)) {
    const text = raw.replace(/\s+/g, ' ').trim()
    if (!text) {
      continue
    }
    if (used + text.length > MAX_QUOTE_CHARS) {
      paragraphs.push(`${text.slice(0, Math.max(0, MAX_QUOTE_CHARS - used))}…`)
      break
    }
    paragraphs.push(text)
    used += text.length
  }
  return paragraphs
}

function linkNode(title: string, href: string): JSONContent {
  return { type: 'text', text: title, marks: [{ type: 'link', attrs: { href } }] }
}

function contentFor(pick: ActiveCollabPick, href: string): JSONContent[] {
  const link = linkNode(pick.title, href)
  if (pick.mode === 'link') {
    return [link, { type: 'text', text: ' ' }]
  }
  const quoted = pick.mode === 'quote' ? descriptionParagraphs(pick.bodyHtml ?? '') : []
  if (quoted.length === 0) {
    return [{ type: 'paragraph', content: [link] }, { type: 'paragraph' }]
  }
  return [
    {
      type: 'blockquote',
      content: [
        ...quoted.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
        { type: 'paragraph', content: [{ type: 'text', text: 'From ' }, link] }
      ]
    },
    { type: 'paragraph' }
  ]
}

export function insertActiveCollabRef(editor: Editor, pick: ActiveCollabPick): void {
  const instance = activeCollabInstance()
  if (!instance || editor.isDestroyed) {
    return
  }
  editor
    .chain()
    .focus()
    .insertContent(contentFor(pick, activeCollabUrl(instance, pick.ref)))
    .run()
}

/** Swaps a placeholder link title for the row's real name once it loads. */
async function retitle(
  editor: Editor,
  ref: ActiveCollabPageRef,
  href: string,
  placeholder: string
) {
  const row = await loadPageRef(ref)
  if (!row || editor.isDestroyed) {
    return
  }
  const { state } = editor
  const tr = state.tr
  state.doc.descendants((node, pos) => {
    const mark = node.marks.find((m) => m.type.name === 'link' && m.attrs.href === href)
    if (node.isText && mark && node.text === placeholder) {
      tr.replaceWith(
        tr.mapping.map(pos),
        tr.mapping.map(pos + node.nodeSize),
        state.schema.text(row.name, node.marks)
      )
    }
  })
  if (tr.docChanged) {
    editor.view.dispatch(tr)
  }
}

/** A pasted task or project URL becomes a card on an empty line, or a titled link in a sentence. */
export function pasteActiveCollabUrl(editor: Editor, ref: ActiveCollabPageRef): void {
  const instance = activeCollabInstance()
  if (!instance) {
    return
  }
  const { $from, empty } = editor.state.selection
  const blank = empty && $from.parent.type.name === 'paragraph' && $from.parent.content.size === 0
  const placeholder = ref.kind === 'task' ? 'ActiveCollab task' : 'ActiveCollab project'
  insertActiveCollabRef(editor, { mode: blank ? 'card' : 'link', ref, title: placeholder })
  void retitle(editor, ref, activeCollabUrl(instance, ref), placeholder)
}
