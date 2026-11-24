// ActiveCollab links drawn as cards (a link on its own line) or chips (inside a sentence). The
// markdown stays an ordinary link; clicking one opens the task in the Tasks view.
import { Extension } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import {
  activeCollabRefKey,
  parseActiveCollabUrl,
  type ActiveCollabPageRef
} from '../../../../shared/project-pages-activecollab-links'
import { useAppStore } from '@/store'
import { AC_REF_ATTR, cardHead, cardMeta, chipDot } from './project-pages-activecollab-cards'
import {
  activeCollabInstance,
  onActiveCollabPageData,
  openActiveCollabRef,
  pageProject,
  pageTask,
  refreshActiveCollabPageData
} from './project-pages-activecollab-data'
import { pasteActiveCollabUrl } from './project-pages-activecollab-insert'

const KEY = new PluginKey<DecorationSet>('projectPageActiveCollab')

type LinkRun = { ref: ActiveCollabPageRef; from: number; to: number; text: string }

function rowFor(ref: ActiveCollabPageRef) {
  return ref.kind === 'task' ? pageTask(ref) : pageProject(ref.projectId)
}

/** Runs of text in a textblock that carry one ActiveCollab link each. */
function linkRuns(block: ProseMirrorNode, start: number, instance: string): LinkRun[] {
  const runs: LinkRun[] = []
  block.forEach((child, offset) => {
    const href = child.marks.find((mark) => mark.type.name === 'link')?.attrs.href
    const ref = typeof href === 'string' ? parseActiveCollabUrl(href, instance) : null
    const from = start + offset
    const last = runs.at(-1)
    if (!ref) {
      return
    }
    if (last && last.to === from && activeCollabRefKey(last.ref) === activeCollabRefKey(ref)) {
      last.to = from + child.nodeSize
      last.text += child.text ?? ''
    } else {
      runs.push({ ref, from, to: from + child.nodeSize, text: child.text ?? '' })
    }
  })
  return runs
}

function decorate(doc: ProseMirrorNode): DecorationSet {
  const instance = activeCollabInstance()
  if (!instance) {
    return DecorationSet.empty
  }
  const found: Decoration[] = []
  doc.descendants((node, pos) => {
    if (!node.isTextblock) {
      return true
    }
    const runs = linkRuns(node, pos + 1, instance)
    const alone = runs.length === 1 && node.textContent.trim() === runs[0].text.trim()
    for (const run of runs) {
      const row = rowFor(run.ref)
      const state =
        row === undefined ? 'loading' : row ? (row.isCompleted ? 'done' : 'open') : 'missing'
      const key = `${activeCollabRefKey(run.ref)}:${state}:${row ? JSON.stringify(row).length : 0}`
      if (alone && node.type.name === 'paragraph') {
        found.push(
          Decoration.node(pos, pos + node.nodeSize, { class: `page-ac-card is-${state}` }),
          Decoration.widget(pos + 1, () => cardHead(run.ref, row), {
            side: -1,
            key: `head:${key}`
          }),
          Decoration.widget(pos + node.nodeSize - 1, () => cardMeta(run.ref, row), {
            side: 1,
            key: `meta:${key}`
          })
        )
      } else {
        found.push(
          Decoration.inline(run.from, run.to, { class: `page-ac-chip is-${state}` }),
          Decoration.widget(run.from, () => chipDot(run.ref, row), { side: -1, key: `dot:${key}` })
        )
      }
    }
    return false
  })
  return DecorationSet.create(doc, found)
}

function refAt(view: EditorView, target: HTMLElement): ActiveCollabPageRef | null {
  const widget = target.closest<HTMLElement>(`[${AC_REF_ATTR}]`)
  if (widget) {
    return JSON.parse(widget.getAttribute(AC_REF_ATTR) ?? 'null') as ActiveCollabPageRef | null
  }
  const href = target.closest('a')?.getAttribute('href')
  const instance = activeCollabInstance()
  return href && instance && view.dom.contains(target) ? parseActiveCollabUrl(href, instance) : null
}

export const ProjectPageActiveCollab = Extension.create({
  name: 'projectPageActiveCollab',
  addProseMirrorPlugins() {
    const { editor } = this
    return [
      new Plugin({
        key: KEY,
        state: {
          init: (_config, state) => decorate(state.doc),
          apply: (tr, old) => (tr.docChanged || tr.getMeta(KEY) ? decorate(tr.doc) : old)
        },
        // Redraws when rows load or ActiveCollab connects; opening a page fetches fresh rows.
        view: (view) => {
          const redraw = (): void => {
            if (!view.isDestroyed) {
              view.dispatch(view.state.tr.setMeta(KEY, true))
            }
          }
          refreshActiveCollabPageData()
          const stopData = onActiveCollabPageData(redraw)
          let status = useAppStore.getState().activeCollabStatus
          const stopStore = useAppStore.subscribe((state) => {
            if (state.activeCollabStatus !== status) {
              status = state.activeCollabStatus
              redraw()
            }
          })
          const store = useAppStore.getState()
          if (!store.activeCollabStatusChecked) {
            void store.checkActiveCollabConnection()
          }
          return {
            destroy: () => {
              stopData()
              stopStore()
            }
          }
        },
        props: {
          decorations: (state) => KEY.getState(state),
          handlePaste: (_view, event) => {
            const text = event.clipboardData?.getData('text/plain').trim() ?? ''
            const instance = activeCollabInstance()
            const ref = instance && !/\s/.test(text) ? parseActiveCollabUrl(text, instance) : null
            if (!ref) {
              return false
            }
            pasteActiveCollabUrl(editor, ref)
            return true
          },
          handleDOMEvents: {
            click: (view, event) => {
              const ref = refAt(view, event.target as HTMLElement)
              if (!ref) {
                return false
              }
              event.preventDefault()
              openActiveCollabRef(ref)
              return true
            }
          }
        }
      })
    ]
  }
})
