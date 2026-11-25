import type React from 'react'
import { useAppStore } from '@/store'
import { cn } from '@/lib/utils'
import type { TabAttention } from '../../../../shared/types'
import type { TabTrailingIndicator } from './tab-trailing-state'

export function useTabAttention(
  worktreeId: string,
  tabId: string | undefined
): TabAttention | undefined {
  return useAppStore(
    (s) => s.unifiedTabsByWorktree?.[worktreeId]?.find((tab) => tab.id === tabId)?.attention
  )
}

const DOT_CLASSES: Record<Exclude<TabTrailingIndicator, 'pinned'>, string> = {
  review: 'size-2 bg-status-attention motion-safe:animate-pulse',
  dirty: 'size-1.5 bg-foreground/70',
  changed: 'size-1.5 bg-status-attention'
}

export function TabStateDot({
  indicator,
  hideOnHover
}: {
  indicator: Exclude<TabTrailingIndicator, 'pinned'>
  hideOnHover: boolean
}): React.JSX.Element {
  return (
    <span
      data-tab-state-dot={indicator}
      data-tab-attention={indicator === 'dirty' ? undefined : indicator}
      aria-hidden
      className={cn(
        'absolute rounded-full',
        DOT_CLASSES[indicator],
        hideOnHover && 'group-hover:hidden group-focus-within:hidden'
      )}
    />
  )
}
