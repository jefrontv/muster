import { Node, mergeAttributes } from '@tiptap/core'

// Why: @tiptap/markdown has no handler for marked's `escape` token, so `\[` or `\*` lost its
// character on load. An atom (not a mark) keeps each backslash exact, since marks merge.
export const RichMarkdownEscape = Node.create({
  name: 'markdownEscape',
  inline: true,
  group: 'inline',
  atom: true,
  selectable: false,

  addAttributes() {
    return { char: { default: '', rendered: false } }
  },

  markdownTokenName: 'escape',
  parseMarkdown: (token, helpers) =>
    helpers.createNode('markdownEscape', {
      char: typeof token.raw === 'string' ? token.raw.slice(1) : (token.text ?? '')
    }),
  renderMarkdown: (node) => `\\${node.attrs?.char ?? ''}`,
  renderText: ({ node }) => String(node.attrs.char ?? ''),

  parseHTML() {
    return [
      {
        tag: 'span[data-markdown-escape]',
        getAttrs: (element: HTMLElement) => ({ char: element.textContent ?? '' })
      }
    ]
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, { 'data-markdown-escape': '', contenteditable: 'false' }),
      String(node.attrs.char ?? '')
    ]
  }
})
