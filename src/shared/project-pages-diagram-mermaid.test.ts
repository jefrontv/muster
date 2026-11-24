import { describe, expect, it } from 'vitest'
import { parseMermaidFlowchart } from './project-pages-diagram-mermaid'

describe('parseMermaidFlowchart', () => {
  it('reads direction, shapes, and labelled edges', () => {
    const chart = parseMermaidFlowchart(`flowchart LR
  A[Request] --> B{Approved?}
  B -->|yes| C([Ship it])
  B -- no --> D[(Backlog)]
  D -.-> A
  C ==> E((Done))`)
    expect(chart.direction).toBe('LR')
    expect(chart.nodes.map((n) => [n.id, n.label, n.shape])).toEqual([
      ['A', 'Request', 'rect'],
      ['B', 'Approved?', 'rhombus'],
      ['C', 'Ship it', 'stadium'],
      ['D', 'Backlog', 'cylinder'],
      ['E', 'Done', 'circle']
    ])
    expect(chart.edges.map((e) => [e.from, e.to, e.label, e.dashed, e.thick])).toEqual([
      ['A', 'B', undefined, false, false],
      ['B', 'C', 'yes', false, false],
      ['B', 'D', 'no', false, false],
      ['D', 'A', undefined, true, false],
      ['C', 'E', undefined, false, true]
    ])
  })

  it('handles chains, &, subgraphs, quotes, and skipped lines', () => {
    const chart = parseMermaidFlowchart(`graph TD
  %% a comment
  classDef hot fill:#f00
  subgraph team [Team "A"]
    X["Say [hi]"] --- Y
  end
  X & Y --> Z --> W
  style Z fill:#0f0`)
    expect(chart.direction).toBe('TB')
    expect(chart.groups).toEqual([{ id: 'team', label: 'Team "A"', parent: undefined }])
    expect(chart.nodes.find((n) => n.id === 'X')).toEqual({
      id: 'X',
      label: 'Say [hi]',
      shape: 'rect',
      group: 'team'
    })
    expect(chart.edges.map((e) => `${e.from}${e.end === 'none' ? '-' : '>'}${e.to}`)).toEqual([
      'X-Y',
      'X>Z',
      'Y>Z',
      'Z>W'
    ])
  })

  it('refuses other Mermaid diagrams', () => {
    expect(() => parseMermaidFlowchart('sequenceDiagram\n A->>B: hi')).toThrow(
      'Only Mermaid flowcharts'
    )
  })

  it('moves a node into the latest subgraph that mentions it', () => {
    const chart = parseMermaidFlowchart(`graph TD
  A --> C
  subgraph Outer
    C --> E
    subgraph Inner
      F
    end
    F --> G
  end`)
    const group = (id: string): string | undefined => chart.nodes.find((n) => n.id === id)?.group
    expect(group('A')).toBeUndefined()
    expect(group('C')).toBe('group1')
    expect(group('F')).toBe('group2')
    expect(group('G')).toBe('group1')
  })
})
