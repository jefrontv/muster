// The task's checklist. Subtasks arrive inline on the detail response, so this section is pure
// presentation over `detail.subtasks` plus the four writes a checklist needs.
//
// Open rows sort ABOVE completed ones and completed rows dim and strike through: a checklist is
// read for what is left, and a done item that keeps its place forces the reader to filter it out
// again on every pass. Order within each half is the task's own order, which is how ActiveCollab
// numbers them.

import React, { useMemo, useState } from 'react'
import { LoaderCircle, Plus } from 'lucide-react'

import { Checkbox } from '@/components/ui/checkbox'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type { ActiveCollabSubtask } from '../../../shared/activecollab-types'
import { formatActiveCollabDueDate } from './activecollab-task-due-date'
import { ActiveCollabPersonBadge } from './activecollab-task-person-badge'
import { ActiveCollabTaskSectionHeading } from './activecollab-task-section-heading'

type ActiveCollabTaskSubtasksProps = {
  subtasks: ActiveCollabSubtask[]
  /** Any write in flight; the checklist locks with the rest of the pane. */
  disabled: boolean
  busy: boolean
  onCompletedChange: (subtaskId: number, isCompleted: boolean) => void
  /** The trimmed, actually-changed name; the row filters no-ops before calling. */
  onRename: (subtaskId: number, name: string) => void
  onAdd: (name: string) => void
}

const NAME_CLASS = 'min-w-0 flex-1 truncate rounded-sm text-left text-[13px]'

const EDIT_INPUT_CLASS =
  'min-w-0 flex-1 rounded-sm border border-ring bg-transparent px-1 py-0.5 text-[13px] text-foreground outline-none'

/** Open first, then completed, each half keeping the instance's own order. */
function sortActiveCollabSubtasks(subtasks: readonly ActiveCollabSubtask[]): ActiveCollabSubtask[] {
  return [
    ...subtasks.filter((subtask) => !subtask.isCompleted),
    ...subtasks.filter((subtask) => subtask.isCompleted)
  ]
}

/**
 * One checklist row. The name is a button rather than a text node because clicking it is how you
 * rename: an input that is always present would make five subtasks read as a five-field form.
 */
function ActiveCollabSubtaskRow({
  subtask,
  disabled,
  onCompletedChange,
  onRename
}: {
  subtask: ActiveCollabSubtask
  disabled: boolean
  onCompletedChange: (subtaskId: number, isCompleted: boolean) => void
  onRename: (subtaskId: number, name: string) => void
}): React.JSX.Element {
  const [draft, setDraft] = useState<string | null>(null)
  const due = formatActiveCollabDueDate(subtask.dueOn)

  // Enter and blur both commit; unchanged or emptied text writes nothing. Committing unmounts the
  // field, so the two paths can never both fire for one edit.
  const commit = (): void => {
    const next = draft?.trim() ?? ''
    setDraft(null)
    if (next !== '' && next !== subtask.name) {
      onRename(subtask.id, next)
    }
  }

  return (
    <li className="flex min-w-0 items-center gap-2 py-0.5">
      <Checkbox
        checked={subtask.isCompleted}
        disabled={disabled}
        aria-label={subtask.name}
        onCheckedChange={(checked) => onCompletedChange(subtask.id, checked === true)}
      />
      {draft === null ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => setDraft(subtask.name)}
          className={cn(
            NAME_CLASS,
            'px-1 py-0.5 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none',
            subtask.isCompleted ? 'text-muted-foreground line-through' : 'text-foreground'
          )}
        >
          {subtask.name}
        </button>
      ) : (
        <input
          // Focus follows the click: the input replaced the row the pointer just hit.
          autoFocus
          value={draft}
          disabled={disabled}
          aria-label={translate(
            'auto.components.activecollab.task_workspace.rename_subtask',
            'Rename subtask'
          )}
          className={EDIT_INPUT_CLASS}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              commit()
              return
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              setDraft(null)
            }
          }}
        />
      )}
      {subtask.assigneeId === null ? null : (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="shrink-0">
              <ActiveCollabPersonBadge name={subtask.assigneeName} userId={subtask.assigneeId} />
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={4}>
            {subtask.assigneeName ??
              translate('auto.components.activecollab.task_workspace.assigned', 'Assigned')}
          </TooltipContent>
        </Tooltip>
      )}
      {due ? (
        <time
          dateTime={due.iso}
          className="shrink-0 text-[11px] tabular-nums text-muted-foreground"
        >
          {due.label}
        </time>
      ) : null}
    </li>
  )
}

/** The always-available bottom row: type, Enter, it exists. Empty input writes nothing. */
function ActiveCollabSubtaskComposer({
  disabled,
  busy,
  onAdd
}: {
  disabled: boolean
  busy: boolean
  onAdd: (name: string) => void
}): React.JSX.Element {
  const [draft, setDraft] = useState('')
  const label = translate(
    'auto.components.activecollab.task_workspace.add_subtask',
    'Add a subtask'
  )

  return (
    <div className="flex min-w-0 items-center gap-2 py-0.5">
      <Plus aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
      <input
        value={draft}
        disabled={disabled}
        placeholder={label}
        aria-label={label}
        className="min-w-0 flex-1 border-b border-transparent bg-transparent px-1 py-0.5 text-[13px] text-foreground transition-colors outline-none placeholder:text-muted-foreground/60 focus:border-ring disabled:pointer-events-none disabled:opacity-50"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setDraft('')
            return
          }
          if (event.key !== 'Enter') {
            return
          }
          event.preventDefault()
          const name = draft.trim()
          if (name === '') {
            return
          }
          // Cleared on submit, not on settlement: the row echoes optimistically, and holding the
          // text would make a second subtask impossible to type until the first landed.
          setDraft('')
          onAdd(name)
        }}
      />
      {busy ? (
        <LoaderCircle className="size-3 shrink-0 animate-spin text-muted-foreground" />
      ) : null}
    </div>
  )
}

/**
 * The Subtasks band. A task with no subtasks gets the add row and nothing else — a heading, a `0/0`
 * pill and an empty-state sentence would announce the absence of something nobody asked for.
 */
export function ActiveCollabTaskSubtasks({
  subtasks,
  disabled,
  busy,
  onCompletedChange,
  onRename,
  onAdd
}: ActiveCollabTaskSubtasksProps): React.JSX.Element {
  const ordered = useMemo(() => sortActiveCollabSubtasks(subtasks), [subtasks])
  const completed = ordered.filter((subtask) => subtask.isCompleted).length

  return (
    <section className="border-b border-border/40 px-4 py-4">
      {ordered.length === 0 ? null : (
        <ActiveCollabTaskSectionHeading
          label={translate('auto.components.activecollab.task_workspace.subtasks', 'Subtasks')}
          ratio={`${completed}/${ordered.length}`}
        />
      )}
      {ordered.length === 0 ? null : (
        // Own provider, same as the header's: these tooltips name row actions and want the pane's
        // shorter delay, not the app root's.
        <TooltipProvider delayDuration={300}>
          <ul className="mb-1 flex flex-col">
            {ordered.map((subtask) => (
              <ActiveCollabSubtaskRow
                key={subtask.id}
                subtask={subtask}
                disabled={disabled}
                onCompletedChange={onCompletedChange}
                onRename={onRename}
              />
            ))}
          </ul>
        </TooltipProvider>
      )}
      <ActiveCollabSubtaskComposer disabled={disabled} busy={busy} onAdd={onAdd} />
    </section>
  )
}
