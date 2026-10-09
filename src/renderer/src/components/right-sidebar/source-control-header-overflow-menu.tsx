import React from 'react'
import {
  ArchiveRestore,
  Archive,
  List,
  ListTree,
  MessageSquare,
  MoreHorizontal,
  RefreshCw,
  Settings2
} from 'lucide-react'
import type { SourceControlViewMode } from '../../../../shared/types'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import type { SourceControlStashMenu } from './use-source-control-stash-actions'

export function SourceControlHeaderOverflowMenu({
  sourceControlViewMode,
  viewModeToggleDisabled,
  onToggleViewMode,
  onChangeBaseRef,
  onRefreshBranchCompare,
  branchCompareRefreshDisabled,
  diffCommentCount,
  onExpandNotes,
  stashMenu = null
}: {
  sourceControlViewMode: SourceControlViewMode
  viewModeToggleDisabled: boolean
  onToggleViewMode: () => void
  onChangeBaseRef: () => void
  onRefreshBranchCompare: () => void
  branchCompareRefreshDisabled: boolean
  diffCommentCount: number
  onExpandNotes: () => void
  // null for folder workspaces, which have no stash.
  stashMenu?: SourceControlStashMenu | null
}): React.JSX.Element {
  const viewModeLabel =
    sourceControlViewMode === 'tree'
      ? translate('auto.components.right.sidebar.SourceControl.a91f8e2b01', 'View as list')
      : translate('auto.components.right.sidebar.SourceControl.b82e9f3c12', 'View as tree')

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) {
          stashMenu?.onMenuOpen()
        }
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex shrink-0">
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="size-7 text-muted-foreground hover:text-foreground"
                aria-label={translate(
                  'auto.components.right.sidebar.SourceControl.f71c4a8d90',
                  'More source control actions'
                )}
              >
                <MoreHorizontal className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>
          {translate(
            'auto.components.right.sidebar.SourceControl.f71c4a8d90',
            'More source control actions'
          )}
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="min-w-[180px]">
        <DropdownMenuItem disabled={viewModeToggleDisabled} onSelect={onToggleViewMode}>
          {sourceControlViewMode === 'tree' ? (
            <List className="size-3.5" />
          ) : (
            <ListTree className="size-3.5" />
          )}
          {viewModeLabel}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onChangeBaseRef}>
          <Settings2 className="size-3.5" />
          {translate('auto.components.right.sidebar.SourceControl.476b77745b', 'Change Base Ref')}…
        </DropdownMenuItem>
        <DropdownMenuItem disabled={branchCompareRefreshDisabled} onSelect={onRefreshBranchCompare}>
          <RefreshCw className="size-3.5" />
          {translate(
            'auto.components.right.sidebar.SourceControl.ed34038d0d',
            'Refresh branch compare'
          )}
        </DropdownMenuItem>
        {stashMenu ? <StashMenuItems stashMenu={stashMenu} /> : null}
        {diffCommentCount > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onExpandNotes}>
              <MessageSquare className="size-3.5" />
              {translate('auto.components.right.sidebar.SourceControl.cc474e0b8c', 'Notes')}
              <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
                {diffCommentCount}
              </span>
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function StashMenuItems({ stashMenu }: { stashMenu: SourceControlStashMenu }): React.JSX.Element {
  const { canStash, branchStash, disabled, onStash, onPop } = stashMenu
  const stash = branchStash?.stash ?? null
  // Why: disabled menu items can't show tooltips, so the reason is inline text.
  const popDisabledReason = !branchStash
    ? null
    : !branchStash.branch
      ? translate(
          'auto.components.right.sidebar.source.control.stash.detachedHead',
          'Detached HEAD'
        )
      : !stash
        ? translate(
            'auto.components.right.sidebar.source.control.stash.noStashForBranch',
            'No stash for {{value0}}',
            { value0: branchStash.branch }
          )
        : null
  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuItem disabled={disabled || !canStash} onSelect={onStash}>
        <Archive className="size-3.5" />
        {translate(
          'auto.components.right.sidebar.source.control.stash.stashChanges',
          'Stash Changes'
        )}
      </DropdownMenuItem>
      <DropdownMenuItem disabled={disabled || !stash} onSelect={onPop} title={stash?.subject}>
        <ArchiveRestore className="size-3.5" />
        {translate(
          'auto.components.right.sidebar.source.control.stash.popLatest',
          'Pop Latest Stash'
        )}
        {popDisabledReason ? (
          <span className="ml-auto max-w-[120px] truncate pl-2 text-[11px] text-muted-foreground">
            {popDisabledReason}
          </span>
        ) : null}
      </DropdownMenuItem>
    </>
  )
}
