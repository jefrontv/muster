import React, { useState } from 'react'
import { Check, ExternalLink, LoaderCircle, MessageSquarePlus, Play, X } from 'lucide-react'

import { ActiveCollabIcon } from '@/components/icons/ActiveCollabIcon'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type { ActiveCollabTask } from '../../../shared/activecollab-types'
import { activeCollabStamp } from './activecollab-task-timestamps'
import { useActiveCollabStartWork } from './use-activecollab-start-work'
import {
  discussTaskInChat,
  findChatWorkspaceForProject
} from './chat-mode/chat-thread-task-discussion'
import { useAppStore } from '@/store'
import { ACTIVECOLLAB_SITE_BINDING_UI_ENABLED } from '@/lib/activecollab-site-binding-visibility'

// A drawn dot rather than a typed middot: the identity line is decoration between localized
// fragments, and punctuation as text would need translating.
const DOT = 'size-1 shrink-0 rounded-full bg-muted-foreground/40'

type ActiveCollabTaskHeaderProps = {
  task: ActiveCollabTask
  /** Any write in flight; the toggle locks with the rest of the pane. */
  disabled: boolean
  completing: boolean
  renaming: boolean
  onCompletedChange: (completed: boolean) => void
  /** The trimmed, actually-changed name; the title filters no-ops before calling. */
  onNameChange: (name: string) => void
  /** Present when the project name should open the project drill-in view. */
  onOpenProject?: (id: number, name: string) => void
  /** Collapse the detail pane back to the list. */
  onClose?: () => void
}

/**
 * The title, and the only way to rename a task from this pane. It reads as a heading until it is
 * clicked, because an input box on a surface you mostly READ makes the name look like a form field
 * and the task look unsaved. Mounted per task id so a draft cannot follow the selection.
 */
function ActiveCollabTaskTitle({
  task,
  disabled,
  renaming,
  onNameChange
}: {
  task: ActiveCollabTask
  disabled: boolean
  renaming: boolean
  onNameChange: (name: string) => void
}): React.JSX.Element {
  const [draft, setDraft] = useState<string | null>(null)

  // Enter and blur both commit; unchanged or emptied text writes nothing, so a stray click out of
  // the field cannot rename a task to itself. Committing unmounts the field, so the two paths can
  // never both fire for one edit.
  const commit = (): void => {
    const next = draft?.trim() ?? ''
    setDraft(null)
    if (next !== '' && next !== task.name) {
      onNameChange(next)
    }
  }

  if (draft !== null) {
    return (
      <input
        // Focus follows the click: the field replaced the heading the pointer just hit.
        autoFocus
        value={draft}
        disabled={disabled}
        aria-label={translate(
          'auto.components.activecollab.task_workspace.rename_task',
          'Rename task'
        )}
        className="w-full rounded-sm border border-ring bg-transparent px-1 py-0.5 text-[17px] font-semibold leading-snug text-foreground outline-none"
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
    )
  }

  return (
    <h2
      className={cn(
        'flex items-center gap-2 text-[17px] font-semibold leading-snug',
        task.isCompleted ? 'text-muted-foreground line-through' : 'text-foreground'
      )}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => setDraft(task.name)}
        className="-mx-1 min-w-0 rounded-sm px-1 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none"
      >
        {task.name}
      </button>
      {renaming ? (
        <LoaderCircle className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
      ) : null}
    </h2>
  )
}

/**
 * Task identity and completion.
 *
 * The checkbox is paired with the title rather than parked in a control row, because completion is a
 * statement about THIS task and reads as one when it sits on the title's baseline. Completed state
 * is also carried by the struck-through title, so it survives without hovering the toggle.
 */
export function ActiveCollabTaskHeader({
  task,
  disabled,
  completing,
  renaming,
  onCompletedChange,
  onNameChange,
  onOpenProject,
  onClose
}: ActiveCollabTaskHeaderProps): React.JSX.Element {
  const created = activeCollabStamp(task.createdOn, 'date')
  const toggleLabel = task.isCompleted
    ? translate('auto.components.activecollab.task_workspace.reopen', 'Reopen task')
    : translate('auto.components.activecollab.task_workspace.complete', 'Complete task')
  const { binding, startWork } = useActiveCollabStartWork(task.projectId)
  // When a chat workspace owns this task's project, the discussion lands there — say so.
  const discussWorkspace = useAppStore((s) =>
    findChatWorkspaceForProject(s.chatWorkspaces, task.projectId)
  )
  const discussLabel = discussWorkspace
    ? translate(
        'auto.components.activecollab.task_workspace.discuss_workspace',
        'Discuss in workspace'
      )
    : translate('auto.components.activecollab.task_workspace.discuss', 'Discuss in chat')
  const instanceUrl = useAppStore((s) => s.activeCollabStatus.connection?.instanceUrl ?? null)
  const browserUrl =
    instanceUrl && task.urlPath ? `${instanceUrl.replace(/\/+$/, '')}${task.urlPath}` : null
  const openInBrowserLabel = translate(
    'auto.components.activecollab.task_workspace.open_in_browser',
    'Open in browser'
  )
  const canStartWork = binding.kind === 'ready' || binding.kind === 'needs-repo'
  // Hidden, not disabled: a permanently greyed button with no way to enable it is worse than no
  // button at all while the binding UI is off.
  const showStartWork = ACTIVECOLLAB_SITE_BINDING_UI_ENABLED
  const startWorkHint = canStartWork
    ? translate(
        'auto.components.activecollab.task_workspace.start_work_hint',
        'Create a workspace in the linked site and brief an agent on this task'
      )
    : translate(
        'auto.components.activecollab.task_workspace.start_work_unbound',
        'Link this project to a site first — use the link button on the project heading'
      )

  return (
    <header className="flex-none border-b border-border/50 bg-muted/30 px-4 py-3">
      {/* One provider for the whole row: the completion toggle and the start-work button both use
          tooltips, and nesting a second provider inside the first buys nothing. */}
      <TooltipProvider delayDuration={300}>
        <div className="flex items-start gap-2.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-pressed={task.isCompleted}
                aria-label={toggleLabel}
                disabled={disabled}
                onClick={() => onCompletedChange(!task.isCompleted)}
                className={cn(
                  'mt-px flex size-[18px] shrink-0 cursor-pointer items-center justify-center rounded-full border transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-default disabled:opacity-50',
                  task.isCompleted
                    ? 'border-primary bg-primary text-primary-foreground'
                    : // A ghost check on hover: the affordance is discoverable without a label.
                      'border-border text-transparent hover:border-foreground/40 hover:text-muted-foreground'
                )}
              >
                {completing ? (
                  <LoaderCircle className="size-3 animate-spin text-muted-foreground" />
                ) : (
                  <Check className="size-3" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{toggleLabel}</TooltipContent>
          </Tooltip>

          <div className="min-w-0 flex-1">
            <ActiveCollabTaskTitle
              // Keyed per task so a rename draft never follows the selection to the next task.
              key={task.id}
              task={task}
              disabled={disabled}
              renaming={renaming}
              onNameChange={onNameChange}
            />
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
              <span className="flex min-w-0 items-center gap-1.5">
                <ActiveCollabIcon className="size-3 shrink-0" />
                {onOpenProject ? (
                  <button
                    type="button"
                    onClick={() => onOpenProject(task.projectId, task.projectName)}
                    aria-label={translate(
                      'auto.components.activecollab.task_workspace.open_project',
                      'View all tasks in {{project}}',
                      { project: task.projectName }
                    )}
                    className="min-w-0 truncate rounded-sm font-medium text-foreground/80 transition-colors hover:text-foreground hover:underline hover:underline-offset-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    {task.projectName}
                  </button>
                ) : (
                  <span className="min-w-0 truncate font-medium text-foreground/80">
                    {task.projectName}
                  </span>
                )}
              </span>
              <span aria-hidden="true" className={DOT} />
              <span className="shrink-0 font-mono">
                {translate(
                  'auto.components.activecollab.task_workspace.task_number',
                  'Task #{{value0}}',
                  { value0: task.taskNumber }
                )}
              </span>
              {created ? (
                <>
                  <span aria-hidden="true" className={DOT} />
                  {/* Author folded in here rather than given a metadata row of its own: it is
                      reference, it was already sitting next to the creation date, and the row it
                      cost was the most expensive thing in a pane people mostly read. */}
                  <time dateTime={created.iso} className="shrink-0">
                    {task.createdByName === null
                      ? translate(
                          'auto.components.activecollab.task_workspace.created_on',
                          'Created {{value0}}',
                          { value0: created.label }
                        )
                      : translate(
                          'auto.components.activecollab.task_workspace.created_on_by',
                          'Created {{value0}} by {{value1}}',
                          { value0: created.label, value1: task.createdByName }
                        )}
                  </time>
                </>
              ) : null}
            </p>
          </div>

          {showStartWork ? (
            // Disabled-with-a-reason rather than hidden when unbound: the pane has room for the
            // explanation and is where someone goes looking for what they can do with a task.
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="shrink-0">
                  <Button
                    variant="outline"
                    size="xs"
                    disabled={!canStartWork}
                    onClick={() => startWork(task)}
                  >
                    <Play aria-hidden="true" className="size-3" />
                    {translate(
                      'auto.components.activecollab.task_workspace.start_work',
                      'Start workspace'
                    )}
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom">{startWorkHint}</TooltipContent>
            </Tooltip>
          ) : null}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="-mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
                aria-label={discussLabel}
                onClick={() => void discussTaskInChat(task)}
              >
                <MessageSquarePlus className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{discussLabel}</TooltipContent>
          </Tooltip>
          {browserUrl ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="-mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
                  aria-label={openInBrowserLabel}
                  onClick={() => void window.api.shell.openUrl(browserUrl)}
                >
                  <ExternalLink className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{openInBrowserLabel}</TooltipContent>
            </Tooltip>
          ) : null}
          {onClose ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="-mr-1 -mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
                  aria-label={translate(
                    'auto.components.activecollab.task_workspace.close',
                    'Close task details'
                  )}
                  onClick={onClose}
                >
                  <X className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {translate(
                  'auto.components.activecollab.task_workspace.close',
                  'Close task details'
                )}
              </TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      </TooltipProvider>
    </header>
  )
}
