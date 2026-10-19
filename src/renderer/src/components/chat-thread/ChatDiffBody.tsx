import { useState } from 'react'
import type React from 'react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { detectLanguage } from '@/lib/language-detect'
import { diffRowsText, type DiffRow } from './chat-diff-rows'
import { toolDiffModel } from './chat-tool-diff-model'
import type { ChatToolBodyProps } from './chat-tool-body-types'
import { displayPath, inputText } from './chat-tool-input'
import { useChatThreadContext } from './chat-thread-context'
import { ChatDiffBanner } from './ChatDiffBanner'

const LINE_TONE = {
  add: 'bg-chat-diff-added-tint text-chat-diff-added shadow-[inset_3px_0_0_var(--chat-diff-added)]',
  del: 'bg-chat-diff-deleted-tint text-chat-diff-deleted shadow-[inset_3px_0_0_var(--chat-diff-deleted)]',
  ctx: 'text-chat-ink-secondary'
} as const

const WORD_TINT = {
  add: 'rounded-[2px] bg-[color-mix(in_srgb,var(--chat-diff-added)_24%,transparent)]',
  del: 'rounded-[2px] bg-[color-mix(in_srgb,var(--chat-diff-deleted)_24%,transparent)]',
  ctx: ''
} as const

const SIGN = { add: '+ ', del: '- ', ctx: '  ' } as const

function DiffLine(props: { row: DiffRow; numbered: boolean; wrapped: boolean }): React.JSX.Element {
  const { row } = props
  if (row.kind === 'hunk') {
    return (
      <div className="whitespace-pre px-[22px] text-chat-ink-tertiary">
        {props.numbered ? row.header : '⋯'}
      </div>
    )
  }
  return (
    <div
      className={cn('flex min-h-[19px] px-[22px]', LINE_TONE[row.type])}
      data-diff-line={row.type}
    >
      {props.numbered && (
        <span className="w-[3.5em] shrink-0 select-none pr-3 text-right tabular-nums text-chat-ink-tertiary">
          {row.newNo ?? row.oldNo}
        </span>
      )}
      <span className="shrink-0 select-none whitespace-pre">{SIGN[row.type]}</span>
      <span
        className={cn(
          'min-w-0',
          props.wrapped ? 'whitespace-pre-wrap [overflow-wrap:anywhere]' : 'whitespace-pre'
        )}
      >
        {row.segments.map((segment, index) => (
          <span key={index} className={segment.changed ? WORD_TINT[row.type] : undefined}>
            {segment.text}
          </span>
        ))}
      </span>
    </div>
  )
}

/** Edit, MultiEdit and Write: a code card with a banner and a reversible middle fold. */
export function ChatDiffBody({ item }: ChatToolBodyProps): React.JSX.Element | null {
  const { cwd } = useChatThreadContext()
  const [expanded, setExpanded] = useState(false)
  const [wrapped, setWrapped] = useState(false)
  const model = toolDiffModel(item, expanded)
  if (!model) {
    return null
  }
  const path = inputText(item.input, 'file_path') ?? ''
  const language = path ? detectLanguage(path) : 'plaintext'
  const numbered = !model.live
  const line = (row: DiffRow): React.JSX.Element => (
    <DiffLine key={row.key} row={row} numbered={numbered} wrapped={wrapped} />
  )
  return (
    <div className="my-1 ml-1 overflow-hidden rounded-[16px] bg-chat-code font-mono text-[11px] leading-[19px]">
      <ChatDiffBanner
        fileName={path.split(/[\\/]/).at(-1) ?? ''}
        title={path ? displayPath(path, cwd) : ''}
        language={language === 'plaintext' ? null : language}
        wrapped={wrapped}
        onWrapChange={setWrapped}
        copyText={() => diffRowsText(model.all)}
      />
      <div
        className={cn(
          'scrollbar-sleek grid overflow-x-auto pb-5 pt-1.5',
          wrapped ? 'grid-cols-[minmax(0,1fr)]' : 'grid-cols-[minmax(max-content,1fr)]'
        )}
      >
        {model.head.map(line)}
        {model.foldedLines > 0 && (
          <button
            type="button"
            aria-expanded={expanded}
            className="block w-full px-[22px] text-left text-chat-ink-tertiary transition-colors duration-100 ease-chat hover:text-chat-ink-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-chat-accent motion-reduce:transition-none"
            onClick={() => setExpanded((open) => !open)}
          >
            {expanded
              ? translate('components.chat-thread.showFewerLines', 'Show fewer lines')
              : translate('components.chat-thread.showMoreLines', 'Show {{count}} more lines', {
                  count: model.foldedLines
                })}
          </button>
        )}
        {model.tail.map(line)}
      </div>
    </div>
  )
}
