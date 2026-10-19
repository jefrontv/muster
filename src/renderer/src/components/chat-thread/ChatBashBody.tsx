import type React from 'react'
import { cn } from '@/lib/utils'
import { bashModel } from './chat-bash-model'
import type { ChatToolBodyProps } from './chat-tool-body-types'

export function ChatBashBody({ item }: ChatToolBodyProps): React.JSX.Element {
  const bash = bashModel(item)
  const output = [bash.stdout, bash.stderr].filter(Boolean).join('\n')
  return (
    <div className="overflow-hidden rounded-md border border-border font-mono text-xs leading-5">
      <pre className="whitespace-pre-wrap break-all px-3 py-2">
        <span className="select-none text-muted-foreground">$ </span>
        {bash.command}
      </pre>
      {output && (
        <pre
          className={cn(
            'max-h-64 overflow-auto whitespace-pre-wrap break-all border-t border-border px-3 py-2 text-muted-foreground',
            bash.isError && 'text-destructive'
          )}
        >
          {output}
        </pre>
      )}
    </div>
  )
}
