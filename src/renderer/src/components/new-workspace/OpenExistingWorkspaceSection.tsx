// The composer's "Open" tab body: pick a project, see exactly which checkout
// and branch will open, pick the agent to launch into it. No git mutations.

import { FolderOpen, GitBranch } from 'lucide-react'
import type React from 'react'
import { useMemo } from 'react'
import type { TuiAgent } from '../../../../shared/types'
import { filterEnabledTuiAgents } from '../../../../shared/tui-agent-selection'
import { getAgentCatalog } from '@/lib/agent-catalog'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import AgentCombobox from '@/components/agent/AgentCombobox'
import ProjectCombobox from '@/components/new-workspace/ProjectCombobox'
import type { NewWorkspaceProjectOption } from '@/lib/new-workspace-project-options'
import { useAppStore } from '@/store'
import { describeExistingWorkspaceCheckout } from './open-existing-workspace'

export function OpenExistingWorkspaceSection({
  projectOptions,
  selectedProjectId,
  selectedRepoId,
  onProjectChange,
  onAddProject,
  quickAgent,
  onQuickAgentChange,
  detectedAgentIds,
  onOpenAgentSettings,
  onOpen
}: {
  projectOptions: readonly NewWorkspaceProjectOption[]
  selectedProjectId: string | null
  /** The repo id behind the selection (null for groups/no selection). */
  selectedRepoId: string | null
  onProjectChange: (projectId: string) => void
  onAddProject: () => void
  quickAgent: TuiAgent | null
  onQuickAgentChange: (agent: TuiAgent | null) => void
  detectedAgentIds: Set<TuiAgent> | null
  onOpenAgentSettings: () => void
  onOpen: () => void
}): React.JSX.Element {
  const disabledTuiAgents = useAppStore((s) => s.settings?.disabledTuiAgents)
  const defaultTuiAgent = useAppStore((s) => s.settings?.defaultTuiAgent ?? null)
  const updateSettings = useAppStore((s) => s.updateSettings)
  // Subscribe so the summary updates when worktrees hydrate after mount.
  const worktreesByRepo = useAppStore((s) => s.worktreesByRepo)
  const checkout = useMemo(
    () => describeExistingWorkspaceCheckout(selectedRepoId),
    // worktreesByRepo is the store input describe reads; it must retrigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedRepoId, worktreesByRepo]
  )
  const visibleAgents = useMemo(() => {
    const enabledIds = new Set(
      filterEnabledTuiAgents(
        getAgentCatalog().map((agent) => agent.id),
        disabledTuiAgents
      )
    )
    return getAgentCatalog().filter(
      (agent) =>
        enabledIds.has(agent.id) && (detectedAgentIds === null || detectedAgentIds.has(agent.id))
    )
  }, [detectedAgentIds, disabledTuiAgents])
  const openDisabled = checkout === null

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-2 scrollbar-sleek">
      <div className="space-y-1.5">
        <Label className="text-xs">
          {translate('auto.components.new.workspace.open.project', 'Project')}
        </Label>
        <ProjectCombobox
          options={projectOptions}
          value={selectedProjectId}
          onValueChange={onProjectChange}
          onAddProject={onAddProject}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">
          {translate('auto.components.new.workspace.open.opens', 'Opens')}
        </Label>
        {checkout ? (
          <div className="space-y-1 rounded-md border border-border/70 bg-muted/35 px-3 py-2">
            <p className="flex items-center gap-1.5 truncate font-mono text-xs text-foreground">
              <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{checkout.path}</span>
            </p>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <GitBranch className="size-3.5 shrink-0" />
              {checkout.branch ||
                translate('auto.components.new.workspace.open.noBranch', 'current state')}
            </p>
          </div>
        ) : (
          <p className="rounded-md border border-border/70 bg-muted/35 px-3 py-2 text-xs text-muted-foreground">
            {translate(
              'auto.components.new.workspace.open.noCheckout',
              'This project has no checkout to open yet — create a worktree instead.'
            )}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          {translate(
            'auto.components.new.workspace.open.hint',
            'Opens the existing checkout on its current branch — nothing new is created.'
          )}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">
          {translate('auto.components.new.workspace.open.agent', 'Agent')}
        </Label>
        <AgentCombobox
          agents={visibleAgents}
          value={quickAgent}
          onValueChange={onQuickAgentChange}
          onOpenManageAgents={onOpenAgentSettings}
          defaultAgent={defaultTuiAgent}
          onSetDefault={(next) => void updateSettings({ defaultTuiAgent: next })}
          triggerClassName="h-9 w-full border-input text-sm focus:border-ring focus:ring-[3px] focus:ring-ring/50"
          onTriggerEnter={openDisabled ? undefined : onOpen}
        />
      </div>

      <div className="mt-auto flex justify-end pt-2">
        <Button type="button" disabled={openDisabled} onClick={onOpen}>
          {translate('auto.components.new.workspace.open.submit', 'Open workspace')}
        </Button>
      </div>
    </div>
  )
}
