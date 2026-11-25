import { Mark, mergeAttributes } from '@tiptap/core'

const NAMES = ['markdownEscape', 'markdownEscapeNext'] as const
let parsedEscapes = 0

function createEscapeMark(name: (typeof NAMES)[number]) {
  return Mark.create({
    name,
    inclusive: false,
    // Code-typed so the serializer writes the character as is (\& not \&amp;).
    code: true,
    // Why: the serializer only reopens a mark when its type changes, so neighbouring escapes
    // alternate between two types to keep one backslash per character.
    ...(name === NAMES[0]
      ? {
          markdownTokenName: 'escape',
          parseMarkdown: (token, helpers) => {
            parsedEscapes += 1
            return helpers.applyMark(NAMES[parsedEscapes % 2], [
              { type: 'text', text: (token.raw ?? '').slice(1) }
            ])
          }
        }
      : {}),
    renderMarkdown: (node, h) => `\\${h.renderChildren(node.content ?? [])}`,

    parseHTML() {
      return [{ tag: `span[data-${name}]` }]
    },

    renderHTML({ HTMLAttributes }) {
      return ['span', mergeAttributes(HTMLAttributes, { [`data-${name}`]: '' }), 0]
    }
  })
}

// Why: @tiptap/markdown has no handler for marked's `escape` token, so `\[` or `\*` lost its
// character on load. A mark keeps the character as text inside links and emphasis, and the
// serializer writes the backslash back on save.
export const RichMarkdownEscapes = NAMES.map(createEscapeMark)
