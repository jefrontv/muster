import type React from 'react'
import { useAppStore } from '@/store'
import type { TabAttention } from '../../../../shared/types'

export function useTabAttention(
  worktreeId: string,
  tabId: string | undefined
): TabAttention | undefined {
  return useAppStore(
    (s) => s.unifiedTabsByWorktree?.[worktreeId]?.find((tab) => tab.id === tabId)?.attention
  )
}

/** Sits in the close slot; the close button replaces it on hover, like the dirty dot. */
export function TabAttentionDot({ attention }: { attention: TabAttention }): React.JSX.Element {
  return (
    <span
      data-tab-attention={attention}
      className={`absolute size-2 rounded-full bg-status-attention group-hover:hidden group-focus-within:hidden ${
        attention === 'review' ? 'motion-safe:animate-pulse' : ''
      }`}
    />
  )
}
