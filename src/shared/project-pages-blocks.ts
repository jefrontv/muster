// Every block a page can hold, as the markdown that produces it. Agents read this through the
// page_blocks tool; a round-trip test keeps each example identical after the editor saves it.

export type PageBlockExample = { block: string; markdown: string; note?: string }

export const PAGE_BLOCKS: PageBlockExample[] = [
  { block: 'Headings', markdown: '# Title\n\n## Section\n\n### Subsection' },
  {
    block: 'Inline styles',
    markdown: '**bold** *italic* ~~struck~~ `code` [link](https://example.com)'
  },
  { block: 'Bulleted list', markdown: '- one\n- two' },
  { block: 'Numbered list', markdown: '1. one\n2. two' },
  { block: 'Checklist', markdown: '- [ ] to do\n- [x] done' },
  { block: 'Quote', markdown: '> quoted text' },
  {
    block: 'Callout',
    markdown: '> [!NOTE] text',
    note: 'Kinds: NOTE, TIP, IMPORTANT, WARNING, CAUTION.'
  },
  { block: 'Divider', markdown: '---' },
  { block: 'Table', markdown: '| A | B |\n| --- | --- |\n| 1 | 2 |' },
  { block: 'Code', markdown: '```ts\nconst a = 1\n```' },
  {
    block: 'Diagram (Mermaid)',
    markdown: '```mermaid\nflowchart LR\n  A[Request] --> B{Approved?}\n  B -->|yes| C[Ship]\n```',
    note: 'Quick, read-only and kept in the text. Also sequenceDiagram, erDiagram, gantt, classDiagram, stateDiagram-v2. For a diagram people will rearrange, link or keep editing, make a diagram page instead (create_page with diagram: true, then edit_diagram); a [[link]] to it on its own line shows a live preview.'
  },
  { block: 'Math', markdown: 'Inline $x^2$ and a block:\n\n$$\nE = mc^2\n$$' },
  {
    block: 'Toggle',
    markdown: '<details>\n<summary>Title</summary>\n\nHidden text\n\n</details>'
  },
  {
    block: 'Image',
    markdown: '![diagram](files/1a2b3c4d-diagram.png)',
    note: 'attach_page_file returns a files/ path; https URLs work too.'
  },
  {
    block: 'Page link',
    markdown: '[[Page title]]',
    note: '[[Parent/Child]] or [[Title|label]]; saved as a muster-page:// link, or kept as [[Title]] until that page exists.'
  },
  { block: 'Tag', markdown: 'Text with a #tag' }
]
