// Page links resolve against the pages that exist now: [[Title]] links written before their page
// light up once it appears, and links to pages in the Trash read as missing.
import { Extension, type Editor } from '@tiptap/core'
import type { Node as PmNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { PAGE_LINK_SCHEME } from '../../../../shared/project-pages-plain-text'
import type { ProjectPageMeta } from '../../../../shared/project-pages-types'
import { findWikiLinkPage } from '../../../../shared/project-pages-wiki-link-target'

// The doc-link extension already refreshes on this meta when its targets change.
const LINKS_UPDATED = 'docLinksUpdated'
const key = new PluginKey<DecorationSet>('projectPageLinkTargets')

type Storage = { pages: readonly ProjectPageMeta[] }

const livePage = (pages: readonly ProjectPageMeta[], id: string): boolean =>
  pages.some((page) => page.id === id && page.archivedAt === null)

function linkDecorations(doc: PmNode, pages: readonly ProjectPageMeta[]): DecorationSet {
  const decorations: Decoration[] = []
  doc.descendants((node, pos) => {
    if (node.type.name === 'markdownDocLink') {
      const target = typeof node.attrs.target === 'string' ? node.attrs.target : ''
      // A node decoration that changes with the result makes ProseMirror redraw the atom.
      const state = findWikiLinkPage(pages, target) ? 'resolved' : 'missing'
      decorations.push(Decoration.node(pos, pos + node.nodeSize, { 'data-page-link': state }))
      return
    }
    if (!node.isText) {
      return
    }
    const href = node.marks.find((mark) => mark.type.name === 'link')?.attrs.href
    if (typeof href === 'string' && href.startsWith(PAGE_LINK_SCHEME)) {
      if (!livePage(pages, href.slice(PAGE_LINK_SCHEME.length))) {
        decorations.push(
          Decoration.inline(pos, pos + node.nodeSize, { class: 'page-link-missing' })
        )
      }
    }
  })
  return DecorationSet.create(doc, decorations)
}

export const ProjectPageLinkTargets = Extension.create<object, Storage>({
  name: 'projectPageLinkTargets',
  addStorage: () => ({ pages: [] }),
  addProseMirrorPlugins() {
    const storage = this.storage
    return [
      new Plugin<DecorationSet>({
        key,
        state: {
          init: (_, state) => linkDecorations(state.doc, storage.pages),
          apply: (tr, previous) =>
            tr.docChanged || tr.getMeta(LINKS_UPDATED)
              ? linkDecorations(tr.doc, storage.pages)
              : previous
        },
        props: { decorations: (state) => key.getState(state) }
      })
    ]
  }
})

/** Point the editor's page links at the current pages and redraw them. */
export function syncPageLinkTargets(editor: Editor, pages: readonly ProjectPageMeta[]): void {
  const storage = editor.storage as unknown as {
    projectPageLinkTargets?: Storage
    markdownDocLink?: { resolveTarget: ((target: string) => boolean) | null }
  }
  if (!storage.projectPageLinkTargets || editor.isDestroyed) {
    return
  }
  storage.projectPageLinkTargets.pages = pages
  if (storage.markdownDocLink) {
    storage.markdownDocLink.resolveTarget = (target) => findWikiLinkPage(pages, target) !== null
  }
  editor.view.dispatch(editor.state.tr.setMeta(LINKS_UPDATED, true).setMeta('addToHistory', false))
}

/** The live page a click on a page link or [[link]] opens, if any. */
export function clickedPageId(
  element: HTMLElement,
  pages: readonly ProjectPageMeta[]
): string | null {
  const href = element.closest('a')?.getAttribute('href') ?? ''
  if (href.startsWith(PAGE_LINK_SCHEME)) {
    return href.slice(PAGE_LINK_SCHEME.length)
  }
  const target = element.closest<HTMLElement>('[data-doc-link-target]')?.dataset.docLinkTarget
  return target ? (findWikiLinkPage(pages, target)?.id ?? null) : null
}
