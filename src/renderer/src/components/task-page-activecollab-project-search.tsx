// Tasks-header project jump: icon expands into the same Command autocomplete
// the workspace dialog uses to bind an ActiveCollab project.

import { Search, X } from 'lucide-react'
import type React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActiveCollabProjectCommandList,
  useActiveCollabProjectCatalog,
  type ActiveCollabProjectPick
} from '@/components/activecollab-project-picker'
import { Button } from '@/components/ui/button'
import { Command, CommandInput } from '@/components/ui/command'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'

export function ActiveCollabProjectSearchControl({
  onSelect,
  excludedIds
}: {
  onSelect: (project: ActiveCollabProjectPick) => void
  excludedIds?: ReadonlySet<number>
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const ignoreDismissRef = useRef(false)
  const { projects } = useActiveCollabProjectCatalog(open)
  const label = translate(
    'auto.components.activecollab.task_list.search_projects',
    'Search projects'
  )

  useEffect(() => {
    if (!open) {
      return
    }
    const frame = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [open])

  const openSearch = useCallback(() => {
    ignoreDismissRef.current = true
    setOpen(true)
    // Why: the opening click is still bubbling when Popover mounts; Radix
    // treats it as pointer-down-outside and would slam the field shut.
    window.setTimeout(() => {
      ignoreDismissRef.current = false
    }, 0)
  }, [])

  const handleOpenChange = useCallback((next: boolean) => {
    if (!next && ignoreDismissRef.current) {
      return
    }
    setOpen(next)
  }, [])

  const handleSelect = useCallback(
    (project: ActiveCollabProjectPick) => {
      onSelect(project)
      setOpen(false)
    },
    [onSelect]
  )

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <div className="flex items-center">
        {open ? (
          <Command className="overflow-visible bg-transparent">
            <PopoverAnchor asChild>
              <div className="flex w-56 items-center overflow-hidden rounded-md border border-border bg-popover shadow-xs animate-in fade-in slide-in-from-right-2">
                <CommandInput
                  ref={inputRef}
                  wrapperClassName="min-w-0 flex-1 border-0 bg-transparent py-0"
                  className="h-7 py-0 text-xs"
                  iconClassName="h-3.5 w-3.5"
                  placeholder={translate(
                    'auto.components.chat.workspaceDialog.acProjectSearch',
                    'Search projects…'
                  )}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="mr-0.5"
                  aria-label={translate(
                    'auto.components.activecollab.task_list.close_project_search',
                    'Close search'
                  )}
                  onClick={() => setOpen(false)}
                >
                  <X />
                </Button>
              </div>
            </PopoverAnchor>
            <PopoverContent
              align="end"
              sideOffset={4}
              className="w-56 p-0"
              onOpenAutoFocus={(event) => event.preventDefault()}
            >
              <ActiveCollabProjectCommandList
                projects={projects}
                excludedIds={excludedIds}
                onSelect={handleSelect}
              />
            </PopoverContent>
          </Command>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={label}
                  aria-expanded={false}
                  onClick={openSearch}
                >
                  <Search />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={4}>
              {label}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </Popover>
  )
}
