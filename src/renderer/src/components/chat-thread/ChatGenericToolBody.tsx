import type React from 'react'
import { cn } from '@/lib/utils'
import type { ChatToolBodyProps } from './chat-tool-body-types'

const inputText = (input: unknown): string => {
  if (input === undefined || input === null) {
    return ''
  }
  try {
    return JSON.stringify(input, null, 2)
  } catch {
    return String(input)
  }
}

/** Any tool without its own renderer: the arguments it got and what it returned. */
export function ChatGenericToolBody({ item }: ChatToolBodyProps): React.JSX.Element {
  const input = inputText(item.input)
  const output = item.result?.text ?? ''
  return (
    <div className="overflow-hidden rounded-md border border-border font-mono text-xs leading-5">
      {input && input !== '{}' && (
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all px-3 py-2">
          {input}
        </pre>
      )}
      {output && (
        <pre
          className={cn(
            'max-h-64 overflow-auto whitespace-pre-wrap break-all border-t border-border px-3 py-2 text-muted-foreground first:border-t-0',
            item.status === 'error' && 'text-destructive'
          )}
        >
          {output}
        </pre>
      )}
    </div>
  )
}
