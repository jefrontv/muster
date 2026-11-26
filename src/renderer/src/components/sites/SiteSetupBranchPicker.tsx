// Branch list for the Environment row: the Folder row's selectable-list look, with a filter once
// the remote has more branches than fit at a glance.

import { Check, GitBranch, Loader2, Search } from 'lucide-react'
import type React from 'react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { getSiteSetupReviewStrings } from './site-setup-review-strings'

const FILTER_THRESHOLD = 6

export function SiteSetupBranchPicker({
  id,
  options,
  value,
  linkBranch,
  defaultBranch,
  environment,
  loading,
  disabled,
  onSelect
}: {
  id: string
  options: string[]
  value: string
  linkBranch: string
  defaultBranch: string | null
  environment: string
  loading: boolean
  disabled: boolean
  onSelect: (branch: string) => void
}): React.JSX.Element {
  const strings = getSiteSetupReviewStrings()
  const [query, setQuery] = useState('')
  const needle = query.trim().toLowerCase()
  const shown = needle ? options.filter((name) => name.toLowerCase().includes(needle)) : options

  if (loading) {
    return (
      <p id={id} className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
        {strings.cloneBranchLoading}
      </p>
    )
  }

  return (
    <div id={id} className="overflow-hidden rounded-xl border border-border">
      {options.length > FILTER_THRESHOLD ? (
        <label className="flex items-center gap-2 border-b border-border px-2.5 py-1.5">
          <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={strings.cloneBranchFilter}
            aria-label={strings.cloneBranchFilter}
            spellCheck={false}
            className="h-6 min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
          />
        </label>
      ) : null}
      <div
        role="radiogroup"
        aria-label={strings.cloneBranchLabel}
        className="scrollbar-sleek max-h-52 divide-y divide-border overflow-y-auto"
      >
        {shown.map((name) => {
          const selected = name === value
          return (
            <button
              key={name}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onSelect(name)}
              className={cn(
                'flex w-full items-center gap-2.5 px-2.5 py-1.5 text-left hover:bg-accent/60 disabled:pointer-events-none',
                selected && 'bg-accent/40'
              )}
            >
              <Check className={cn('size-3.5 shrink-0', !selected && 'opacity-0')} aria-hidden />
              <GitBranch className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate font-mono text-xs">{name}</span>
              {name === linkBranch ? (
                <Badge variant="secondary" className="shrink-0">
                  {strings.cloneBranchFromLink.replace('{{environment}}', environment)}
                </Badge>
              ) : null}
              {name === defaultBranch ? (
                <Badge variant="muted" className="shrink-0">
                  {strings.cloneBranchDefaultBadge}
                </Badge>
              ) : null}
            </button>
          )
        })}
        {shown.length === 0 ? (
          <p className="px-2.5 py-2 text-xs text-muted-foreground">{strings.cloneBranchNoMatch}</p>
        ) : null}
      </div>
    </div>
  )
}
