// The "new task" modal behind each task-list section's add row: name, list, description,
// assignee, dates and labels in one form, so a task can arrive configured instead of being
// created bare and edited into shape. The pickers are the SAME components the detail pane's
// metadata bar uses — a field must not behave differently depending on where the task is in
// its life.

import React, { useState } from 'react'
import { LoaderCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { translate } from '@/i18n/i18n'
import type { ActiveCollabFailure } from '../../../shared/activecollab-api-types'
import type {
  ActiveCollabLabel,
  ActiveCollabTaskList,
  ActiveCollabTaskUpdate
} from '../../../shared/activecollab-types'
import { describeActiveCollabFailure } from './activecollab-failure-message'
import { ActiveCollabTaskAssigneeField } from './activecollab-task-assignee-field'
import { ActiveCollabTaskDueDateField } from './activecollab-task-due-date-field'
import { ActiveCollabLabelChip, ActiveCollabLabelEditor } from './activecollab-task-label-editor'
import { toggleActiveCollabLabelName } from './activecollab-task-label-set'
import type { ActiveCollabSchedule } from './activecollab-task-schedule'

/** Sentinel for "no list": Radix Select values are strings and reject the empty string. */
const NO_LIST = 'none'

const FIELD_LABEL = 'text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground'

/**
 * Plain textarea text as minimal HTML: paragraphs on blank lines, <br> within one. The comment
 * composer has a rich editor; a create form does not need one, but it must never ship raw < or &
 * into a field the instance renders as HTML.
 */
export function activeCollabDescriptionHtml(text: string): string {
  const trimmed = text.trim()
  if (trimmed === '') {
    return ''
  }
  const escaped = trimmed.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return escaped
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, '<br>')}</p>`)
    .join('')
}

type ActiveCollabTaskCreateDialogProps = {
  projectId: number
  taskLists: readonly ActiveCollabTaskList[]
  /** The list of the section whose add row opened the dialog; null = the project default. */
  initialTaskListId: number | null
  onClose: () => void
  onCreate: (args: {
    taskListId: number | null
    update: ActiveCollabTaskUpdate
  }) => Promise<ActiveCollabFailure | null>
}

/** Mounted per open (the parent renders it conditionally), so state needs no reset plumbing. */
export function ActiveCollabTaskCreateDialog({
  projectId,
  taskLists,
  initialTaskListId,
  onClose,
  onCreate
}: ActiveCollabTaskCreateDialogProps): React.JSX.Element {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [taskListId, setTaskListId] = useState<number | null>(initialTaskListId)
  const [assigneeId, setAssigneeId] = useState<number | null>(null)
  const [schedule, setSchedule] = useState<ActiveCollabSchedule>({ startOn: null, dueOn: null })
  const [labels, setLabels] = useState<ActiveCollabLabel[]>([])
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<ActiveCollabFailure | null>(null)

  const canSubmit = name.trim() !== '' && !pending

  const toggleLabel = (labelName: string): void => {
    setLabels((previous) =>
      // Draft-only objects: ids are placeholders and colors unknown until the server echoes.
      toggleActiveCollabLabelName(previous, labelName).map((entry, index) => ({
        id: -(index + 1),
        name: entry,
        color: null
      }))
    )
  }

  const submit = async (): Promise<void> => {
    if (!canSubmit) {
      return
    }
    const update: ActiveCollabTaskUpdate = { name: name.trim() }
    const bodyHtml = activeCollabDescriptionHtml(description)
    if (bodyHtml !== '') {
      update.bodyHtml = bodyHtml
    }
    if (assigneeId !== null) {
      update.assigneeId = assigneeId
    }
    if (schedule.startOn !== null) {
      update.startOn = schedule.startOn
    }
    if (schedule.dueOn !== null) {
      update.dueOn = schedule.dueOn
    }
    if (labels.length > 0) {
      update.labelNames = labels.map((label) => label.name)
    }
    setPending(true)
    setFailure(null)
    const result = await onCreate({ taskListId, update })
    setPending(false)
    if (result) {
      setFailure(result)
      return
    }
    onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => (!open && !pending ? onClose() : undefined)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {translate('auto.components.activecollab.create_task.title', 'New task')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className={FIELD_LABEL} htmlFor="activecollab-create-task-name">
              {translate('auto.components.activecollab.create_task.name', 'Name')}
            </label>
            <Input
              id="activecollab-create-task-name"
              autoFocus
              value={name}
              disabled={pending}
              placeholder={translate(
                'auto.components.activecollab.create_task.name_placeholder',
                'What needs doing?'
              )}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void submit()
                }
              }}
            />
          </div>

          <div className="space-y-1.5">
            <label className={FIELD_LABEL} htmlFor="activecollab-create-task-list">
              {translate('auto.components.activecollab.create_task.list', 'Task list')}
            </label>
            <Select
              value={taskListId === null ? NO_LIST : String(taskListId)}
              onValueChange={(value) => setTaskListId(value === NO_LIST ? null : Number(value))}
              disabled={pending}
            >
              <SelectTrigger id="activecollab-create-task-list" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {taskLists.map((list) => (
                  <SelectItem key={list.id} value={String(list.id)}>
                    {list.name ||
                      translate(
                        'auto.components.activecollab.project_view.unnamed_list',
                        'Task list {{id}}',
                        { id: list.id }
                      )}
                  </SelectItem>
                ))}
                <SelectItem value={NO_LIST}>
                  {translate(
                    'auto.components.activecollab.create_task.no_list',
                    'No list (project default)'
                  )}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className={FIELD_LABEL} htmlFor="activecollab-create-task-description">
              {translate('auto.components.activecollab.create_task.description', 'Description')}
            </label>
            <textarea
              id="activecollab-create-task-description"
              value={description}
              disabled={pending}
              rows={4}
              placeholder={translate(
                'auto.components.activecollab.create_task.description_placeholder',
                'Optional details — a blank line starts a new paragraph'
              )}
              onChange={(event) => setDescription(event.target.value)}
              className="w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          <div className="grid grid-cols-[5.25rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2.5">
            <span className={FIELD_LABEL}>
              {translate('auto.components.activecollab.task_workspace.assignee', 'Assignee')}
            </span>
            <ActiveCollabTaskAssigneeField
              task={{ assigneeId, assigneeName: null, projectId }}
              disabled={pending}
              busy={false}
              onChange={setAssigneeId}
            />

            <span className={FIELD_LABEL}>
              {translate('auto.components.activecollab.task_workspace.due_date', 'Due date')}
            </span>
            <ActiveCollabTaskDueDateField
              startOn={schedule.startOn}
              dueOn={schedule.dueOn}
              disabled={pending}
              busy={false}
              onChange={setSchedule}
            />

            <span className={`${FIELD_LABEL} self-start pt-1`}>
              {translate('auto.components.activecollab.task_workspace.labels', 'Labels')}
            </span>
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              {labels.map((label) => (
                <ActiveCollabLabelChip key={label.name} label={label} />
              ))}
              <ActiveCollabLabelEditor
                labels={labels}
                disabled={pending}
                busy={false}
                onToggle={toggleLabel}
              />
            </div>
          </div>

          {failure ? (
            <p role="alert" className="text-xs text-destructive">
              {describeActiveCollabFailure(failure)}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" disabled={pending} onClick={onClose}>
            {translate('auto.components.activecollab.create_task.cancel', 'Cancel')}
          </Button>
          <Button disabled={!canSubmit} onClick={() => void submit()}>
            {pending ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
            {translate('auto.components.activecollab.create_task.submit', 'Create task')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
