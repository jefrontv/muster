// Searchable single-select over the instance's ActiveCollab projects.
//
// Searchable is not a nicety: the target instance returns 60 projects and every self-hosted
// ActiveCollab of any age looks like that, so an unfiltered dropdown is a scroll-hunt. Filtering is
// manual (`shouldFilter={false}`) rather than cmdk's built-in matcher because project names are not
// unique on this API — two live projects can share a name, and cmdk keys items by their `value`
// string, which would make one of the pair unselectable.
//
// Presentational: the caller owns the fetch, so the same list can be verified on mount for a bound
// project and lazily loaded when an unbound user first opens the picker.
import React, { useCallback, useMemo, useRef, useState } from 'react'
import { Check, ChevronsUpDown, LoaderCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Command, CommandInput, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { ActiveCollabProject } from '../../../shared/activecollab-types'

type ActiveCollabProjectPickerProps = {
  projects: readonly ActiveCollabProject[] | null
  loading: boolean
  errorMessage: string | null
  selectedProjectId: number | null
  label: string
  triggerClassName?: string
  onOpen: () => void
  onSelect: (project: ActiveCollabProject) => void
}

/**
 * Open projects first: a completed project is still bindable — an old one can outlive its tasks —
 * but it is never what someone is reaching for, so it sinks below the live ones rather than
 * disappearing. Name then id keeps the order total, so a refetch cannot reshuffle equal rows.
 */
function compareProjects(a: ActiveCollabProject, b: ActiveCollabProject): number {
  if (a.isCompleted !== b.isCompleted) {
    return a.isCompleted ? 1 : -1
  }
  const name = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  return name === 0 ? a.id - b.id : name
}

export function ActiveCollabProjectPicker({
  projects,
  loading,
  errorMessage,
  selectedProjectId,
  label,
  triggerClassName,
  onOpen,
  onSelect
}: ActiveCollabProjectPickerProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [commandValue, setCommandValue] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)
  const focusFrameRef = useRef<number | null>(null)

  const cancelFocusFrame = useCallback((): void => {
    if (focusFrameRef.current !== null) {
      cancelAnimationFrame(focusFrameRef.current)
      focusFrameRef.current = null
    }
  }, [])

  const setInputNode = useCallback(
    (node: HTMLInputElement | null): void => {
      if (node === null) {
        cancelFocusFrame()
      }
      inputRef.current = node
    },
    [cancelFocusFrame]
  )

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen)
      if (!nextOpen) {
        cancelFocusFrame()
        setQuery('')
        return
      }
      onOpen()
    },
    [cancelFocusFrame, onOpen]
  )

  const filtered = useMemo(() => {
    const sorted = [...(projects ?? [])].sort(compareProjects)
    const needle = query.trim().toLowerCase()
    return needle ? sorted.filter((project) => project.name.toLowerCase().includes(needle)) : sorted
  }, [projects, query])

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          role="combobox"
          aria-expanded={open}
          className={cn('h-7 justify-between gap-2 px-2 text-xs font-normal', triggerClassName)}
        >
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] min-w-[18rem] p-0"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          cancelFocusFrame()
          focusFrameRef.current = requestAnimationFrame(() => {
            focusFrameRef.current = null
            inputRef.current?.focus()
          })
        }}
      >
        <Command shouldFilter={false} value={commandValue} onValueChange={setCommandValue}>
          <CommandInput
            ref={setInputNode}
            value={query}
            onValueChange={setQuery}
            placeholder={translate(
              'auto.components.activecollab.project_binding.search',
              'Search ActiveCollab projects...'
            )}
          />
          <CommandList className="max-h-72">
            {errorMessage ? (
              <p className="px-3 py-6 text-center text-xs text-destructive">{errorMessage}</p>
            ) : null}
            {!errorMessage && loading && filtered.length === 0 ? (
              <div className="flex items-center justify-center py-6">
                <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
              </div>
            ) : null}
            {!errorMessage && !loading && filtered.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                {translate(
                  'auto.components.activecollab.project_binding.no_matches',
                  'No ActiveCollab projects match your search.'
                )}
              </p>
            ) : null}
            {filtered.map((project) => (
              <button
                key={project.id}
                type="button"
                role="option"
                aria-selected={project.id === selectedProjectId}
                onMouseEnter={() => setCommandValue(String(project.id))}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onSelect(project)
                  setOpen(false)
                }}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-accent hover:text-accent-foreground',
                  commandValue === String(project.id) && 'bg-accent text-accent-foreground'
                )}
              >
                <Check
                  className={cn(
                    'size-3 shrink-0 text-foreground',
                    project.id === selectedProjectId ? 'opacity-100' : 'opacity-0'
                  )}
                />
                <span className="min-w-0 flex-1 truncate">{project.name}</span>
                {project.isCompleted ? (
                  <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {translate(
                      'auto.components.activecollab.project_binding.completed',
                      'Completed'
                    )}
                  </span>
                ) : null}
              </button>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
