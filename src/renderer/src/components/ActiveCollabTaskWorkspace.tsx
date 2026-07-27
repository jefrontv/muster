import React, { useCallback } from 'react'
import { LoaderCircle, RefreshCw } from 'lucide-react'

import { describeActiveCollabFailure } from '@/components/activecollab-failure-message'
import { ActiveCollabIcon } from '@/components/icons/ActiveCollabIcon'
import CommentMarkdown from '@/components/sidebar/CommentMarkdown'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import type { ActiveCollabFailure } from '../../../shared/activecollab-api-types'
import { ActiveCollabCommentThread } from './activecollab-task-comment-thread'
import { useActiveCollabTaskDetail } from './activecollab-task-detail-state'
import { ActiveCollabTaskMetadataBar } from './activecollab-task-metadata-bar'
import { useActiveCollabTaskWrites } from './activecollab-task-writes'

export type ActiveCollabTaskWorkspaceProps = {
  projectId: number | null
  taskId: number | null
}

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
 * Detail surface for one ActiveCollab task. Selection is lifted: the pane takes the ids and renders
 * nothing without them, so it never has to know how the list picked them.
 */
export function ActiveCollabTaskWorkspace({
  projectId,
  taskId
}: ActiveCollabTaskWorkspaceProps): React.JSX.Element | null {
  const { status, detail, failure, reload, replaceTask, appendComment } = useActiveCollabTaskDetail(
    projectId,
    taskId
  )
  const writes = useActiveCollabTaskWrites({
    projectId,
    taskId,
    onTask: replaceTask,
    onComment: appendComment,
    reload
  })
  const retry = useCallback(() => {
    void reload()
  }, [reload])

  if (projectId === null || taskId === null) {
    return null
  }

  if (status === 'failed' && failure) {
    return (
      <div className="flex h-full min-h-0 flex-col justify-center bg-background px-4 py-6">
        <ActiveCollabFailureNotice failure={failure} onRetry={retry} />
      </div>
    )
  }

  if (!detail) {
    return (
      <div
        role="status"
        className="flex h-full min-h-0 items-center justify-center bg-background py-8"
      >
        <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
        <span className="sr-only">
          {translate('auto.components.activecollab.task_workspace.loading', 'Loading task')}
        </span>
      </div>
    )
  }

  const { task, comments } = detail
  const body = task.bodyHtml.trim()
  // A failed write or a failed refetch leaves the loaded task on screen.
  const notice = writes.failure ?? failure

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <div className="flex-none border-b border-border/50 bg-muted/30 px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
          <ActiveCollabIcon className="size-3" />
          <span className="font-mono">#{task.taskNumber}</span>
          <span className="min-w-0 truncate">{task.projectName}</span>
        </div>
        <h2 className="mt-1 text-[20px] font-semibold leading-tight text-foreground">
          {task.name}
        </h2>
      </div>

      <ActiveCollabTaskMetadataBar
        task={task}
        pending={writes.pending}
        onCompletedChange={(completed) => void writes.setCompleted(completed)}
        onDueOnChange={(dueOn) => void writes.setDueOn(dueOn)}
        onLabelNamesChange={(labelNames) => void writes.setLabelNames(labelNames)}
      />

      {notice ? (
        <div className="flex-none px-4 pt-3">
          <ActiveCollabFailureNotice failure={notice} />
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-sleek">
        <section className="border-b border-border/40 px-4 py-4">
          {body ? (
            <CommentMarkdown
              content={body}
              variant="document"
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
        </section>

        <ActiveCollabCommentThread
          comments={comments}
          disabled={writes.pending !== null}
          busy={writes.pending === 'comment'}
          onSubmit={(bodyHtml) => void writes.addComment(bodyHtml)}
        />
      </div>
    </div>
  )
}
