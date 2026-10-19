import type React from 'react'
import type Markdown from 'react-markdown'
import { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeHighlight from 'rehype-highlight'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import { isTrustedCompactImageSrc } from '@/components/sidebar/comment-markdown-element-renderers'

type MarkdownProps = React.ComponentProps<typeof Markdown>

// Same allowances CommentMarkdown gives agent replies: GitHub-style raw HTML, file links, inline images.
const chatSanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), 'details', 'summary', 'sub', 'sup', 'ins', 'kbd'],
  attributes: {
    ...defaultSchema.attributes,
    a: [...(defaultSchema.attributes?.a ?? []), 'href', 'title'],
    details: [...(defaultSchema.attributes?.details ?? []), 'open'],
    img: [...(defaultSchema.attributes?.img ?? []), 'src', 'alt', 'title', 'width', 'height'],
    input: [...(defaultSchema.attributes?.input ?? []), 'type', 'checked', 'disabled'],
    td: [...(defaultSchema.attributes?.td ?? []), 'align'],
    th: [...(defaultSchema.attributes?.th ?? []), 'align']
  },
  protocols: {
    ...defaultSchema.protocols,
    href: [...(defaultSchema.protocols?.href ?? []), 'file'],
    src: [...(defaultSchema.protocols?.src ?? []), 'data', 'blob']
  }
}

// No remark-breaks: model prose wraps single newlines as soft breaks. Highlight runs after sanitize.
export const chatRemarkPlugins: NonNullable<MarkdownProps['remarkPlugins']> = [remarkGfm]
export const chatRehypePlugins: NonNullable<MarkdownProps['rehypePlugins']> = [
  rehypeRaw,
  [rehypeSanitize, chatSanitizeSchema],
  rehypeHighlight
]

export const chatUrlTransform: NonNullable<MarkdownProps['urlTransform']> = (value, key, node) => {
  if (key === 'href' && node?.tagName === 'a' && value.trim().toLowerCase().startsWith('file:')) {
    return value
  }
  if (key === 'src' && node?.tagName === 'img' && isTrustedCompactImageSrc(value)) {
    return value
  }
  return defaultUrlTransform(value)
}
