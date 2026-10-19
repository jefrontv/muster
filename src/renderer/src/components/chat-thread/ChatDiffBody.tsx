import { useState } from 'react'
import type React from 'react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { DiffRow } from './chat-diff-rows'
import { toolDiffModel } from './chat-tool-diff-model'
import type { ChatToolBodyProps } from './chat-tool-body-types'

const LINE_TINT = {
  add: 'bg-[color-mix(in_srgb,var(--git-decoration-added)_10%,transparent)]',
  del: 'bg-[color-mix(in_srgb,var(--git-decoration-deleted)_10%,transparent)]',
  ctx: ''
} as const

const WORD_TINT = {
  add: 'bg-[color-mix(in_srgb,var(--git-decoration-added)_28%,transparent)]',
  del: 'bg-[color-mix(in_srgb,var(--git-decoration-deleted)_28%,transparent)]',
  ctx: ''
} as const

function DiffLine(props: { row: DiffRow; numbered: boolean }): React.JSX.Element {
  const { row } = props
  if (row.kind === 'hunk') {
    return <div className="px-3 text-muted-foreground">{props.numbered ? row.header : '⋯'}</div>
  }
  const sign = row.type === 'add' ? '+' : row.type === 'del' ? '-' : ' '
  return (
    <div className={cn('flex px-3', LINE_TINT[row.type])}>
      {props.numbered && (
        <span className="w-10 shrink-0 select-none pr-2 text-right text-muted-foreground tabular-nums">
          {row.newNo ?? row.oldNo}
        </span>
      )}
      <span className="w-3 shrink-0 select-none text-muted-foreground">{sign}</span>
      <span className="min-w-0 whitespace-pre-wrap break-all">
        {row.segments.map((segment, index) => (
          <span key={index} className={segment.changed ? WORD_TINT[row.type] : undefined}>
            {segment.text}
          </span>
        ))}
      </span>
    </div>
  )
}

export function ChatDiffBody({ item }: ChatToolBodyProps): React.JSX.Element | null {
  const [expanded, setExpanded] = useState(false)
  const model = toolDiffModel(item, expanded)
  if (!model) {
    return null
  }
  return (
    <div className="overflow-hidden rounded-md border border-border font-mono text-xs leading-5">
      <div className="py-1">
        {model.rows.map((row) => (
          <DiffLine key={row.key} row={row} numbered={!model.live} />
        ))}
      </div>
      {model.hiddenLines > 0 && (
        <button
          type="button"
          className="w-full border-t border-border px-3 py-1 text-left font-sans text-muted-foreground hover:bg-accent"
          onClick={() => setExpanded(true)}
        >
          {translate('components.chat-thread.showMoreLines', 'Show {{count}} more lines', {
            count: model.hiddenLines
          })}
        </button>
      )}
    </div>
  )
}
