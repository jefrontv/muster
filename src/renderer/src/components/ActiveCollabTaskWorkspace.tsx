import React, { useCallback, useMemo, useState } from 'react'
import { Pencil, RefreshCw } from 'lucide-react'

import { ActiveCollabAttachmentGrid } from '@/components/activecollab-attachment-grid'
import { attachmentsNotInlinedInBody } from '@/components/activecollab-inline-attachment-ids'
import { describeActiveCollabFailure } from '@/components/activecollab-failure-message'
import CommentMarkdown, { type ActiveCollabHtmlOptions } from '@/components/sidebar/CommentMarkdown'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import type { ActiveCollabFailure } from '../../../shared/activecollab-api-types'
import type { ActiveCollabAttachment, ActiveCollabTask } from '../../../shared/activecollab-types'
import { ActiveCollabRichBodyEditor } from './activecollab-rich-body-editor'
import { ActiveCollabCommentThread } from './activecollab-task-comment-thread'
import { useActiveCollabTaskDetail } from './activecollab-task-detail-state'
import { ActiveCollabTaskHeader } from './activecollab-task-header'
import { ActiveCollabTaskMetadataBar } from './activecollab-task-metadata-bar'
import { ActiveCollabTaskSectionHeading } from './activecollab-task-section-heading'
import { ActiveCollabTaskSkeleton } from './activecollab-task-skeleton'
import { ActiveCollabTaskSubtasks } from './activecollab-task-subtasks'
import { useActiveCollabTaskWrites } from './activecollab-task-writes'

export type ActiveCollabTaskWorkspaceProps = {
  projectId: number | null
  taskId: number | null
  /** Present when the header's project name can open the project drill-in view. */
  onOpenProject?: (id: number, name: string) => void
  /** Collapse the detail pane back to the list. */
  onClose?: () => void
}

// One class list for every state the pane can be in, so a skeleton, a failure and a loaded task all
// occupy the same box.
const PANE_CLASS = 'flex h-full min-h-0 flex-col overflow-hidden bg-background'

function ActiveCollabFailureNotice({
  failure,
  onRetry
}: {
  failure: ActiveCollabFailure
  onRetry?: () => void
}): React.JSX.Element {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      <span className="min-w-0 flex-1">{describeActiveCollabFailure(failure)}</span>
      {onRetry ? (
        <Button variant="outline" size="xs" onClick={onRetry} className="gap-1 shrink-0">
          <RefreshCw className="size-3" />
          {translate('auto.components.activecollab.task_workspace.retry', 'Retry')}
        </Button>
      ) : null}
    </div>
  )
}

/**
 * The Description band, and the only place a task body is edited. Read-only until the pencil is
 * used, so the pane opens as a document rather than a form. Mounted per task id, so a half-written
 * body cannot follow the selection to the next task.
 */
function ActiveCollabTaskDescription({
  task,
  attachments,
  activeCollabHtml,
  disabled,
  busy,
  onSave
}: {
  task: ActiveCollabTask
  attachments: ActiveCollabAttachment[]
  activeCollabHtml: ActiveCollabHtmlOptions
  disabled: boolean
  busy: boolean
  onSave: (bodyHtml: string) => Promise<boolean>
}): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const body = task.bodyHtml.trim()
  // A task with no body needs "Add", not "Edit" — there is nothing to edit yet.
  const editLabel = body
    ? translate('auto.components.activecollab.task_workspace.edit_description', 'Edit description')
    : translate('auto.components.activecollab.task_workspace.add_description', 'Add a description')

  return (
    <section className="border-b border-border/40 px-4 py-4">
      <div className="flex items-start justify-between gap-2">
        <ActiveCollabTaskSectionHeading
          label={translate(
            'auto.components.activecollab.task_workspace.description',
            'Description'
          )}
        />
        {editing ? null : (
          <Button
            variant="ghost"
            size="icon-xs"
            disabled={disabled}
            aria-label={editLabel}
            className="-mt-1 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => setEditing(true)}
          >
            <Pencil className="size-3" />
          </Button>
        )}
      </div>
      {editing ? (
        <ActiveCollabRichBodyEditor
          projectId={task.projectId}
          bodyHtml={task.bodyHtml}
          disabled={disabled}
          busy={busy}
          ariaLabel={editLabel}
          placeholder={translate(
            'auto.components.activecollab.create_task.description_placeholder',
            'Add a description…'
          )}
          onSave={onSave}
          onClose={() => setEditing(false)}
        />
      ) : (
        <>
          {body ? (
            <CommentMarkdown
              content={body}
              variant="document"
              activeCollabHtml={activeCollabHtml}
              className="text-[14px] leading-relaxed"
            />
          ) : (
            <p className="text-sm italic text-muted-foreground">
              {translate(
                'auto.components.activecollab.task_workspace.no_body',
                'No description provided.'
              )}
            </p>
          )}
          <ActiveCollabAttachmentGrid
            attachments={attachmentsNotInlinedInBody(attachments, body)}
          />
        </>
      )}
    </section>
  )
}

/**
 * Detail surface for one ActiveCollab task. Selection is lifted: the pane takes the ids and renders
 * nothing without them, so it never has to know how the list picked them.
 *
 * Anatomy, top to bottom: identity and completion (`ActiveCollabTaskHeader`) is the only pinned
 * row; everything below it scrolls as one column — the named fields, Description, Subtasks, then
 * Discussion. The fields scroll away on purpose: they are reference, not chrome, and pinning eight
 * rows of them cost more of a small pane than the task itself.
 */
export function ActiveCollabTaskWorkspace({
  projectId,
  taskId,
  onOpenProject,
  onClose
}: ActiveCollabTaskWorkspaceProps): React.JSX.Element | null {
  const {
    detail,
    failure,
    reload,
    replaceTask,
    appendComment,
    applySubtask,
    replaceComment,
    dropComment,
    applySubscription
  } = useActiveCollabTaskDetail(projectId, taskId)
  // Mentions, callouts and unauthenticable inline images all resolve against the instance. Kept
  // stable so a write-pending rerender does not reparse every body through CommentMarkdown.
  const instanceUrl = useAppStore((s) => s.activeCollabStatus.connection?.instanceUrl ?? null)
  const viewerId = useAppStore((s) => s.activeCollabStatus.connection?.userId ?? null)
  const activeCollabHtml = useMemo<ActiveCollabHtmlOptions>(() => ({ instanceUrl }), [instanceUrl])
  const writes = useActiveCollabTaskWrites({
    projectId,
    taskId,
    onTask: replaceTask,
    onComment: appendComment,
    onSubtask: applySubtask,
    onCommentReplaced: replaceComment,
    onCommentDropped: dropComment,
    onSubscription: applySubscription,
    reload
  })
  const retry = useCallback(() => {
    void reload()
  }, [reload])

  if (projectId === null || taskId === null) {
    return null
  }

  if (!detail) {
    // Nothing to keep on screen: either the first read is still out, or it failed outright.
    return failure ? (
      <div className={`${PANE_CLASS} justify-center px-4 py-6`}>
        <ActiveCollabFailureNotice failure={failure} onRetry={retry} />
      </div>
    ) : (
      <ActiveCollabTaskSkeleton />
    )
  }

  const { task, comments, attachments, subtasks, subscriberIds, trackedTime } = detail
  // A failed write or a failed refetch leaves the loaded task on screen.
  const notice = writes.failure ?? failure

  return (
    <div className={PANE_CLASS}>
      <ActiveCollabTaskHeader
        task={task}
        disabled={writes.pending !== null}
        completing={writes.pending === 'completion'}
        renaming={writes.pending === 'title'}
        onCompletedChange={(completed) => void writes.setCompleted(completed)}
        onNameChange={(name) => void writes.setTitle(name)}
        onOpenProject={onOpenProject}
        onClose={onClose}
      />

      {notice ? (
        <div className="flex-none px-4 pt-3">
          <ActiveCollabFailureNotice failure={notice} />
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-sleek">
        <ActiveCollabTaskMetadataBar
          task={task}
          subscriberIds={subscriberIds}
          trackedTime={trackedTime}
          pending={writes.pending}
          onScheduleChange={(schedule) => void writes.setSchedule(schedule)}
          onAssigneeIdChange={(assigneeId) => void writes.setAssigneeId(assigneeId)}
          onLabelToggle={(labelName) => void writes.toggleLabel(labelName)}
          onHiddenFromClientsChange={(hidden) => void writes.setHiddenFromClients(hidden)}
          onImportantChange={(isImportant) => void writes.setImportant(isImportant)}
          onSubscribedChange={(userId, subscribed) => void writes.setSubscribed(userId, subscribed)}
        />

        <ActiveCollabTaskDescription
          // Keyed per task so an open editor never carries a draft across the selection; prefixed
          // because the sibling sections key on the same id.
          key={`description-${task.id}`}
          task={task}
          attachments={attachments}
          activeCollabHtml={activeCollabHtml}
          disabled={writes.pending !== null}
          busy={writes.pending === 'description'}
          onSave={(bodyHtml) => writes.setDescription(bodyHtml)}
        />

        <ActiveCollabTaskSubtasks
          // Keyed per task so the add row's draft never carries across the selection.
          key={`subtasks-${task.id}`}
          subtasks={subtasks}
          disabled={writes.pending !== null}
          busy={writes.pending === 'subtask'}
          onCompletedChange={(subtaskId, isCompleted) =>
            void writes.setSubtaskCompleted(subtaskId, isCompleted)
          }
          onRename={(subtaskId, name) => void writes.editSubtask(subtaskId, { name })}
          onAdd={(name) => void writes.addSubtask({ name })}
        />

        <ActiveCollabCommentThread
          comments={comments}
          activeCollabHtml={activeCollabHtml}
          projectId={projectId}
          viewerId={viewerId}
          disabled={writes.pending !== null}
          busy={writes.pending === 'comment' || writes.pending === 'commentEdit'}
          onSubmit={(bodyHtml, attachmentCodes) => writes.addComment(bodyHtml, attachmentCodes)}
          onEdit={(commentId, bodyHtml) => writes.editComment(commentId, bodyHtml)}
          onDelete={(commentId) => void writes.removeComment(commentId)}
        />
      </div>
    </div>
  )
}
