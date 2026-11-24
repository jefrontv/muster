// Styles #tags in page text as pills without changing the markdown. Clicks are the editor's.
import { Extension } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { TAG_PATTERN, tagLabel } from '../../../../shared/project-pages-tags'

const KEY = new PluginKey<DecorationSet>('projectPageTags')

function decorate(doc: ProseMirrorNode): DecorationSet {
  const found: Decoration[] = []
  doc.descendants((node, pos) => {
    if (node.type.spec.code) {
      return false
    }
    if (!node.isText || !node.text) {
      return true
    }
    if (node.marks.some((mark) => mark.type.spec.code || mark.type.name === 'link')) {
      return false
    }
    for (const match of node.text.matchAll(TAG_PATTERN)) {
      const label = tagLabel(match[2])
      if (label) {
        const start = pos + (match.index ?? 0) + match[1].length
        found.push(
          Decoration.inline(start, start + label.length + 1, {
            class: 'page-tag',
            'data-tag': label
          })
        )
      }
    }
    return false
  })
  return DecorationSet.create(doc, found)
}

export const ProjectPageTags = Extension.create({
  name: 'projectPageTags',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: KEY,
        state: {
          init: (_config, state) => decorate(state.doc),
          apply: (tr, old) => (tr.docChanged ? decorate(tr.doc) : old)
        },
        props: {
          decorations: (state) => KEY.getState(state)
        }
      })
    ]
  }
})
