import type { TabAttention } from '../../../../shared/types'

export type TabTrailingIndicator = 'review' | 'dirty' | 'changed' | 'pinned'
export type TabCloseVisibility = 'always' | 'hover' | 'never'

export type TabTrailingState = {
  indicator: TabTrailingIndicator | null
  close: TabCloseVisibility
}

/** One rule for every tab type: what the fixed trailing slot shows when not hovered. */
export function resolveTabTrailingState({
  isActive,
  isPinned,
  isDirty = false,
  attention
}: {
  isActive: boolean
  isPinned: boolean
  isDirty?: boolean
  attention?: TabAttention | null
}): TabTrailingState {
  if (isPinned) {
    return { indicator: 'pinned', close: 'never' }
  }
  const indicator: TabTrailingIndicator | null =
    attention === 'review'
      ? 'review'
      : isDirty
        ? 'dirty'
        : attention === 'changed'
          ? 'changed'
          : null
  if (indicator) {
    // Why: the dot outranks the active tab's close button so unsaved or review state stays visible.
    return { indicator, close: 'hover' }
  }
  return { indicator: null, close: isActive ? 'always' : 'hover' }
}
