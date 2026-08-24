// The My Work filter bar: text, labels, projects, and a clear-all that appears only once something
// is actually narrowing the list.
//
// Both facets are derived from the ROWS ON SCREEN, not from the instance vocabulary. Offering all
// ~1600 instance labels meant most options matched nothing here, and it cost a request; a label
// only appears once some visible task wears it, so every option narrows the list to something.
//
// The text field is debounced and holds its OWN draft, because the committed filter lives in the
// store: writing every keystroke there re-derived the buckets and the project grouping per
// character. The draft is pulled back into line whenever the committed text changes underneath it
// (clear-all, Escape from the list), which is the only way the two can disagree.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import type { ActiveCollabLabel, ActiveCollabTask } from '../../../shared/activecollab-types'
import { ActiveCollabLabelChip } from './activecollab-task-label-editor'
import { ActiveCollabFilterFacet } from './task-page-activecollab-filter-facet'
import {
  isActiveCollabMyWorkFilterActive,
  type ActiveCollabMyWorkFilter
} from './task-page-activecollab-my-work-filter'

const TEXT_DEBOUNCE_MS = 200

export function ActiveCollabMyWorkFilterBar({
  filter,
  onChange,
  tasks
}: {
  filter: ActiveCollabMyWorkFilter
  onChange: (next: ActiveCollabMyWorkFilter) => void
  /** The rows on screen — both facets offer exactly what the user can see. */
  tasks: readonly ActiveCollabTask[]
}): React.JSX.Element {
  const [draft, setDraft] = useState(filter.text)
  // What this bar last pushed upstream. A committed text differing from it came from somewhere
  // else, which is the signal to adopt it rather than fight it.
  const committedTextRef = useRef(filter.text)
  // Read by the debounce timer, which fires long after the render that scheduled it, so it must
  // see the CURRENT filter rather than the one captured when the key was pressed.
  const filterRef = useRef(filter)
  useEffect(() => {
    filterRef.current = filter
  }, [filter])

  const textTimerRef = useRef(0)
  useEffect(() => () => window.clearTimeout(textTimerRef.current), [])

  useEffect(() => {
    if (filter.text === committedTextRef.current) {
      return
    }
    committedTextRef.current = filter.text
    setDraft(filter.text)
  }, [filter.text])

  const handleDraft = useCallback(
    (next: string) => {
      setDraft(next)
      window.clearTimeout(textTimerRef.current)
      textTimerRef.current = window.setTimeout(() => {
        committedTextRef.current = next
        onChange({ ...filterRef.current, text: next })
      }, TEXT_DEBOUNCE_MS)
    },
    [onChange]
  )

  const projectOptions = useMemo(() => {
    const byId = new Map<number, string>()
    for (const task of tasks) {
      byId.set(task.projectId, task.projectName)
    }
    return [...byId]
      .map(([id, name]) => ({ value: String(id), label: name }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
  }, [tasks])

  // Keyed by NAME, because that is what the filter matches on and what the API accepts. Two
  // projects can ship a same-named label under different ids; the first colour seen wins, which is
  // the one the user is already looking at further up the list.
  const labelOptions = useMemo(() => {
    const byName = new Map<string, ActiveCollabLabel>()
    for (const task of tasks) {
      for (const label of task.labels) {
        if (!byName.has(label.name)) {
          byName.set(label.name, label)
        }
      }
    }
    return [...byName.values()]
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
      .map((label) => ({
        value: label.name,
        label: label.name,
        chip: <ActiveCollabLabelChip label={label} />
      }))
  }, [tasks])

  const clearAll = useCallback(() => {
    committedTextRef.current = ''
    window.clearTimeout(textTimerRef.current)
    setDraft('')
    onChange({ text: '', labelNames: [], projectIds: [] })
  }, [onChange])

  const textLabel = translate(
    'auto.components.activecollab.my_work.filter_text',
    'Filter by name or task number'
  )

  return (
    <div className="flex items-center gap-1.5 border-b border-border/50 px-3 py-1.5">
      <div className="relative min-w-0 flex-1">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          aria-label={textLabel}
          placeholder={textLabel}
          value={draft}
          onChange={(event) => handleDraft(event.target.value)}
          className="h-7 pl-7 text-xs"
        />
      </div>

      <ActiveCollabFilterFacet
        emptyText={translate(
          'auto.components.activecollab.task_workspace.no_labels',
          'No labels match.'
        )}
        label={translate('auto.components.activecollab.my_work.filter_labels', 'Labels')}
        onToggle={(name) =>
          onChange({
            ...filter,
            labelNames: filter.labelNames.includes(name)
              ? filter.labelNames.filter((entry) => entry !== name)
              : [...filter.labelNames, name]
          })
        }
        options={labelOptions}
        searchPlaceholder={translate(
          'auto.components.activecollab.task_workspace.filter_labels',
          'Filter labels'
        )}
        selected={filter.labelNames}
      />

      <ActiveCollabFilterFacet
        emptyText={translate(
          'auto.components.activecollab.my_work.no_projects',
          'No projects match.'
        )}
        label={translate('auto.components.activecollab.my_work.filter_projects', 'Projects')}
        onToggle={(value) => {
          const id = Number(value)
          onChange({
            ...filter,
            projectIds: filter.projectIds.includes(id)
              ? filter.projectIds.filter((entry) => entry !== id)
              : [...filter.projectIds, id]
          })
        }}
        options={projectOptions}
        searchPlaceholder={translate(
          'auto.components.activecollab.my_work.filter_projects_placeholder',
          'Filter projects'
        )}
        selected={filter.projectIds.map(String)}
      />

      {isActiveCollabMyWorkFilterActive(filter) ? (
        <Button
          variant="ghost"
          size="icon-xs"
          className="shrink-0 text-muted-foreground"
          aria-label={translate(
            'auto.components.activecollab.my_work.filter_clear',
            'Clear filters'
          )}
          onClick={clearAll}
        >
          <X className="size-3.5" />
        </Button>
      ) : null}
    </div>
  )
}
