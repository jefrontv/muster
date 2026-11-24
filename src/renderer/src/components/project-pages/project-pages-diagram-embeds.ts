// A link to a diagram page on its own line shows a live preview under it. The markdown stays a
// plain page link, so agents and exports see an ordinary link.
import { Extension } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { toast } from 'sonner'
import { PAGE_LINK_SCHEME } from '../../../../shared/project-pages-plain-text'
import type { ProjectPageMeta } from '../../../../shared/project-pages-types'

type Preview =
  | { state: 'loading' | 'none' }
  | { state: 'ready'; svg: string; empty: boolean; title: string; revision: number }

const KEY = new PluginKey<DecorationSet>('projectPageDiagramEmbeds')
const previews = new Map<string, Preview>()
const listeners = new Set<() => void>()

function load(scopeKey: string, pageId: string): void {
  previews.set(pageId, { state: 'loading' })
  void (async () => {
    const result = await window.api.projectPages.diagram(scopeKey, pageId)
    if (!result.ok) {
      previews.set(pageId, { state: 'none' })
      return
    }
    const { renderDiagramPreview } = await import('./project-pages-diagram-preview')
    const { page, xml } = result.value
    previews.set(pageId, {
      state: 'ready',
      ...renderDiagramPreview(xml),
      title: page.title,
      revision: page.revision
    })
  })()
    .catch(() => previews.set(pageId, { state: 'none' }))
    .finally(() => listeners.forEach((listener) => listener()))
}

/** The page id when a paragraph is nothing but one page link. */
function lonePageLink(block: ProseMirrorNode): string | null {
  let href: string | null = null
  let other = false
  block.forEach((child) => {
    const link = child.marks.find((mark) => mark.type.name === 'link')?.attrs.href
    if (typeof link !== 'string' || (href !== null && href !== link)) {
      other = other || Boolean(child.text?.trim()) || child.type.name !== 'text'
      return
    }
    href = link
  })
  const found = href as string | null
  return !other && found?.startsWith(PAGE_LINK_SCHEME) ? found.slice(PAGE_LINK_SCHEME.length) : null
}

// Wide diagrams scroll sideways rather than shrinking past this, so labels stay legible.
const MIN_EMBED_SCALE = 0.7

function sizeEmbeddedSvg(svg: SVGSVGElement | null): void {
  const width = Number(svg?.getAttribute('width'))
  if (!svg || !(width > 0)) {
    return
  }
  svg.style.width = `min(${width}px, 100%)`
  svg.style.minWidth = `${Math.round(width * MIN_EMBED_SCALE)}px`
}

function embed(pageId: string, preview: Extract<Preview, { state: 'ready' }>): HTMLElement {
  const anchor = document.createElement('a')
  anchor.className = 'page-diagram-embed'
  anchor.href = `${PAGE_LINK_SCHEME}${pageId}`
  anchor.contentEditable = 'false'
  const canvas = document.createElement('span')
  canvas.className = 'page-diagram-embed-canvas scrollbar-sleek'
  canvas.innerHTML = preview.svg
  sizeEmbeddedSvg(canvas.querySelector('svg'))
  const caption = document.createElement('span')
  caption.className = 'page-diagram-embed-caption'
  caption.textContent = preview.empty
    ? 'Empty diagram. Open it to draw.'
    : `Diagram · ${preview.title || 'Untitled'}`
  anchor.append(canvas, caption)
  return anchor
}

function decorate(doc: ProseMirrorNode, scopeKey: string): DecorationSet {
  const found: Decoration[] = []
  doc.descendants((node, pos) => {
    if (node.type.name !== 'paragraph') {
      return node.isBlock
    }
    const pageId = lonePageLink(node)
    if (!pageId) {
      return false
    }
    const preview = previews.get(pageId)
    if (!preview) {
      load(scopeKey, pageId)
    } else if (preview.state === 'ready') {
      found.push(
        Decoration.widget(pos + node.nodeSize, () => embed(pageId, preview), {
          side: -1,
          key: `diagram:${pageId}:${preview.revision}`
        })
      )
    }
    return false
  })
  return DecorationSet.create(doc, found)
}

/** Creates a diagram page under the current page, for the "/diagram" command. */
export async function createDiagramPage(
  scopeKey: string,
  parentId: string
): Promise<ProjectPageMeta | null> {
  const created = await window.api.projectPages.create(scopeKey, { parentId, title: 'Diagram' })
  const enabled = created.ok
    ? await window.api.projectPages.enableDiagram(scopeKey, created.value.meta.id)
    : created
  if (!enabled.ok) {
    toast.error(enabled.message)
    return null
  }
  return enabled.value.page
}

export const ProjectPageDiagramEmbeds = Extension.create<{ scopeKey: string }>({
  name: 'projectPageDiagramEmbeds',
  addOptions: () => ({ scopeKey: '' }),
  addProseMirrorPlugins() {
    const { scopeKey } = this.options
    return [
      new Plugin({
        key: KEY,
        state: {
          init: (_config, state) => decorate(state.doc, scopeKey),
          apply: (tr, old) => (tr.docChanged || tr.getMeta(KEY) ? decorate(tr.doc, scopeKey) : old)
        },
        // Opening a page re-reads its diagrams, so previews show the latest saves.
        view: (view) => {
          previews.clear()
          const redraw = (): void => {
            if (!view.isDestroyed) {
              view.dispatch(view.state.tr.setMeta(KEY, true))
            }
          }
          listeners.add(redraw)
          redraw()
          return { destroy: () => listeners.delete(redraw) }
        },
        props: { decorations: (state) => KEY.getState(state) }
      })
    ]
  }
})
