// GitHub-style callouts: a quote starting with [!NOTE], [!TIP], [!IMPORTANT], [!WARNING] or
// [!CAUTION] is drawn as a titled box. The markdown stays a plain quote; the marker is hidden.
import { Extension } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, Selection, type EditorState } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'

export const CALLOUT_KINDS = ['note', 'tip', 'important', 'warning', 'caution'] as const
export type CalloutKind = (typeof CALLOUT_KINDS)[number]
const MARKER = /^\[!(note|tip|important|warning|caution)\] ?/i
const KEY = new PluginKey<DecorationSet>('projectPageCallouts')
const TITLES: Record<CalloutKind, string> = {
  note: 'Note',
  tip: 'Tip',
  important: 'Important',
  warning: 'Warning',
  caution: 'Caution'
}
// Lucide Info, Lightbulb, MessageSquareWarning, TriangleAlert and OctagonAlert.
const ICONS: Record<CalloutKind, string[]> = {
  note: ['M12 16v-4', 'M12 8h.01', 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0'],
  tip: [
    'M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5',
    'M9 18h6',
    'M10 22h4'
  ],
  important: [
    'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
    'M12 7v2',
    'M12 13h.01'
  ],
  warning: [
    'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3',
    'M12 9v4',
    'M12 17h.01'
  ],
  caution: [
    'M12 16h.01',
    'M12 8v4',
    'M15.312 2a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586l-4.688-4.688A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2z'
  ]
}

type Marker = { kind: CalloutKind; from: number; to: number; quote: number }

function markers(doc: ProseMirrorNode): Marker[] {
  const found: Marker[] = []
  doc.descendants((node, pos) => {
    if (node.type.name !== 'blockquote') {
      return true
    }
    const first = node.firstChild
    const match = first?.isTextblock ? first.textContent.match(MARKER) : null
    if (match) {
      // Blockquote open, then paragraph open: the text starts two positions in.
      const kind = match[1].toLowerCase() as CalloutKind
      found.push({ kind, from: pos + 2, to: pos + 2 + match[0].length, quote: pos })
    }
    return true
  })
  return found
}

function title(kind: CalloutKind): HTMLElement {
  const el = document.createElement('span')
  el.className = 'page-callout-title'
  el.contentEditable = 'false'
  el.title = 'Change callout type'
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  for (const d of ICONS[kind]) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', d)
    svg.appendChild(path)
  }
  el.append(svg, TITLES[kind])
  return el
}

function decorate(doc: ProseMirrorNode): DecorationSet {
  const found = markers(doc).flatMap((m) => [
    Decoration.node(m.quote, m.quote + doc.nodeAt(m.quote)!.nodeSize, {
      class: `page-callout page-callout-${m.kind}`
    }),
    Decoration.widget(m.from, () => title(m.kind), { side: -1, key: `callout-${m.kind}` }),
    Decoration.inline(m.from, m.to, { class: 'page-callout-marker' })
  ])
  return DecorationSet.create(doc, found)
}

function markerAt(state: EditorState, pos: number): Marker | undefined {
  return markers(state.doc).find((m) => pos >= m.from && pos <= m.to)
}

/** Clicking the title cycles the callout type. */
function cycle(view: EditorView, target: EventTarget | null): boolean {
  const el = (target as HTMLElement | null)?.closest?.('.page-callout-title')
  if (!el) {
    return false
  }
  const m = markerAt(view.state, view.posAtDOM(el, 0))
  if (!m) {
    return false
  }
  const next = CALLOUT_KINDS[(CALLOUT_KINDS.indexOf(m.kind) + 1) % CALLOUT_KINDS.length]
  view.dispatch(view.state.tr.insertText(`[!${next.toUpperCase()}] `, m.from, m.to))
  return true
}

export const ProjectPageCallouts = Extension.create({
  name: 'projectPageCallouts',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: KEY,
        state: {
          init: (_config, state) => decorate(state.doc),
          apply: (tr, old) => (tr.docChanged ? decorate(tr.doc) : old)
        },
        // Keep the caret out of the hidden marker: moving left from its end leaves the callout.
        appendTransaction: (_trs, oldState, state) => {
          const { selection } = state
          if (!selection.empty) {
            return null
          }
          const m = markerAt(state, selection.from)
          if (!m || selection.from === m.to) {
            return null
          }
          const leaving = oldState.selection.from >= m.to
          const target = leaving
            ? Selection.findFrom(state.doc.resolve(m.quote), -1, true)
            : Selection.near(state.doc.resolve(m.to))
          return target ? state.tr.setSelection(target) : null
        },
        props: {
          decorations: (state) => KEY.getState(state),
          handleDOMEvents: {
            mousedown: (view, event) => {
              if (!cycle(view, event.target)) {
                return false
              }
              event.preventDefault()
              return true
            }
          },
          // Backspace at the start of the body turns the callout back into a plain quote.
          handleKeyDown: (view, event) => {
            const { selection } = view.state
            if (event.key !== 'Backspace' || !selection.empty) {
              return false
            }
            const m = markerAt(view.state, selection.from)
            if (!m || selection.from !== m.to) {
              return false
            }
            view.dispatch(view.state.tr.delete(m.from, m.to))
            return true
          }
        }
      })
    ]
  }
})
