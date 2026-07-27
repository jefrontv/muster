// The always-visible statement of what the ActiveCollab list is scoped to, and the only place a
// binding is set or cleared.
//
// It renders in every state — including unbound — because the alternative is a list that silently
// shows either one project or all of them with nothing on screen saying which. A binding whose
// project has vanished upstream gets the loudest treatment: the list underneath it is empty, and
// an empty list with no explanation is the failure this bar exists to prevent.
import React from 'react'
import { Link2Off } from 'lucide-react'

import { ActiveCollabProjectPicker } from '@/components/activecollab-project-binding-picker'
import {
  activeCollabBindingDisplayName,
  type ActiveCollabBindingStatus
} from '@/components/activecollab-project-binding-state'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type { ActiveCollabProjectBindingController } from '@/hooks/useActiveCollabProjectBinding'

function bindingMessage(status: ActiveCollabBindingStatus, musterProjectName: string): string {
  switch (status.kind) {
    case 'unbound':
      return translate(
        'auto.components.activecollab.project_binding.unbound',
        'Showing every task assigned to you. Bind an ActiveCollab project to {{value0}} to narrow it.',
        { value0: musterProjectName }
      )
    case 'missing':
      return translate(
        'auto.components.activecollab.project_binding.missing',
        '{{value0}} is no longer available in ActiveCollab. Pick another project, or show every assigned task.',
        { value0: status.binding.projectName }
      )
    case 'bound':
    case 'unverified':
      return translate(
        'auto.components.activecollab.project_binding.scoped',
        '{{value0}} is showing tasks from {{value1}}.',
        { value0: musterProjectName, value1: activeCollabBindingDisplayName(status) ?? '' }
      )
  }
}

export function ActiveCollabProjectBindingBar({
  targetProject,
  status,
  projects,
  projectsLoading,
  projectsError,
  ensureProjects,
  bind,
  clear
}: ActiveCollabProjectBindingController): React.JSX.Element {
  if (!targetProject) {
    return (
      <p className="border-b border-border/50 px-3 py-2 text-xs text-muted-foreground">
        {translate(
          'auto.components.activecollab.project_binding.no_target',
          'Open a workspace to bind an ActiveCollab project to it.'
        )}
      </p>
    )
  }

  const missing = status.kind === 'missing'
  const scoped = status.kind !== 'unbound'

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 border-b border-border/50 px-3 py-2',
        missing && 'bg-destructive/5'
      )}
    >
      <p
        className={cn(
          'min-w-0 flex-1 text-xs',
          missing ? 'text-destructive' : 'text-muted-foreground'
        )}
      >
        {bindingMessage(status, targetProject.displayName)}
      </p>
      <ActiveCollabProjectPicker
        projects={projects}
        loading={projectsLoading}
        errorMessage={projectsError}
        selectedProjectId={scoped ? status.binding.projectId : null}
        // Why louder when unbound: bound and missing are STATUS, but unbound is an offer, and as a
        // quiet outline button beside muted text it read as chrome — users asked how binding was
        // even done. Tinting it while it is the one useful action here makes the offer legible
        // without leaving a permanently shouty control behind once a binding exists.
        triggerClassName={
          scoped ? undefined : 'border-primary/50 text-foreground hover:bg-primary/10'
        }
        label={
          scoped
            ? translate('auto.components.activecollab.project_binding.change', 'Change project')
            : translate('auto.components.activecollab.project_binding.bind', 'Bind project')
        }
        onOpen={ensureProjects}
        onSelect={bind}
      />
      {scoped ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 text-xs"
          onClick={clear}
        >
          <Link2Off className="size-3.5" />
          {translate('auto.components.activecollab.project_binding.clear', 'Show all tasks')}
        </Button>
      ) : null}
    </div>
  )
}
