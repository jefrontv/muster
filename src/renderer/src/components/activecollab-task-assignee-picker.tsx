// Searchable single-select over the instance's ActiveCollab user roster.
//
// Searchable is not a nicety: the target instance answers `/users` with 176 rows in one unpaginated
// response, so an unfiltered dropdown is a scroll-hunt. Filtering is manual (`shouldFilter={false}`)
// rather than cmdk's built-in matcher because display names are not unique on this API — two people
// can share one — and cmdk keys items by their `value` string, which would make one of a duplicate
// pair unselectable.
//
// Presentational: the caller owns the fetch, so the roster is paid for when the picker first opens
// rather than on every task selection.

import React, { useMemo, useState } from 'react'
import { Check, LoaderCircle, UserRoundX } from 'lucide-react'

import { Command, CommandInput, CommandList } from '@/components/ui/command'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type { ActiveCollabUser } from '../../../shared/activecollab-types'

export type ActiveCollabAssigneePickerListProps = {
  /** Null before the caller has fetched; an empty array is a roster that really is empty. */
  users: readonly ActiveCollabUser[] | null
  loading: boolean
  errorMessage: string | null
  /** The task's current `assigneeId`; null means nobody is assigned. */
  selectedUserId: number | null
  disabled: boolean
  /** Lets the popover shell defer focus to a frame after its open animation. */
  inputRef?: React.Ref<HTMLInputElement>
  /** An explicit null UNASSIGNS; the write layer must send the key, not omit it. */
  onSelect: (assigneeId: number | null) => void
}

const ROW_CLASS =
  'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50'

/** Name then id keeps the order total, so a refetch cannot reshuffle two people sharing a name. */
function compareUsers(a: ActiveCollabUser, b: ActiveCollabUser): number {
  const name = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  return name === 0 ? a.id - b.id : name
}

export function ActiveCollabAssigneePickerList({
  users,
  loading,
  errorMessage,
  selectedUserId,
  disabled,
  inputRef,
  onSelect
}: ActiveCollabAssigneePickerListProps): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [activeValue, setActiveValue] = useState('')

  const filtered = useMemo(() => {
    const sorted = [...(users ?? [])].sort(compareUsers)
    const needle = query.trim().toLowerCase()
    return needle ? sorted.filter((user) => user.name.toLowerCase().includes(needle)) : sorted
  }, [query, users])

  return (
    <Command shouldFilter={false} value={activeValue} onValueChange={setActiveValue}>
      <CommandInput
        ref={inputRef}
        value={query}
        onValueChange={setQuery}
        placeholder={translate(
          'auto.components.activecollab.task_workspace.search_people',
          'Search people...'
        )}
      />
      {/* Above the results and never filtered out: clearing the field is an action, not a candidate.
          Hidden when nobody is assigned, where it would write a no-op. */}
      {selectedUserId !== null ? (
        <div className="border-b border-border/60 py-1">
          <button
            type="button"
            disabled={disabled}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSelect(null)}
            className={cn(ROW_CLASS, 'text-muted-foreground')}
          >
            <UserRoundX className="size-3.5 shrink-0" />
            {translate('auto.components.activecollab.task_workspace.unassign', 'Unassign')}
          </button>
        </div>
      ) : null}
      <CommandList className="max-h-72">
        {errorMessage ? (
          <p role="alert" className="px-3 py-6 text-center text-xs text-destructive">
            {errorMessage}
          </p>
        ) : null}
        {!errorMessage && loading && filtered.length === 0 ? (
          <div className="flex items-center justify-center py-6">
            <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : null}
        {!errorMessage && !loading && filtered.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            {translate('auto.components.activecollab.task_workspace.no_people', 'No people match.')}
          </p>
        ) : null}
        {filtered.map((user) => (
          <button
            key={user.id}
            type="button"
            role="option"
            aria-selected={user.id === selectedUserId}
            disabled={disabled}
            onMouseEnter={() => setActiveValue(String(user.id))}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSelect(user.id)}
            className={cn(
              ROW_CLASS,
              activeValue === String(user.id) && 'bg-accent text-accent-foreground'
            )}
          >
            <Check
              className={cn(
                'size-3 shrink-0 text-foreground',
                user.id === selectedUserId ? 'opacity-100' : 'opacity-0'
              )}
            />
            <span className="min-w-0 flex-1 truncate">{user.name}</span>
          </button>
        ))}
      </CommandList>
    </Command>
  )
}
