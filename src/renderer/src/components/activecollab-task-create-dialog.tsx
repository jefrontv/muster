// The "new task" modal behind each task-list section's add row: name, list, rich description,
// assignee, dates, labels and file attachments in one form, so a task can arrive configured
// instead of being created bare and edited into shape. Every field is the SAME component the
// detail pane uses — the description editor and attachment staging are the comment composer's
// own — because a field must not behave differently depending on where the task is in its life.

import React, { useState } from 'react'
import { LoaderCircle, Paperclip } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import { NATIVE_FILE_DROP_TARGET } from '../../../shared/native-file-drop'
import { activeCollabCommentBodyHtml } from './activecollab-comment-body-html'
import { describeActiveCollabFailure } from './activecollab-failure-message'
import { ActiveCollabRichBodyFrame, useActiveCollabRichBody } from './activecollab-rich-body-editor'
import { ActiveCollabTaskAssigneeField } from './activecollab-task-assignee-field'
import { ActiveCollabTaskDueDateField } from './activecollab-task-due-date-field'
import { ActiveCollabLabelChip, ActiveCollabLabelEditor } from './activecollab-task-label-editor'
import { toggleActiveCollabLabelName } from './activecollab-task-label-set'
import type { ActiveCollabSchedule } from './activecollab-task-schedule'
import { useActiveCollabCommentAttachments } from './use-activecollab-comment-attachments'

/** Sentinel for "no list": Radix Select values are strings and reject the empty string. */
const NO_LIST = 'none'

const FIELD_LABEL = 'text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground'

type ActiveCollabTaskCreateDialogProps = {
  projectId: number
  taskLists: readonly ActiveCollabTaskList[]
  /** The list of the section whose add row opened the dialog; null = the project default. */
  initialTaskListId: number | null
  onClose: () => void
  onCreate: (args: {
    taskListId: number | null
    update: ActiveCollabTaskUpdate
    attachmentCodes: string[]
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
  const [taskListId, setTaskListId] = useState<number | null>(initialTaskListId)
  const [assigneeId, setAssigneeId] = useState<number | null>(null)
  const [schedule, setSchedule] = useState<ActiveCollabSchedule>({ startOn: null, dueOn: null })
  const [labels, setLabels] = useState<ActiveCollabLabel[]>([])
  const [hiddenFromClients, setHiddenFromClients] = useState(false)
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<ActiveCollabFailure | null>(null)

  const body = useActiveCollabRichBody({
    projectId,
    disabled: pending,
    placeholder: translate(
      'auto.components.activecollab.create_task.description_placeholder',
      'Add a description…'
    ),
    ariaLabel: translate('auto.components.activecollab.create_task.description', 'Description')
  })
  const attachments = useActiveCollabCommentAttachments({
    dropTarget: NATIVE_FILE_DROP_TARGET.activeCollabTaskCreate,
    orphanMessage: translate(
      'auto.components.activecollab.create_task.orphaned_upload',
      'The files uploaded but the task was not created, so nothing was attached. Your draft is still here — try again.'
    )
  })

  const canSubmit = name.trim() !== '' && !pending && !attachments.busy && !attachments.blocked

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
    const bodyHtml = body.editor === null ? '' : activeCollabCommentBodyHtml(body.editor.state.doc)
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
    if (hiddenFromClients) {
      // Only when set: visible is the server default, so an unticked box sends nothing.
      update.isHiddenFromClients = true
    }
    setPending(true)
    setFailure(null)
    // Upload FIRST, same as a comment: a create can only quote codes that already exist, and a
    // refused upload creates nothing — the whole draft stays put. The upload's own error shows
    // in the attachment strip.
    const codes = await attachments.upload()
    if (codes === null) {
      setPending(false)
      return
    }
    const result = await onCreate({ taskListId, update, attachmentCodes: codes })
    setPending(false)
    if (result) {
      setFailure(result)
      if (codes.length > 0) {
        // Files reached the instance but the task did not — the one outcome only this layer sees.
        attachments.reportOrphanedUpload()
      }
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

        <div className="space-y-4" {...attachments.dropTargetProps}>
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
            <span className={FIELD_LABEL}>
              {translate('auto.components.activecollab.create_task.description', 'Description')}
            </span>
            <ActiveCollabRichBodyFrame
              body={body}
              attachments={attachments}
              disabled={pending}
              dragging={attachments.dragging}
              footer={
                <div className="flex items-center border-t border-border px-1.5 py-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1.5 text-[12px] text-muted-foreground hover:text-foreground"
                    disabled={pending || attachments.busy}
                    onClick={attachments.pick}
                  >
                    <Paperclip className="size-3.5" />
                    {translate(
                      'auto.components.activecollab.comment_attachments.attach',
                      'Attach Files'
                    )}
                  </Button>
                </div>
              }
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

            <span className={FIELD_LABEL}>
              {translate('auto.components.activecollab.task_workspace.clients', 'Clients')}
            </span>
            <label className="flex cursor-pointer items-center gap-2 text-[12px] text-foreground">
              <Checkbox
                checked={hiddenFromClients}
                disabled={pending}
                onCheckedChange={(checked) => setHiddenFromClients(checked === true)}
              />
              {translate(
                'auto.components.activecollab.task_workspace.hidden_from_clients',
                'Hidden from clients'
              )}
            </label>
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
            {pending || attachments.busy ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : null}
            {translate('auto.components.activecollab.create_task.submit', 'Create task')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
