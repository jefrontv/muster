// Diagram export: SVG that draw.io can reopen and edit, PNG at 1x or 2x, and PDF.
import { ImageExport, SvgCanvas2D, type Graph } from '@maxgraph/core'
import { toast } from 'sonner'
import { tokenColor } from './project-pages-diagram-styles'

const SVG_NS = 'http://www.w3.org/2000/svg'
const PAD = 16

export type DiagramExportFormat = 'svg' | 'png' | 'png2x' | 'pdf'
type Rendered = { svg: string; width: number; height: number }

/** Draws the diagram at 100%. html=false writes labels as SVG text, which canvases can rasterise. */
export function renderSvg(
  graph: Graph,
  options: { html: boolean; drawioXml?: string; background?: string }
): Rendered {
  const view = graph.getView()
  const saved = { scale: view.scale, x: view.translate.x, y: view.translate.y }
  view.scaleAndTranslate(1, 0, 0)
  try {
    const bounds = graph.getGraphBounds()
    const width = Math.ceil(bounds.width + PAD * 2)
    const height = Math.ceil(bounds.height + PAD * 2)
    const root = document.createElementNS(SVG_NS, 'svg')
    root.setAttribute('xmlns', SVG_NS)
    root.setAttribute('version', '1.1')
    root.setAttribute('width', String(width))
    root.setAttribute('height', String(height))
    root.setAttribute('viewBox', `0 0 ${width} ${height}`)
    if (options.drawioXml) {
      // draw.io reads the diagram back out of this attribute, which keeps the SVG editable.
      root.setAttribute(
        'content',
        `<mxfile host="Muster"><diagram id="pages" name="Page-1">${options.drawioXml}</diagram></mxfile>`
      )
    }
    if (options.background) {
      const background = document.createElementNS(SVG_NS, 'rect')
      background.setAttribute('width', '100%')
      background.setAttribute('height', '100%')
      background.setAttribute('fill', options.background)
      root.append(background)
    }
    const canvas = new SvgCanvas2D(root, false)
    canvas.foEnabled = options.html
    canvas.translate(PAD - bounds.x, PAD - bounds.y)
    const state = view.getState(graph.getDataModel().getRoot()!)
    if (state) {
      new ImageExport().drawState(state, canvas)
    }
    return { svg: new XMLSerializer().serializeToString(root), width, height }
  } finally {
    view.scaleAndTranslate(saved.scale, saved.x, saved.y)
  }
}

async function pngBytes({ svg, width, height }: Rendered, scale: number): Promise<Uint8Array> {
  const image = new Image()
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  await image.decode()
  const canvas = document.createElement('canvas')
  canvas.width = width * scale
  canvas.height = height * scale
  const ctx = canvas.getContext('2d')!
  ctx.scale(scale, scale)
  ctx.drawImage(image, 0, 0)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) {
    throw new Error('The PNG could not be drawn.')
  }
  return new Uint8Array(await blob.arrayBuffer())
}

const escapeHtml = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;')

export async function exportDiagram(
  graph: Graph,
  format: DiagramExportFormat,
  title: string,
  drawioXml: string
): Promise<void> {
  const name = title.trim() || 'Diagram'
  // Exports keep the canvas colour so theme-default shapes stay readable.
  const background = tokenColor('--background', '#ffffff')
  try {
    if (format === 'pdf') {
      const { svg } = renderSvg(graph, { html: true, background })
      const html = `<!doctype html><html><head><title>${escapeHtml(name)}</title><style>body{margin:0}svg{max-width:100%;height:auto}</style></head><body>${svg}</body></html>`
      const result = await window.api.export.htmlToPdf({ html, title: name })
      if (!result.success && !result.cancelled) {
        toast.error(result.error ?? 'The PDF could not be saved.')
      }
      return
    }
    const data =
      format === 'svg'
        ? renderSvg(graph, { html: true, drawioXml, background }).svg
        : await pngBytes(renderSvg(graph, { html: false, background }), format === 'png2x' ? 2 : 1)
    const result = await window.api.projectPages.exportDiagramFile(
      format === 'png2x' ? `${name}@2x` : name,
      format === 'svg' ? 'svg' : 'png',
      data
    )
    if (!result.ok && !result.cancelled) {
      toast.error(result.message ?? 'The file could not be saved.')
    }
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err))
  }
}
