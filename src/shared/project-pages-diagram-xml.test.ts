import { describe, expect, it } from 'vitest'
import { diagramLabel, diagramOutlineText } from './project-pages-diagram-outline'
import { styleToString, writeDiagramXml, type DiagramCell } from './project-pages-diagram-xml'

const base: DiagramCell[] = [{ id: '0' }, { id: '1', parent: '0' }]
const box = (id: string, value: string, parent = '1'): DiagramCell => ({
  id,
  value,
  vertex: true,
  parent,
  style: { baseStyleNames: ['rounded'], whiteSpace: 'wrap', html: 1 },
  geometry: { x: 10, y: 20, width: 120, height: 60 }
})

describe('draw.io writer', () => {
  it('writes style strings the way draw.io does', () => {
    expect(styleToString({ baseStyleNames: ['rhombus'], whiteSpace: 'wrap', html: 1 })).toBe(
      'rhombus;whiteSpace=wrap;html=1;'
    )
    expect(styleToString({ ignoreDefaultStyle: true, autoSize: true, rounded: false })).toBe(
      ';autosize=1;rounded=0;'
    )
  })

  it('writes cells, geometry, edge points, and UserObject attributes', () => {
    const cells: DiagramCell[] = [
      ...base,
      box('a', 'Start & "go"'),
      { ...box('b', 'Done'), attrs: { link: 'page:abc', tooltip: 'Last step' } },
      {
        id: 'e',
        edge: true,
        parent: '1',
        source: 'a',
        target: 'b',
        style: { edgeStyle: 'orthogonalEdgeStyle' },
        geometry: { x: 0, y: 0, width: 0, height: 0, relative: true, points: [{ x: 70, y: 100 }] }
      }
    ]
    const xml = writeDiagramXml(cells)
    expect(xml).toContain('<mxCell id="0"/><mxCell id="1" parent="0"/>')
    expect(xml).toContain('value="Start &amp; &quot;go&quot;"')
    expect(xml).toContain(
      '<UserObject label="Done" link="page:abc" tooltip="Last step" id="b"><mxCell style="rounded;'
    )
    expect(xml).toContain(
      '<mxGeometry relative="1" as="geometry"><Array as="points"><mxPoint x="70" y="100"/></Array></mxGeometry>'
    )
    expect(xml.startsWith('<mxGraphModel><root>')).toBe(true)
  })
})

describe('diagram outline', () => {
  it('strips HTML from labels', () => {
    expect(diagramLabel({ value: '<b>Plan</b><br>step&nbsp;1 &amp; 2' })).toBe('Plan step 1 & 2')
  })

  it('nests shapes under containers and lists labelled connections', () => {
    const cells: DiagramCell[] = [
      ...base,
      box('lane', 'Team'),
      box('a', 'Draft', 'lane'),
      box('b', ''),
      { id: 'e', edge: true, parent: '1', source: 'a', target: 'b' },
      { id: 'l', vertex: true, parent: 'e', value: 'yes', style: { baseStyleNames: ['edgeLabel'] } }
    ]
    expect(diagramOutlineText(cells)).toBe(
      'Shapes:\n- Team\n  - Draft\n- (rounded)\n\nConnections:\n- Draft → (rounded): yes'
    )
    expect(diagramOutlineText(base)).toBe('Empty diagram.')
  })
})
