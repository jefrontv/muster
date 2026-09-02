// The plan itself, rendered with every block tagged by its source lines.
//
// Why not reuse MarkdownPreview: that component is bound to a real worktree file (sourceFileId,
// sourceWorktreeId) and its note layer keys comments by worktree + path. A plan handed over by an
// agent may live anywhere, or nowhere. This renders the same markdown flavour with the anchoring
// this review needs and none of the file-model coupling.

import type React from 'react'
import { useMemo } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import { LINE_END_ATTRIBUTE, LINE_START_ATTRIBUTE } from './plan-annotation-notes'

type MarkdownNode = { position?: { start?: { line?: number }; end?: { line?: number } } }

/**
 * Tags a block with its source range so a text selection can be resolved back to plan lines.
 *
 * `react-markdown` hands the mdast node to every component, and only block nodes carry a reliable
 * position — which is exactly the granularity a reviewer selects at.
 */
function anchorProps(node: unknown): Record<string, string> {
  const position = (node as MarkdownNode | undefined)?.position
  const start = position?.start?.line
  const end = position?.end?.line ?? start
  if (typeof start !== 'number') {
    return {}
  }
  return {
    [LINE_START_ATTRIBUTE]: String(start),
    [LINE_END_ATTRIBUTE]: String(end ?? start)
  }
}

export function PlanAnnotationDocument({ content }: { content: string }): React.JSX.Element {
  const components = useMemo(
    () => ({
      p: ({ node, ...props }: { node?: unknown }) => <p {...props} {...anchorProps(node)} />,
      li: ({ node, ...props }: { node?: unknown }) => <li {...props} {...anchorProps(node)} />,
      h1: ({ node, ...props }: { node?: unknown }) => <h1 {...props} {...anchorProps(node)} />,
      h2: ({ node, ...props }: { node?: unknown }) => <h2 {...props} {...anchorProps(node)} />,
      h3: ({ node, ...props }: { node?: unknown }) => <h3 {...props} {...anchorProps(node)} />,
      h4: ({ node, ...props }: { node?: unknown }) => <h4 {...props} {...anchorProps(node)} />,
      pre: ({ node, ...props }: { node?: unknown }) => <pre {...props} {...anchorProps(node)} />,
      blockquote: ({ node, ...props }: { node?: unknown }) => (
        <blockquote {...props} {...anchorProps(node)} />
      ),
      tr: ({ node, ...props }: { node?: unknown }) => <tr {...props} {...anchorProps(node)} />
    }),
    []
  )

  return (
    <div className="prose prose-sm dark:prose-invert max-w-none px-1 [&_pre]:overflow-x-auto">
      <Markdown
        remarkPlugins={[remarkGfm]}
        // Why sanitize after raw: plans are agent-authored text, so inline HTML renders but cannot
        // introduce script or event handlers into the app's own renderer.
        rehypePlugins={[rehypeRaw, rehypeSanitize]}
        components={components}
      >
        {content}
      </Markdown>
    </div>
  )
}
