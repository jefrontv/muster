import React from 'react'
import { Plus } from 'lucide-react'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import SidebarWorkspaceOptionsMenu from './SidebarWorkspaceOptionsMenu'
import { translate } from '@/i18n/i18n'

type SidebarHeaderProps = {
  onWorkspaceBoardMenuOpenChange: (open: boolean) => void
}

const SidebarHeader = React.memo(function SidebarHeader({
  onWorkspaceBoardMenuOpenChange
}: SidebarHeaderProps) {
  const openModal = useAppStore((s) => s.openModal)
  const groupBy = useAppStore((s) => s.groupBy)
  const sidebarTitle = groupBy === 'repo' ? 'Projects' : 'Workspaces'

  return (
    <div className="mt-2 flex h-8 items-center justify-between px-2 gap-2">
      <div className="flex min-w-0 items-center gap-1">
        <span
          className="pl-2 pr-0.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-worktree-sidebar-muted-foreground select-none"
          data-sidebar-section-title={groupBy === 'repo' ? 'projects' : 'workspaces'}
        >
          {sidebarTitle}
        </span>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <SidebarWorkspaceOptionsMenu
          preserveWorkspaceBoardOpen
          onMenuOpenChange={onWorkspaceBoardMenuOpenChange}
        />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              className="text-muted-foreground"
              aria-label={translate(
                'auto.components.sidebar.SidebarHeader.25a95899c9',
                'Add Project'
              )}
              onClick={() => openModal('add-repo')}
            >
              <Plus className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            {translate('auto.components.sidebar.SidebarHeader.25a95899c9', 'Add Project')}
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
})

export default SidebarHeader
