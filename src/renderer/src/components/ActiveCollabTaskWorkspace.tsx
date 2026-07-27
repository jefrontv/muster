import React, { useCallback, useMemo } from 'react'
import { RefreshCw } from 'lucide-react'

import { ActiveCollabAttachmentGrid } from '@/components/activecollab-attachment-grid'
import { describeActiveCollabFailure } from '@/components/activecollab-failure-message'
import CommentMarkdown, { type ActiveCollabHtmlOptions } from '@/components/sidebar/CommentMarkdown'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import type { ActiveCollabFailure } from '../../../shared/activecollab-api-types'
import { ActiveCollabCommentThread } from './activecollab-task-comment-thread'
import { useActiveCollabTaskDetail } from './activecollab-task-detail-state'
import { ActiveCollabTaskHeader } from './activecollab-task-header'
import { ActiveCollabTaskMetadataBar } from './activecollab-task-metadata-bar'
import { ActiveCollabTaskSectionHeading } from './activecollab-task-section-heading'
import { ActiveCollabTaskSkeleton } from './activecollab-task-skeleton'
import { useActiveCollabTaskWrites } from './activecollab-task-writes'

export type ActiveCollabTaskWorkspaceProps = {
  projectId: number | null
  taskId: number | null
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
 * Detail surface for one ActiveCollab task. Selection is lifted: the pane takes the ids and renders
 * nothing without them, so it never has to know how the list picked them.
 *
 * Anatomy, top to bottom: identity and completion (`ActiveCollabTaskHeader`), then the named fields
 * (`ActiveCollabTaskMetadataBar`), then a scrolling half holding Description and Discussion.
 */
export function ActiveCollabTaskWorkspace({
  projectId,
  taskId
}: ActiveCollabTaskWorkspaceProps): React.JSX.Element | null {
  const { detail, failure, reload, replaceTask, appendComment } = useActiveCollabTaskDetail(
    projectId,
    taskId
  )
  // Mentions, callouts and unauthenticable inline images all resolve against the instance. Kept
  // stable so a write-pending rerender does not reparse every body through CommentMarkdown.
  const instanceUrl = useAppStore((s) => s.activeCollabStatus.connection?.instanceUrl ?? null)
  const activeCollabHtml = useMemo<ActiveCollabHtmlOptions>(() => ({ instanceUrl }), [instanceUrl])
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

  const { task, comments, attachments } = detail
  const body = task.bodyHtml.trim()
  // A failed write or a failed refetch leaves the loaded task on screen.
  const notice = writes.failure ?? failure

  return (
    <div className={PANE_CLASS}>
      <ActiveCollabTaskHeader
        task={task}
        disabled={writes.pending !== null}
        completing={writes.pending === 'completion'}
        onCompletedChange={(completed) => void writes.setCompleted(completed)}
      />

      <ActiveCollabTaskMetadataBar
        task={task}
        pending={writes.pending}
        onDueOnChange={(dueOn) => void writes.setDueOn(dueOn)}
        onAssigneeIdChange={(assigneeId) => void writes.setAssigneeId(assigneeId)}
        onLabelNamesChange={(labelNames) => void writes.setLabelNames(labelNames)}
      />

      {notice ? (
        <div className="flex-none px-4 pt-3">
          <ActiveCollabFailureNotice failure={notice} />
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-sleek">
        <section className="border-b border-border/40 px-4 py-4">
          <ActiveCollabTaskSectionHeading
            label={translate(
              'auto.components.activecollab.task_workspace.description',
              'Description'
            )}
          />
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
          <ActiveCollabAttachmentGrid attachments={attachments} />
        </section>

        <ActiveCollabCommentThread
          comments={comments}
          activeCollabHtml={activeCollabHtml}
          projectId={projectId}
          disabled={writes.pending !== null}
          busy={writes.pending === 'comment'}
          onSubmit={(bodyHtml) => void writes.addComment(bodyHtml)}
        />
      </div>
    </div>
  )
}
