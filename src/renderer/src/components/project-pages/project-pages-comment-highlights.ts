// Highlights the text each open page comment is anchored to, found again by quote on every change.
import { Extension } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { anchorAt, locateAnchor } from '../../../../shared/project-pages-comment-anchor'
import { planNoteTone } from '../plan-annotation/plan-review-comments'
import type {
  PageCommentAnchor,
  PageCommentThread
} from '../../../../shared/project-pages-comment-types'

export type PageTextIndex = { text: string; positions: number[] }
export type LocatedThreads = Map<string, { from: number; to: number } | null>

type HighlightState = {
  threads: PageCommentThread[]
  activeId: string | null
  located: LocatedThreads
  decorations: DecorationSet
}

export const PAGE_COMMENT_HIGHLIGHTS_KEY = new PluginKey<HighlightState>('projectPageComments')

/** Plain text of the doc, one char per position, blocks separated by a newline. */
export function pageTextIndex(doc: ProseMirrorNode): PageTextIndex {
  let text = ''
  const positions: number[] = []
  doc.descendants((node, pos) => {
    if (node.isText && node.text) {
      for (let i = 0; i < node.text.length; i += 1) {
        positions.push(pos + i)
      }
      text += node.text
      return false
    }
    if ((node.isTextblock && text.length > 0) || node.type.name === 'hardBreak') {
      text += '\n'
      positions.push(pos)
    }
    return true
  })
  return { text, positions }
}

function firstAtOrAfter(positions: number[], pos: number): number {
  let low = 0
  let high = positions.length
  while (low < high) {
    const mid = (low + high) >> 1
    if (positions[mid] < pos) {
      low = mid + 1
    } else {
      high = mid
    }
  }
  return low
}

/** Anchor for a selection, or null when it holds no text. */
export function anchorForSelection(
  doc: ProseMirrorNode,
  from: number,
  to: number
): PageCommentAnchor | null {
  const index = pageTextIndex(doc)
  const start = firstAtOrAfter(index.positions, from)
  const end = firstAtOrAfter(index.positions, to)
  const anchor = anchorAt(index.text, start, end)
  return anchor.quote.trim() ? anchor : null
}

function locateAll(doc: ProseMirrorNode, threads: PageCommentThread[]): LocatedThreads {
  const located: LocatedThreads = new Map()
  const anchored = threads.filter((t) => t.anchor)
  if (anchored.length === 0) {
    return located
  }
  const index = pageTextIndex(doc)
  for (const thread of anchored) {
    const range = locateAnchor(index.text, thread.anchor!)
    located.set(
      thread.id,
      range && range.end > range.start
        ? { from: index.positions[range.start], to: index.positions[range.end - 1] + 1 }
        : null
    )
  }
  return located
}

/** Remove / looks-good threads take the plan review's own marks for those kinds. */
function highlightClass(thread: PageCommentThread): string {
  const tone = thread.kind ? planNoteTone(thread.kind) : undefined
  return tone
    ? `rich-markdown-annotation-selection rich-markdown-annotation-selection-${tone}`
    : 'page-comment-highlight'
}

function build(
  doc: ProseMirrorNode,
  threads: PageCommentThread[],
  activeId: string | null
): HighlightState {
  const located = locateAll(doc, threads)
  const decorations: Decoration[] = []
  for (const thread of threads) {
    const range = located.get(thread.id)
    if (range && thread.status === 'open') {
      decorations.push(
        Decoration.inline(range.from, range.to, {
          class: [highlightClass(thread), thread.id === activeId ? 'is-active' : '']
            .filter(Boolean)
            .join(' '),
          'data-comment-thread': thread.id
        })
      )
    }
  }
  return { threads, activeId, located, decorations: DecorationSet.create(doc, decorations) }
}

export function pageCommentHighlights(state: EditorState): HighlightState | undefined {
  return PAGE_COMMENT_HIGHLIGHTS_KEY.getState(state)
}

export const ProjectPageCommentHighlights = Extension.create({
  name: 'projectPageCommentHighlights',
  addProseMirrorPlugins() {
    return [
      new Plugin<HighlightState>({
        key: PAGE_COMMENT_HIGHLIGHTS_KEY,
        state: {
          init: (_config, state) => build(state.doc, [], null),
          apply: (tr, old) => {
            const next = tr.getMeta(PAGE_COMMENT_HIGHLIGHTS_KEY) as
              | Pick<HighlightState, 'threads' | 'activeId'>
              | undefined
            if (next) {
              return build(tr.doc, next.threads, next.activeId)
            }
            return tr.docChanged ? build(tr.doc, old.threads, old.activeId) : old
          }
        },
        props: {
          decorations: (state) => PAGE_COMMENT_HIGHLIGHTS_KEY.getState(state)?.decorations
        }
      })
    ]
  }
})
