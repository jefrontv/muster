// Renders a diagram page to a static SVG for embeds. Loaded on demand so plain pages skip maxGraph.
import DOMPurify from 'dompurify'
import { renderSvg } from './project-pages-diagram-export'
import { createDiagramEditor } from './project-pages-diagram-graph'
import { loadDiagramXml } from './project-pages-diagram-model'

export function renderDiagramPreview(xml: string): { svg: string; empty: boolean } {
  const host = document.createElement('div')
  host.style.cssText =
    'position:fixed;left:-10000px;top:0;width:1200px;height:800px;visibility:hidden;pointer-events:none'
  document.body.append(host)
  const editor = createDiagramEditor(host, () => undefined)
  try {
    loadDiagramXml(editor.graph, xml)
    const empty = editor.graph.getDefaultParent().getChildCount() === 0
    // Labels as SVG text: no foreignObject HTML reaches the page.
    const { svg } = renderSvg(editor.graph, { html: false })
    return {
      svg: DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } }),
      empty
    }
  } finally {
    editor.destroy()
    host.remove()
  }
}
