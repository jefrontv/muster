// The plan itself: read-and-mark rendering, with every block tagged by its source lines.
//
// Why not reuse MarkdownPreview: that component is bound to a real worktree file (sourceFileId,
// sourceWorktreeId) and keys its notes by worktree + path. A plan handed over by an agent may live
// anywhere, or nowhere. This renders the same markdown flavour with the anchoring a review needs
// and none of the file-model coupling.

import type React from 'react'
import { forwardRef, useMemo } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import { LINE_END_ATTRIBUTE, LINE_START_ATTRIBUTE } from './plan-annotation-notes'

type MarkdownNode = { position?: { start?: { line?: number }; end?: { line?: number } } }

/**
 * Tags a block with its source range so a text selection resolves back to plan lines.
 *
 * react-markdown hands the mdast node to every component, and only block nodes carry a reliable
 * position — which is the granularity a reviewer selects at anyway.
 */
function anchor(node: unknown): Record<string, string> {
  const position = (node as MarkdownNode | undefined)?.position
  const start = position?.start?.line
  if (typeof start !== 'number') {
    return {}
  }
  return {
    [LINE_START_ATTRIBUTE]: String(start),
    [LINE_END_ATTRIBUTE]: String(position?.end?.line ?? start)
  }
}

// Why extend the schema: rehype-highlight emits class names on <code>/<span>, and the default
// sanitiser strips them — leaving code blocks rendered but uncoloured.
const SCHEMA = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code ?? []), ['className']],
    span: [...(defaultSchema.attributes?.span ?? []), ['className']],
    '*': [...(defaultSchema.attributes?.['*'] ?? []), LINE_START_ATTRIBUTE, LINE_END_ATTRIBUTE]
  }
}

export const PlanAnnotationDocument = forwardRef<HTMLDivElement, { content: string }>(
  function PlanAnnotationDocument({ content }, ref): React.JSX.Element {
    const components = useMemo(() => {
      const block =
        (Tag: keyof React.JSX.IntrinsicElements) =>
        ({ node, ...props }: { node?: unknown }) => {
          const Element = Tag as React.ElementType
          return <Element {...props} {...anchor(node)} />
        }
      return {
        p: block('p'),
        li: block('li'),
        h1: block('h1'),
        h2: block('h2'),
        h3: block('h3'),
        h4: block('h4'),
        pre: block('pre'),
        blockquote: block('blockquote'),
        tr: block('tr')
      }
    }, [])

    return (
      <div ref={ref} className="plan-annotation-document">
        <Markdown
          remarkPlugins={[remarkGfm]}
          // Sanitise after raw: plans are agent-authored, so inline HTML renders but cannot bring
          // script or event handlers into the app's own renderer.
          rehypePlugins={[rehypeRaw, [rehypeSanitize, SCHEMA], rehypeHighlight]}
          components={components}
        >
          {content}
        </Markdown>
      </div>
    )
  }
)
