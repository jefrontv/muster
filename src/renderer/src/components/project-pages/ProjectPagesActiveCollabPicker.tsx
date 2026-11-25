// "/task" and "/project" in Pages: pick an ActiveCollab task or project and add it as a card,
// a link or (tasks only) a quote of its description.
import { FolderKanban, SquareCheckBig, Undo2 } from 'lucide-react'
import type React from 'react'
import { useEffect, useState } from 'react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import { translate } from '@/i18n/i18n'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import type { ActiveCollabProject, ActiveCollabTask } from '../../../../shared/activecollab-types'
import { projectTaskList } from './project-pages-activecollab-data'
import {
  insertActiveCollabRef,
  onActiveCollabPicker,
  type ActiveCollabInsertMode,
  type ActiveCollabPick
} from './project-pages-activecollab-insert'

type Request = Parameters<Parameters<typeof onActiveCollabPicker>[0]>[0]

const insertModes = createLocalizedCatalog(
  (): { mode: ActiveCollabInsertMode; label: string }[] => [
    {
      mode: 'card',
      label: translate('auto.components.projectPages.activeCollab.mode.card', 'Card')
    },
    {
      mode: 'link',
      label: translate('auto.components.projectPages.activeCollab.mode.link', 'Link')
    },
    {
      mode: 'quote',
      label: translate('auto.components.projectPages.activeCollab.mode.quote', 'Quote')
    }
  ]
)

function matches(text: string, needle: string): boolean {
  return text.toLowerCase().includes(needle)
}

function taskMatches(task: ActiveCollabTask, needle: string): boolean {
  return (
    !needle ||
    matches(task.name, needle) ||
    `#${task.taskNumber}`.startsWith(`#${needle.replace(/^#/, '')}`)
  )
}

function TaskRow({ task, onPick }: { task: ActiveCollabTask; onPick: () => void }) {
  return (
    <CommandItem value={`task-${task.id}`} onSelect={onPick}>
      <SquareCheckBig className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">{task.name}</span>
      <span className="shrink-0 text-xs text-muted-foreground">
        {task.projectName} · #{task.taskNumber}
      </span>
    </CommandItem>
  )
}

function ProjectRow({ project, onPick }: { project: ActiveCollabProject; onPick: () => void }) {
  return (
    <CommandItem value={`project-${project.id}`} onSelect={onPick}>
      <FolderKanban className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">{project.name}</span>
      {project.openTaskCount !== null ? (
        <span className="shrink-0 text-xs text-muted-foreground">
          {translate('auto.components.projectPages.activeCollab.openCount', '{{value0}} open', {
            value0: project.openTaskCount
          })}
        </span>
      ) : null}
    </CommandItem>
  )
}

export function ProjectPagesActiveCollabPicker(): React.JSX.Element | null {
  const [request, setRequest] = useState<Request | null>(null)
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<ActiveCollabInsertMode>('card')
  const [assigned, setAssigned] = useState<ActiveCollabTask[] | null>(null)
  const [projects, setProjects] = useState<ActiveCollabProject[] | null>(null)
  const [project, setProject] = useState<ActiveCollabProject | null>(null)
  const [projectTasks, setProjectTasks] = useState<ActiveCollabTask[] | null>(null)

  useEffect(
    () =>
      onActiveCollabPicker((next) => {
        setRequest(next)
        setQuery('')
        setProject(null)
        setMode('card')
        const store = useAppStore.getState()
        void store.listActiveCollabProjects().then((r) => setProjects(r.ok ? r.value : []))
        if (next.kind === 'task') {
          void store
            .listActiveCollabAssignedTasks({ page: 1 })
            .then((r) => setAssigned(r.ok ? r.value.tasks : []))
        }
      }),
    []
  )

  useEffect(() => {
    if (!project) {
      return undefined
    }
    let stale = false
    setProjectTasks(null)
    void projectTaskList(project.id).then((tasks) => !stale && setProjectTasks(tasks))
    return () => {
      stale = true
    }
  }, [project])

  if (!request) {
    return null
  }
  const close = (): void => setRequest(null)
  const insert = (pick: Omit<ActiveCollabPick, 'mode'>, as: ActiveCollabInsertMode): void => {
    close()
    insertActiveCollabRef(request.editor, { ...pick, mode: as })
  }
  const pickTask = (task: ActiveCollabTask): void =>
    insert(
      {
        ref: { kind: 'task', projectId: task.projectId, taskId: task.id },
        title: task.name,
        bodyHtml: task.bodyHtml
      },
      mode
    )
  const pickProject = (picked: ActiveCollabProject): void =>
    insert(
      { ref: { kind: 'project', projectId: picked.id }, title: picked.name },
      mode === 'link' ? 'link' : 'card'
    )

  const needle = query.trim().toLowerCase()
  const forTask = request.kind === 'task'
  const taskRows = (project ? projectTasks : assigned)?.filter((t) => taskMatches(t, needle)) ?? []
  const projectRows = (projects ?? [])
    .filter((p) => !p.isCompleted || !forTask)
    .filter((p) => !needle || matches(p.name, needle))
    .slice(0, forTask ? 6 : 50)
  const loading = forTask ? (project ? projectTasks : assigned) === null : projects === null
  const modes = forTask ? insertModes() : insertModes().slice(0, 2)

  return (
    <CommandDialog
      open
      onOpenChange={(open) => !open && close()}
      shouldFilter={false}
      title={
        forTask
          ? translate(
              'auto.components.projectPages.activeCollab.addTask',
              'Add an ActiveCollab task'
            )
          : translate(
              'auto.components.projectPages.activeCollab.addProject',
              'Add an ActiveCollab project'
            )
      }
      description={translate(
        'auto.components.projectPages.activeCollab.searchHint',
        'Search by name or task number.'
      )}
    >
      <CommandInput
        value={query}
        onValueChange={setQuery}
        onKeyDown={(event) => {
          if (event.key === 'Backspace' && !query && project) {
            setProject(null)
          }
        }}
        placeholder={
          project
            ? translate(
                'auto.components.projectPages.activeCollab.tasksIn',
                'Tasks in {{value0}}…',
                { value0: project.name }
              )
            : forTask
              ? translate(
                  'auto.components.projectPages.activeCollab.findTaskOrProject',
                  'Find a task or project…'
                )
              : translate(
                  'auto.components.projectPages.activeCollab.findProject',
                  'Find a project…'
                )
        }
      />
      <div className="flex items-center gap-1 border-b border-border px-3 py-2">
        <span className="mr-1 text-xs text-muted-foreground">
          {translate('auto.components.projectPages.activeCollab.addAs', 'Add as')}
        </span>
        {modes.map((item) => (
          <button
            key={item.mode}
            type="button"
            aria-pressed={mode === item.mode}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setMode(item.mode)}
            className={cn(
              'rounded-md px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground',
              mode === item.mode && 'bg-accent font-medium text-foreground'
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      <CommandList>
        <CommandEmpty>
          {loading
            ? translate(
                'auto.components.projectPages.activeCollab.loading',
                'Loading from ActiveCollab…'
              )
            : translate('auto.components.projectPages.activeCollab.empty', 'Nothing matches.')}
        </CommandEmpty>
        {project ? (
          <CommandItem value="back" onSelect={() => setProject(null)}>
            <Undo2 className="size-4 shrink-0 text-muted-foreground" />
            <span className="flex-1 text-muted-foreground">
              {translate('auto.components.projectPages.activeCollab.allMyTasks', 'All my tasks')}
            </span>
          </CommandItem>
        ) : null}
        {forTask && taskRows.length > 0 ? (
          <CommandGroup heading={project ? project.name : 'Assigned to you'}>
            {taskRows.slice(0, 50).map((task) => (
              <TaskRow key={task.id} task={task} onPick={() => pickTask(task)} />
            ))}
          </CommandGroup>
        ) : null}
        {!project && (!forTask || needle) && projectRows.length > 0 ? (
          <CommandGroup heading={forTask ? 'Tasks in a project' : 'Projects'}>
            {projectRows.map((row) => (
              <ProjectRow
                key={row.id}
                project={row}
                onPick={() => {
                  if (forTask) {
                    setProject(row)
                    setQuery('')
                  } else {
                    pickProject(row)
                  }
                }}
              />
            ))}
          </CommandGroup>
        ) : null}
      </CommandList>
    </CommandDialog>
  )
}
