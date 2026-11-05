/** Flattens Markdown to plain text for one-line previews (titles, list snippets); not a renderer. */
export function markdownPreviewText(text: string): string {
  return (
    text
      // Fenced code: keep the code, drop the fences.
      .replace(/```[^\n]*\n?/g, '')
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/^\s{0,3}#{1,6}\s+/gm, '')
      .replace(/^\s{0,3}>\s?/gm, '')
      .replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, '')
      .replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, '$2')
      .replace(/(?<![\w*])([*_])(?=\S)([^*_\n]*?\S)\1(?![\w*])/g, '$2')
      .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\s+/g, ' ')
      .trim()
  )
}
