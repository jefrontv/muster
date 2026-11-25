import { describe, expect, it } from 'vitest'
import { scanDiagramText } from './project-pages-diagram-text'

describe('scanDiagramText', () => {
  it('reads labels, connector labels and tooltips with their cell ids', () => {
    const xml =
      '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>' +
      '<mxCell id="a" value="&lt;b&gt;API&lt;/b&gt;&amp;nbsp;gateway" style="html=1" vertex="1" parent="1"><mxGeometry/></mxCell>' +
      '<UserObject id="b" label="Billing" tooltip="Owns invoices &amp;amp; refunds"><mxCell vertex="1" parent="1"/></UserObject>' +
      '<mxCell id="e" value="calls" edge="1" source="a" target="b" parent="1"/>' +
      '<mxCell id="el" value="retries" vertex="1" parent="e"/>' +
      '</root></mxGraphModel>'
    expect(scanDiagramText(xml)).toEqual([
      { shape: 'a', field: 'label', text: 'API gateway' },
      { shape: 'b', field: 'label', text: 'Billing' },
      { shape: 'b', field: 'tooltip', text: 'Owns invoices & refunds' },
      { shape: 'e', field: 'connector', text: 'calls' },
      { shape: 'e', field: 'connector', text: 'retries' }
    ])
  })
})
