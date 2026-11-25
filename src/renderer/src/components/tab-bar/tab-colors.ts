import type React from 'react'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'

export type TabColorSwatch = {
  /** Stored value; saved tabs keep these hex ids, the theme token decides what renders. */
  value: string | null
  token: string | null
  readonly label: string
}

export const TAB_COLOR_SWATCHES: readonly TabColorSwatch[] = [
  {
    value: null,
    token: null,
    get label() {
      return translate('auto.components.tab.bar.SortableTabContextMenu.20baa43c05', 'None')
    }
  },
  {
    value: '#3b82f6',
    token: '--tab-color-blue',
    get label() {
      return translate('auto.components.tab.bar.SortableTabContextMenu.cb3eadefd2', 'Blue')
    }
  },
  {
    value: '#a855f7',
    token: '--tab-color-purple',
    get label() {
      return translate('auto.components.tab.bar.SortableTabContextMenu.c2d8b0991f', 'Purple')
    }
  },
  {
    value: '#ec4899',
    token: '--tab-color-pink',
    get label() {
      return translate('auto.components.tab.bar.SortableTabContextMenu.03cf6dab1a', 'Pink')
    }
  },
  {
    value: '#ef4444',
    token: '--tab-color-red',
    get label() {
      return translate('auto.components.tab.bar.SortableTabContextMenu.620aec6729', 'Red')
    }
  },
  {
    value: '#f97316',
    token: '--tab-color-orange',
    get label() {
      return translate('auto.components.tab.bar.SortableTabContextMenu.a47629b3cf', 'Orange')
    }
  },
  {
    value: '#eab308',
    token: '--tab-color-yellow',
    get label() {
      return translate('auto.components.tab.bar.SortableTabContextMenu.69682e2ce4', 'Yellow')
    }
  },
  {
    value: '#22c55e',
    token: '--tab-color-green',
    get label() {
      return translate('auto.components.tab.bar.SortableTabContextMenu.be905e9b0a', 'Green')
    }
  },
  {
    value: '#14b8a6',
    token: '--tab-color-teal',
    get label() {
      return translate('auto.components.tab.bar.SortableTabContextMenu.845576bed1', 'Teal')
    }
  },
  {
    value: '#9ca3af',
    token: '--tab-color-gray',
    get label() {
      return translate('auto.components.tab.bar.SortableTabContextMenu.7703990447', 'Gray')
    }
  }
]

/** Themed CSS colour for a stored tab colour; unknown values render as stored. */
export function resolveTabColor(color: string | null | undefined): string | null {
  if (!color) {
    return null
  }
  const swatch = TAB_COLOR_SWATCHES.find(
    (entry) => entry.value?.toLowerCase() === color.toLowerCase()
  )
  return swatch?.token ? `var(${swatch.token})` : color
}

const TINT_PERCENT = 12

// Why: an outline leaves box-shadow free for the focus ring, and a background image tints above whatever fill the state classes set.
export function getTabColorStyle(
  color: string | null | undefined
): React.CSSProperties | undefined {
  const resolved = resolveTabColor(color)
  if (!resolved) {
    return undefined
  }
  const tint = `color-mix(in oklab, ${resolved} ${TINT_PERCENT}%, transparent)`
  return {
    outline: `1px solid ${resolved}`,
    outlineOffset: '-1px',
    backgroundImage: `linear-gradient(${tint}, ${tint})`
  }
}

export function useUnifiedTabColor(
  worktreeId: string,
  unifiedTabId: string | undefined
): string | null {
  return useAppStore(
    (s) =>
      s.unifiedTabsByWorktree?.[worktreeId]?.find((tab) => tab.id === unifiedTabId)?.color ?? null
  )
}
