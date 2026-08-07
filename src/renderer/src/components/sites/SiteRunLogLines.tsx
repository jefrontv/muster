// One renderer for import/deploy log lines, shared by the run console and the sidebar tails.
// Status lines read as stage headers, errors carry a red bar, success confirmations tint green,
// and every line gets a dim time gutter — a multi-minute run becomes scannable instead of a wall.

import type React from 'react'
import type { SiteRunLogLine } from '../../../../shared/site-run-types'
import { cn } from '@/lib/utils'

/** Cosmetic only: confirmations the pipelines print. Wrong matches cost nothing but a green tint. */
const SUCCESS_PATTERN = /\b(success|succeeded|successfully|complete[d]?)\b/i

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false
})

export function SiteRunLogLines({ lines }: { lines: SiteRunLogLine[] }): React.JSX.Element {
  return (
    <div className="space-y-px">
      {lines.map((line, index) => {
        const isStatus = line.level === 'status'
        const isError = line.level === 'error'
        const isSuccess = !isError && !isStatus && SUCCESS_PATTERN.test(line.text)
        return (
          <div
            key={`${line.at}-${index}`}
            className={cn(
              'flex gap-2 rounded-sm px-1 py-px',
              isStatus && index > 0 && 'mt-2',
              isError && 'border-l-2 border-destructive/70 bg-destructive/10'
            )}
          >
            <span className="select-none pt-px text-[10px] tabular-nums text-muted-foreground/50">
              {timeFormatter.format(line.at)}
            </span>
            <span
              className={cn(
                'min-w-0 flex-1 whitespace-pre-wrap break-words',
                isStatus && 'font-semibold text-foreground',
                isError && 'text-destructive',
                isSuccess && 'text-emerald-500/90',
                !isStatus && !isError && !isSuccess && 'text-muted-foreground'
              )}
            >
              {isStatus ? (
                <span aria-hidden="true" className="mr-1.5 text-primary">
                  ▸
                </span>
              ) : null}
              {line.text}
            </span>
          </div>
        )
      })}
    </div>
  )
}
