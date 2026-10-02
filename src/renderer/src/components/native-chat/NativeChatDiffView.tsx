// Unified diff for one edit: line numbers, context, word-level highlights and
// syntax colour. Add/delete use the git-decoration tokens with a faint tint.

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { NativeChatPatchHunk } from '../../../../shared/native-chat-types'
import { diffRows, type NativeChatDiffRow } from './native-chat-diff-rows'
import {
  HighlightedCode,
  highlightLanguageForPath,
  useCodeThemeClass
} from './NativeChatHighlightedCode'

const ROW_TINT: Record<'add' | 'del' | 'ctx', string> = {
  add: 'bg-[color-mix(in_srgb,var(--git-decoration-added)_10%,transparent)]',
  del: 'bg-[color-mix(in_srgb,var(--git-decoration-deleted)_10%,transparent)]',
  ctx: ''
}
const WORD_TINT: Record<'add' | 'del' | 'ctx', string> = {
  add: 'bg-[color-mix(in_srgb,var(--git-decoration-added)_28%,transparent)]',
  del: 'bg-[color-mix(in_srgb,var(--git-decoration-deleted)_28%,transparent)]',
  ctx: ''
}
const MARK: Record<'add' | 'del' | 'ctx', string> = { add: '+', del: '−', ctx: ' ' }

function LineRow({
  row,
  numbered,
  language
}: {
  row: Extract<NativeChatDiffRow, { kind: 'line' }>
  numbered: boolean
  language: string | null
}): React.JSX.Element {
  return (
    <div className={cn('flex min-w-max', ROW_TINT[row.type])}>
      {numbered ? (
        <>
          <span className="w-9 shrink-0 select-none pr-1 text-right text-muted-foreground/60 tabular-nums">
            {row.oldNo ?? ''}
          </span>
          <span className="w-9 shrink-0 select-none pr-1 text-right text-muted-foreground/60 tabular-nums">
            {row.newNo ?? ''}
          </span>
        </>
      ) : null}
      <span
        className={cn(
          'w-4 shrink-0 select-none text-center',
          row.type === 'add' && 'text-[var(--git-decoration-added)]',
          row.type === 'del' && 'text-[var(--git-decoration-deleted)]'
        )}
      >
        {MARK[row.type]}
      </span>
      <span className="whitespace-pre pr-3">
        {row.segments.map((segment, index) => (
          <span key={index} className={cn(segment.changed && WORD_TINT[row.type], 'rounded-sm')}>
            <HighlightedCode text={segment.text} language={language} />
          </span>
        ))}
      </span>
    </div>
  )
}

export function NativeChatDiffView({
  hunks,
  numbered,
  path,
  truncated = false
}: {
  hunks: readonly NativeChatPatchHunk[]
  /** False when hunks came from the call's own strings (file offset unknown). */
  numbered: boolean
  path: string | null
  truncated?: boolean
}): React.JSX.Element {
  const rows = useMemo(() => diffRows(hunks), [hunks])
  const language = useMemo(() => highlightLanguageForPath(path), [path])
  const themeClass = useCodeThemeClass()
  return (
    <div
      className={cn(
        'max-h-96 overflow-auto rounded-md border border-border/60 bg-muted/30 py-1 font-mono text-[11px] leading-[1.6] scrollbar-sleek',
        themeClass
      )}
    >
      {rows.map((row) =>
        row.kind === 'hunk' ? (
          <div key={row.key} className="px-2 text-muted-foreground/70">
            {row.header}
          </div>
        ) : (
          <LineRow key={row.key} row={row} numbered={numbered} language={language} />
        )
      )}
      {truncated ? (
        <div className="px-2 pt-1 text-muted-foreground">
          {translate('components.native-chat.diff.truncated', 'Diff shortened')}
        </div>
      ) : null}
    </div>
  )
}
