// Syntax colour for diff lines: lowlight tokens rendered as spans, coloured by
// the same hljs theme the markdown preview uses (markdown-light / -dark).

import type React from 'react'
import { createLowlight, common } from 'lowlight'
import { detectLanguage } from '@/lib/language-detect'
import { useAppStore } from '@/store'

const lowlight = createLowlight(common)

/** Monaco ids that hljs spells differently. */
const HLJS_NAMES: Record<string, string> = { html: 'xml', shell: 'bash', jsonl: 'json' }

export function highlightLanguageForPath(path: string | null): string | null {
  if (!path) {
    return null
  }
  const language = detectLanguage(path)
  const name = HLJS_NAMES[language] ?? language
  return lowlight.registered(name) ? name : null
}

type HastNode =
  | { type: 'text'; value: string }
  | { type: 'element'; properties?: { className?: unknown }; children: HastNode[] }
  | { type: string; children?: HastNode[]; value?: string }

function renderNodes(nodes: readonly HastNode[], keyPrefix: string): React.ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}${index}`
    if (node.type === 'text') {
      return (node as { value: string }).value
    }
    const children = renderNodes((node as { children?: HastNode[] }).children ?? [], `${key}.`)
    const className = (node as { properties?: { className?: unknown } }).properties?.className
    return (
      <span key={key} className={Array.isArray(className) ? className.join(' ') : undefined}>
        {children}
      </span>
    )
  })
}

/** One line (or fragment) of code; plain text when the language is unknown. */
export function HighlightedCode({
  text,
  language
}: {
  text: string
  language: string | null
}): React.JSX.Element {
  if (!language || text === '') {
    return <>{text}</>
  }
  try {
    return <>{renderNodes(lowlight.highlight(language, text).children as HastNode[], 'h')}</>
  } catch {
    return <>{text}</>
  }
}

/** Theme scope for hljs token colours, matching the markdown preview. */
export function useCodeThemeClass(): string {
  const theme = useAppStore((s) => s.settings?.theme)
  const dark =
    theme === 'dark' ||
    (theme !== 'light' && window.matchMedia?.('(prefers-color-scheme: dark)').matches === true)
  return dark ? 'markdown-dark' : 'markdown-light'
}
