// Quick-create from My Work. The create dialog itself needs a project — the project drill-in has
// one, this surface does not — so the project choice becomes a step in front of it rather than a
// prop the dialog learns to live without. The drill-in path keeps passing its own project and never
// reaches this file.
//
// One command surface covers the whole pre-step: pick a project, then wait for that project's task
// lists. A second dialog for the wait would flash a new frame in for the time it takes to load.

import React, { useCallback, useEffect, useState } from 'react'
import { LoaderCircle } from 'lucide-react'

import {
  ActiveCollabProjectCommandList,
  useActiveCollabProjectCatalog,
  type ActiveCollabProjectPick
} from '@/components/activecollab-project-picker'
import { Button } from '@/components/ui/button'
import { CommandDialog, CommandInput } from '@/components/ui/command'
import { useMountedRef } from '@/hooks/useMountedRef'
import { translate } from '@/i18n/i18n'
import {
  activeCollabCreateTask,
  activeCollabListProjectTasks
} from '@/runtime/runtime-activecollab-client'
import { useAppStore } from '@/store'
import { getActiveCollabReadScope } from '@/store/slices/activecollab-cache'
import type { ActiveCollabFailure } from '../../../shared/activecollab-api-types'
import type {
  ActiveCollabTaskList,
  ActiveCollabTaskUpdate
} from '../../../shared/activecollab-types'
import type { TaskSourceContext } from '../../../shared/task-source-context'
import { ActiveCollabTaskCreateDialog } from './activecollab-task-create-dialog'
import { describeActiveCollabFailure } from './activecollab-failure-message'

export function ActiveCollabMyWorkCreateDialog({
  onClose,
  onCreated,
  sourceContext
}: {
  onClose: () => void
  /** The list refetches on this: a task created here is assigned by the form, not by default. */
  onCreated: () => void
  sourceContext: TaskSourceContext | null
}): React.JSX.Element {
  const settings = useAppStore((s) => s.settings)
  const mountedRef = useMountedRef()
  const [project, setProject] = useState<ActiveCollabProjectPick | null>(null)
  const [taskLists, setTaskLists] = useState<readonly ActiveCollabTaskList[] | null>(null)
  const [failure, setFailure] = useState<ActiveCollabFailure | null>(null)
  const { projects } = useActiveCollabProjectCatalog(project === null)

  useEffect(() => {
    if (project === null) {
      return
    }
    setFailure(null)
    const scope = getActiveCollabReadScope(settings, sourceContext)
    void activeCollabListProjectTasks({ projectId: project.id }, scope.settings).then(
      (response) => {
        if (!mountedRef.current) {
          return
        }
        if (response.ok) {
          setTaskLists(response.value.taskLists)
          return
        }
        setFailure(response)
      }
    )
  }, [mountedRef, project, settings, sourceContext])

  const create = useCallback(
    async (args: {
      taskListId: number | null
      update: ActiveCollabTaskUpdate
      attachmentCodes: string[]
    }): Promise<ActiveCollabFailure | null> => {
      if (project === null) {
        return null
      }
      const scope = getActiveCollabReadScope(settings, sourceContext)
      const response = await activeCollabCreateTask(
        {
          projectId: project.id,
          taskListId: args.taskListId,
          update: args.update,
          attachmentCodes: args.attachmentCodes
        },
        scope.settings
      )
      if (!response.ok) {
        return response
      }
      onCreated()
      return null
    },
    [onCreated, project, settings, sourceContext]
  )

  if (project !== null && taskLists !== null) {
    return (
      <ActiveCollabTaskCreateDialog
        projectId={project.id}
        taskLists={taskLists}
        initialTaskListId={null}
        onClose={onClose}
        onCreate={create}
      />
    )
  }

  const projectSearchLabel = translate(
    'auto.components.activecollab.my_work.create_project_placeholder',
    'Search projects for the new task…'
  )
  return (
    <CommandDialog
      open
      onOpenChange={(next) => (next ? undefined : onClose())}
      title={translate('auto.components.activecollab.my_work.create_title', 'New task')}
      description={translate(
        'auto.components.activecollab.my_work.create_description',
        'Choose the project the new task belongs to.'
      )}
      // cmdk points the input's `aria-labelledby` at the Command root's label; naming the field
      // any other way loses to that.
      commandProps={{ label: projectSearchLabel }}
    >
      {project === null ? (
        <>
          <CommandInput autoFocus placeholder={projectSearchLabel} />
          <ActiveCollabProjectCommandList projects={projects} onSelect={setProject} />
        </>
      ) : failure ? (
        <div className="px-4 py-6">
          <p role="alert" className="text-[12px] text-destructive">
            {describeActiveCollabFailure(failure)}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setFailure(null)
                setProject(null)
              }}
            >
              {translate(
                'auto.components.activecollab.my_work.create_pick_again',
                'Choose another project'
              )}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center gap-2 px-4 py-8 text-[12px] text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />
          {translate(
            'auto.components.activecollab.my_work.create_loading_lists',
            'Loading task lists…'
          )}
        </div>
      )}
    </CommandDialog>
  )
}
