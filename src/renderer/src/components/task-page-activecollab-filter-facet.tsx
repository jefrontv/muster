// One multi-select facet of the My Work filter bar. Labels and projects differ only in where their
// options come from, so they share this and stay identical to look at and to drive.
//
// Command inside Popover with `shouldFilter={false}`: the caller has already decided which options
// exist, and cmdk's own fuzzy pass on top of that produced two competing notions of "matching".
// Chrome mirrors ui/repo-multi-combobox — Check icon for state, no invented "selected" tint.

import React, { useMemo, useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'

export type ActiveCollabFilterOption = {
  value: string
  label: string
  /** Rendered in place of the plain text, so a label carries the same chip it wears on a row. */
  chip?: React.ReactNode
}

/** Both facets derive their options from the loaded rows, which a long assignment list can make
 *  large; the search field is how the user reaches past this cap. */
const MAX_VISIBLE_OPTIONS = 40

export function ActiveCollabFilterFacet({
  emptyText,
  label,
  onToggle,
  options,
  searchPlaceholder,
  selected
}: {
  emptyText: string
  label: string
  onToggle: (value: string) => void
  options: readonly ActiveCollabFilterOption[]
  searchPlaceholder: string
  selected: readonly string[]
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const pool = needle
      ? options.filter((option) => option.label.toLowerCase().includes(needle))
      : options
    return pool.slice(0, MAX_VISIBLE_OPTIONS)
  }, [options, query])

  const handleOpenChange = (next: boolean): void => {
    setOpen(next)
    if (!next) {
      setQuery('')
    }
  }

  // `combobox` takes no name from its contents, so the visible label has to be repeated as an
  // author-supplied one or the control announces as an unnamed combo box. The selected count goes
  // in with it: a collapsed facet's only signal that it is still narrowing the list is that digit.
  const triggerName =
    selected.length > 0
      ? translate(
          'auto.components.activecollab.my_work.facet_selected',
          '{{value0}}, {{value1}} selected',
          { value0: label, value1: selected.length }
        )
      : label

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={triggerName}
          className="h-7 shrink-0 gap-1.5 px-2 text-[11px] font-normal"
        >
          <span className="truncate">{label}</span>
          {/* aria-hidden: the count is already in the trigger's accessible name above, and a bare
              digit read out after the label says nothing on its own. */}
          {selected.length > 0 ? (
            <span
              aria-hidden="true"
              className="rounded-full bg-accent px-1.5 tabular-nums text-accent-foreground"
            >
              {selected.length}
            </span>
          ) : null}
          <ChevronsUpDown className="size-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(280px,calc(100vw-1rem))] min-w-[var(--radix-popover-trigger-width)] p-0"
      >
        {/* cmdk owns the input's `aria-labelledby`, so the field is named through the Command
            root's label rather than an `aria-label` the primitive would override. */}
        <Command shouldFilter={false} label={searchPlaceholder}>
          <CommandInput
            autoFocus
            placeholder={searchPlaceholder}
            value={query}
            onValueChange={setQuery}
            className="text-xs"
          />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            {matches.map((option) => (
              <CommandItem
                key={option.value}
                value={option.value}
                onSelect={() => onToggle(option.value)}
                className="items-center gap-2 px-3 py-1.5 text-xs"
              >
                <Check
                  className={cn(
                    'size-3 shrink-0 text-muted-foreground',
                    selected.includes(option.value) ? 'opacity-70' : 'opacity-0'
                  )}
                />
                <span className="flex min-w-0 flex-1 truncate">{option.chip ?? option.label}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
