// ActiveCollab draws <p> with no margin; its own editor separates paragraphs with an empty one.
const BLOCK = 'p|ul|ol|blockquote|pre|h[1-6]'
const BETWEEN_BLOCKS = new RegExp(`(</(?:${BLOCK})>)\\s*(?=<(?:${BLOCK})[\\s>])`, 'gi')
const EMPTY_BEFORE = /<p>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>$/i
const EMPTY_AFTER = /^<p>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>/i
const SPACER = '<p>&nbsp;</p>'

/** Adds ActiveCollab's blank-paragraph spacer between blocks that don't already have one. */
export function spaceParagraphsForActiveCollab(html: string): string {
  return html.replace(BETWEEN_BLOCKS, (match: string, close: string, offset: number) => {
    const before = html.slice(0, offset + close.length)
    const after = html.slice(offset + match.length)
    return EMPTY_BEFORE.test(before) || EMPTY_AFTER.test(after) ? match : close + SPACER
  })
}
