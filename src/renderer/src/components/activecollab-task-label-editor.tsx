import React, { useEffect, useMemo, useState } from 'react'
import { Check, LoaderCircle, Tag } from 'lucide-react'

import { describeActiveCollabFailure } from '@/components/activecollab-failure-message'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import type { ActiveCollabLabel } from '../../../shared/activecollab-types'
import type { ActiveCollabFailure } from '../../../shared/activecollab-api-types'
import { hasActiveCollabLabel } from './activecollab-task-label-set'
import { activeCollabLabelChipStyle } from './task-page-activecollab-row-presentation'

// The instance ships ~1600 labels; rendering them all janks the popover, so the list is filtered
// and capped and the user narrows with the search field.
const MAX_VISIBLE_LABELS = 40

/**
 * Same filled, contrast-checked chip the assigned-task list paints, so one label looks like itself
 * on both surfaces. The instance's arbitrary hex becomes the FILL and the text is picked against it;
 * a null style means the hex was unusable and the neutral token chip stands in.
 */
export function ActiveCollabLabelChip({ label }: { label: ActiveCollabLabel }): React.JSX.Element {
  const style = activeCollabLabelChipStyle(label.color)
  return (
    <span
      className={cn(
        'inline-flex w-fit max-w-[11rem] shrink-0 items-center truncate rounded-full border px-2 py-0.5 text-[11px] font-medium',
        !style && 'border-border/60 bg-muted/35 text-muted-foreground'
      )}
      style={style ?? undefined}
    >
      {label.name}
    </span>
  )
}

type ActiveCollabLabelEditorProps = {
  labels: ActiveCollabLabel[]
  disabled: boolean
  busy: boolean
  /** Receives the ONE toggled label. The write layer builds the API's full replacement set from a
   *  fresh read, so the UI's possibly-stale `labels` never overwrite a colleague's edit. */
  onToggle: (labelName: string) => void
}

/**
 * The vocabulary list. Mounted only while the popover is open — Radix unmounts closed content — so
 * the label read is paid on demand rather than on every task selection.
 */
export function ActiveCollabLabelPicker({
  labels,
  disabled,
  onToggle
}: Omit<ActiveCollabLabelEditorProps, 'busy'>): React.JSX.Element {
  const listLabels = useAppStore((s) => s.listActiveCollabLabels)
  const [vocabulary, setVocabulary] = useState<ActiveCollabLabel[]>([])
  const [loading, setLoading] = useState(true)
  const [failure, setFailure] = useState<ActiveCollabFailure | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    let active = true
    void listLabels().then((result) => {
      if (!active) {
        return
      }
      setLoading(false)
      if (result.ok) {
        setVocabulary(result.value)
        setFailure(null)
        return
      }
      setFailure(result)
    })
    return () => {
      active = false
    }
  }, [listLabels])

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const pool = needle
      ? vocabulary.filter((label) => label.name.toLowerCase().includes(needle))
      : vocabulary
    return { rows: pool.slice(0, MAX_VISIBLE_LABELS), total: pool.length }
  }, [query, vocabulary])

  return (
    <>
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={translate(
          'auto.components.activecollab.task_workspace.filter_labels',
          'Filter labels'
        )}
        aria-label={translate(
          'auto.components.activecollab.task_workspace.filter_labels',
          'Filter labels'
        )}
        className="mb-2 h-8 text-xs"
      />
      {failure ? (
        <p role="alert" className="px-1 py-2 text-[12px] text-destructive">
          {describeActiveCollabFailure(failure)}
        </p>
      ) : loading ? (
        <div className="flex items-center justify-center py-6">
          <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
        </div>
      ) : matches.rows.length === 0 ? (
        <p className="px-1 py-2 text-[12px] text-muted-foreground">
          {translate('auto.components.activecollab.task_workspace.no_labels', 'No labels match.')}
        </p>
      ) : (
        <div className="grid gap-0.5">
          {matches.rows.map((label) => {
            const selected = hasActiveCollabLabel(labels, label.name)
            return (
              <button
                key={label.id}
                type="button"
                disabled={disabled}
                aria-pressed={selected}
                onClick={() => onToggle(label.name)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[12px] hover:bg-accent disabled:opacity-50',
                  selected && 'font-medium text-foreground'
                )}
              >
                <span
                  aria-hidden
                  className="size-2 shrink-0 rounded-full bg-muted-foreground/50"
                  style={label.color ? { backgroundColor: label.color } : undefined}
                />
                <span className="min-w-0 flex-1 truncate">{label.name}</span>
                {selected ? <Check className="size-3.5 shrink-0" /> : null}
              </button>
            )
          })}
        </div>
      )}
      {matches.total > matches.rows.length ? (
        <p className="px-1 pt-2 text-[11px] text-muted-foreground">
          {translate(
            'auto.components.activecollab.task_workspace.labels_truncated',
            'Showing {{value0}} of {{value1}} — keep typing to narrow.',
            { value0: matches.rows.length, value1: matches.total }
          )}
        </p>
      ) : null}
    </>
  )
}

export function ActiveCollabLabelEditor({
  labels,
  disabled,
  busy,
  onToggle
}: ActiveCollabLabelEditorProps): React.JSX.Element {
  // A task with no labels needs "Add", not "Edit" — there is nothing to edit yet.
  const label =
    labels.length > 0
      ? translate('auto.components.activecollab.task_workspace.edit_labels', 'Edit labels')
      : translate('auto.components.activecollab.task_workspace.add_labels', 'Add labels')
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-dashed border-border/70 px-2 py-0.5 text-[11px] text-muted-foreground transition hover:border-border hover:bg-muted/40 disabled:cursor-default disabled:opacity-50"
        >
          <Tag className="size-3" />
          {label}
          {busy ? <LoaderCircle className="size-3 animate-spin" /> : null}
        </button>
      </PopoverTrigger>
      <PopoverContent className="popover-scroll-content scrollbar-sleek w-72 p-2" align="start">
        <ActiveCollabLabelPicker labels={labels} disabled={disabled} onToggle={onToggle} />
      </PopoverContent>
    </Popover>
  )
}
