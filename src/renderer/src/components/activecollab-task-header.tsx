import React from 'react'
import { Check, LoaderCircle, Play, X } from 'lucide-react'

import { ActiveCollabIcon } from '@/components/icons/ActiveCollabIcon'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type { ActiveCollabTask } from '../../../shared/activecollab-types'
import { activeCollabStamp } from './activecollab-task-timestamps'
import { useActiveCollabStartWork } from './use-activecollab-start-work'
import { ACTIVECOLLAB_SITE_BINDING_UI_ENABLED } from '@/lib/activecollab-site-binding-visibility'

// A drawn dot rather than a typed middot: the identity line is decoration between localized
// fragments, and punctuation as text would need translating.
const DOT = 'size-1 shrink-0 rounded-full bg-muted-foreground/40'

type ActiveCollabTaskHeaderProps = {
  task: ActiveCollabTask
  /** Any write in flight; the toggle locks with the rest of the pane. */
  disabled: boolean
  completing: boolean
  onCompletedChange: (completed: boolean) => void
  /** Present when the project name should open the project drill-in view. */
  onOpenProject?: (id: number, name: string) => void
  /** Collapse the detail pane back to the list. */
  onClose?: () => void
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
  onCompletedChange,
  onOpenProject,
  onClose
}: ActiveCollabTaskHeaderProps): React.JSX.Element {
  const created = activeCollabStamp(task.createdOn, 'date')
  const toggleLabel = task.isCompleted
    ? translate('auto.components.activecollab.task_workspace.reopen', 'Reopen task')
    : translate('auto.components.activecollab.task_workspace.complete', 'Complete task')
  const { binding, startWork } = useActiveCollabStartWork(task.projectId)
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
            <h2
              className={cn(
                'text-[17px] font-semibold leading-snug',
                task.isCompleted ? 'text-muted-foreground line-through' : 'text-foreground'
              )}
            >
              {task.name}
            </h2>
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
                  <time dateTime={created.iso} className="shrink-0">
                    {translate(
                      'auto.components.activecollab.task_workspace.created_on',
                      'Created {{value0}}',
                      { value0: created.label }
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
