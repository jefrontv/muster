// Agent diagram work on a hidden editor: the shape catalogue, compact reads, edits and PNG renders.
import type { Graph } from '@maxgraph/core'
import {
  DIAGRAM_AGENT_LAYOUTS,
  type DiagramRenderResult,
  type DiagramWorkRequest
} from '../../../../shared/project-pages-diagram-agent'
import { diagramLabel } from '../../../../shared/project-pages-diagram-outline'
import { styleToString } from '../../../../shared/project-pages-diagram-xml'
import { applyAgentEdit } from './project-pages-diagram-agent-edit'
import { shapeNameOf } from './project-pages-diagram-agent-refs'
import { pngBytes, renderSvg } from './project-pages-diagram-export'
import { createDiagramEditor } from './project-pages-diagram-graph'
import { loadDiagramXml, snapshotDiagram } from './project-pages-diagram-model'
import { DIAGRAM_COLOR_PRESETS, DIAGRAM_SHAPES, tokenColor } from './project-pages-diagram-styles'

const MAX_RENDER_WIDTH = 2400

async function withDiagram<T>(xml: string, work: (graph: Graph) => T | Promise<T>): Promise<T> {
  const host = document.createElement('div')
  host.style.cssText =
    'position:fixed;left:-10000px;top:0;width:1200px;height:800px;visibility:hidden;pointer-events:none'
  document.body.append(host)
  const editor = createDiagramEditor(host, () => undefined)
  try {
    loadDiagramXml(editor.graph, xml)
    return await work(editor.graph)
  } finally {
    editor.destroy()
    host.remove()
  }
}

function catalogue(): unknown {
  return {
    shapes: DIAGRAM_SHAPES.map((s) => `${s.id} (${s.label}${s.keywords ? `: ${s.keywords}` : ''})`),
    colors: DIAGRAM_COLOR_PRESETS.map((p) => p.id),
    layouts: DIAGRAM_AGENT_LAYOUTS,
    notes:
      'Default shape is rounded. A container holds shapes added with in: <container>. Labels take \\n for line breaks. Links take a page title path or a URL.'
  }
}

function readRows(graph: Graph, detail: boolean): unknown {
  const cells = snapshotDiagram(graph)
  const byId = new Map(cells.map((c) => [c.id, c]))
  const layer = (id: string | undefined): boolean => !!id && !byId.get(id)?.parent
  const shapes = cells
    .filter((c) => c.vertex && !byId.get(c.parent ?? '')?.edge)
    .map((c) => ({
      id: c.id,
      shape: shapeNameOf(c.style),
      label: diagramLabel(c),
      ...(layer(byId.get(c.parent ?? '')?.parent) ? {} : { parent: c.parent }),
      ...(c.attrs?.link ? { link: c.attrs.link } : {}),
      ...(detail && c.geometry
        ? {
            x: c.geometry.x,
            y: c.geometry.y,
            width: c.geometry.width,
            height: c.geometry.height,
            style: styleToString(c.style)
          }
        : {})
    }))
  const connections = cells
    .filter((c) => c.edge)
    .map((c) => {
      const label = [diagramLabel(c), ...cells.filter((l) => l.parent === c.id).map(diagramLabel)]
        .filter(Boolean)
        .join(' ')
      return { id: c.id, from: c.source, to: c.target, ...(label ? { label } : {}) }
    })
  return { shapes, connections }
}

function base64(bytes: Uint8Array): string {
  let text = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(text)
}

async function renderPng(graph: Graph, scale: number): Promise<DiagramRenderResult> {
  if (graph.getDefaultParent().getChildCount() === 0) {
    return { png: '', width: 0, height: 0, empty: true }
  }
  const rendered = renderSvg(graph, { html: false, background: tokenColor('--background', '#fff') })
  const fit = Math.min(scale, MAX_RENDER_WIDTH / rendered.width)
  const png = await pngBytes(rendered, fit)
  return {
    png: base64(png),
    width: Math.round(rendered.width * fit),
    height: Math.round(rendered.height * fit),
    empty: false
  }
}

export async function runDiagramWork(work: DiagramWorkRequest): Promise<unknown> {
  switch (work.kind) {
    case 'shapes':
      return catalogue()
    case 'read':
      return withDiagram(work.xml, (graph) => readRows(graph, work.detail))
    case 'edit':
      return withDiagram(work.xml, (graph) => applyAgentEdit(graph, work.edit))
    case 'render':
      return withDiagram(work.xml, (graph) => renderPng(graph, work.scale))
  }
}
