import React from 'react'
import { CONTROL_HOVER } from '@/components/ui/hover-fill-classes'
import { MoreHorizontal } from 'lucide-react'
import type { ActiveRightSidebarTab } from '@/store/slices/editor'
import type { CheckStatus } from '../../../../shared/types'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { RIGHT_SIDEBAR_HEADER_NO_DRAG_CLASS_NAME } from './right-sidebar-titlebar-drag-regions'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'

export type ActivityBarItem = {
  id: ActiveRightSidebarTab
  icon: React.ComponentType<{ size?: number; className?: string }>
  title: string
  shortcut: string
  /** When true, hidden for non-git (folder-mode) repos. */
  gitOnly?: boolean
  /** When true, shown only for folder workspaces. */
  folderOnly?: boolean
  /** When true, shown only for worktrees that belong to an SSH repo. */
  sshOnly?: boolean
  /** When true, shown only when the active project resolves to a Site record. */
  siteOnly?: boolean
}

const STATUS_DOT_COLOR: Record<CheckStatus, string> = {
  success: 'bg-status-success',
  failure: 'bg-status-danger',
  pending: 'bg-status-attention',
  neutral: 'bg-muted-foreground'
}

// Matches the round 28px icon buttons used across app chrome; selection is a fill, like other selectors.
const ACTIVITY_BUTTON_CLASS =
  'relative flex size-7 shrink-0 items-center justify-center rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring'

export function TopActivityOverflowMenu({
  items,
  activeTab,
  onSelect,
  checksStatus
}: {
  items: ActivityBarItem[]
  activeTab: ActiveRightSidebarTab
  onSelect: (tab: ActiveRightSidebarTab) => void
  checksStatus?: CheckStatus | null
}): React.JSX.Element {
  const hiddenChecksStatus =
    checksStatus && checksStatus !== 'neutral' && items.some((item) => item.id === 'checks')
      ? checksStatus
      : null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            ACTIVITY_BUTTON_CLASS,
            CONTROL_HOVER,
            'text-muted-foreground hover:text-foreground',
            RIGHT_SIDEBAR_HEADER_NO_DRAG_CLASS_NAME
          )}
          aria-label={translate(
            'auto.components.right.sidebar.activity.bar.buttons.1fd284e931',
            'More sidebar tabs'
          )}
        >
          <MoreHorizontal size={14} />
          {hiddenChecksStatus && (
            <div
              className={cn(
                'absolute top-[3px] right-[3px] size-[7px] rounded-full ring-1 ring-sidebar',
                STATUS_DOT_COLOR[hiddenChecksStatus] ?? 'bg-muted-foreground'
              )}
            />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="bottom" sideOffset={6}>
        {items.map((item) => {
          const Icon = item.icon
          const active = item.id === activeTab
          return (
            <DropdownMenuItem
              key={item.id}
              onSelect={() => onSelect(item.id)}
              className={cn(active && 'bg-accent text-accent-foreground')}
              aria-current={active ? 'page' : undefined}
            >
              <Icon size={14} />
              <span>{item.title}</span>
              {item.shortcut && <DropdownMenuShortcut>{item.shortcut}</DropdownMenuShortcut>}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function ActivityBarButton({
  item,
  active,
  onClick,
  layout,
  statusIndicator
}: {
  item: ActivityBarItem
  active: boolean
  onClick: () => void
  layout: 'top' | 'side'
  statusIndicator?: CheckStatus | null
}): React.JSX.Element {
  const Icon = item.icon
  const isTop = layout === 'top'

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(
            ACTIVITY_BUTTON_CLASS,
            RIGHT_SIDEBAR_HEADER_NO_DRAG_CLASS_NAME,
            active
              ? // A step above the hover fill, so the selected tab still reads while another is hovered.
                'bg-foreground/[0.1] text-foreground'
              : cn(CONTROL_HOVER, 'text-muted-foreground hover:text-foreground')
          )}
          aria-pressed={active}
          onClick={onClick}
          aria-label={item.shortcut ? `${item.title} (${item.shortcut})` : item.title}
        >
          <Icon size={14} />

          {statusIndicator && statusIndicator !== 'neutral' && (
            <div
              className={cn(
                'absolute top-[3px] right-[3px] size-[7px] rounded-full ring-1 ring-sidebar',
                STATUS_DOT_COLOR[statusIndicator] ?? 'bg-muted-foreground'
              )}
            />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side={isTop ? 'bottom' : 'left'} sideOffset={6}>
        {item.shortcut ? `${item.title} (${item.shortcut})` : item.title}
      </TooltipContent>
    </Tooltip>
  )
}
