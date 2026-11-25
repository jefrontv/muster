import type React from 'react'
import { useRef } from 'react'
import { SortableContext } from '@dnd-kit/sortable'
import { TabStripScrollIndicator } from './TabStripScrollIndicator'
import { getTabStripScrollMaskClassName } from './tab-strip-scroll-metrics'
import { useTabStripOverflowNavigation } from './tab-strip-overflow-navigation'
import { useTabStripDragScrollHandlers } from './tab-strip-drag-scroll'
import { useTabStripCloseFreeze } from './tab-strip-close-freeze'
import { TabStripAllTabsMenu, type TabStripMenuEntry } from './TabStripAllTabsMenu'
import { handleTabStripKeyDown } from './tab-strip-keyboard'
import { translate } from '@/i18n/i18n'

const NO_DRAG_STYLE = { WebkitAppRegion: 'no-drag' } as React.CSSProperties

/** The scrolling tab row: overflow state, close freeze, drag edge scrolling and the all tabs menu. */
export function TabStrip({
  worktreeId,
  activeVisibleTabId,
  layoutKey,
  sortableIds,
  menuEntries,
  onSelectMenuEntry,
  trailingControls,
  children
}: {
  worktreeId: string
  activeVisibleTabId: string | null
  layoutKey: string
  sortableIds: string[]
  menuEntries: readonly TabStripMenuEntry[]
  onSelectMenuEntry: (id: string) => void
  trailingControls: React.ReactNode
  children: React.ReactNode
}): React.JSX.Element {
  const { tabStripRef, tabStripOverflowState, scrollTabStrip } = useTabStripOverflowNavigation({
    activeVisibleTabId,
    layoutKey,
    tabCount: sortableIds.length,
    worktreeId
  })
  const dragScroll = useTabStripDragScrollHandlers(scrollTabStrip, {
    start: tabStripOverflowState.canScrollStart,
    end: tabStripOverflowState.canScrollEnd
  })
  const spacerRef = useRef<HTMLDivElement>(null)
  const closeFreeze = useTabStripCloseFreeze(tabStripRef, spacerRef, worktreeId)

  return (
    <>
      {/* Why: tabs ignore dnd-kit's sortable transforms; TabBar's dragSlide drives the slide so it matches the drop index. */}
      <SortableContext items={sortableIds}>
        <div
          className="relative flex min-h-0 min-w-0 max-w-full flex-[0_1_auto]"
          style={NO_DRAG_STYLE}
        >
          <div
            ref={tabStripRef}
            data-tab-strip="true"
            role="tablist"
            aria-orientation="horizontal"
            aria-label={translate('auto.components.tab.bar.TabStrip.openTabs', 'Open tabs')}
            onKeyDown={handleTabStripKeyDown}
            className={[
              'terminal-tab-strip flex h-full min-w-0 max-w-full flex-1 items-center gap-1 overflow-x-auto overflow-y-hidden pr-1 pl-1.5',
              // Why: the drag overlay lets the pointer through to the edge-scroll zones, so tabs must not hover or open tooltips under it.
              dragScroll.isTabDragActive ? '[&_[role=tab]]:pointer-events-none' : null,
              getTabStripScrollMaskClassName(tabStripOverflowState)
            ]
              .filter(Boolean)
              .join(' ')}
            onPointerEnter={closeFreeze.onPointerEnter}
            onPointerLeave={closeFreeze.onPointerLeave}
            onPointerDownCapture={closeFreeze.onPointerDownCapture}
          >
            {children}
            {/* Why: -ml-1 cancels the flex gap so an empty spacer adds no width. */}
            <div ref={spacerRef} aria-hidden className="-ml-1 h-full flex-none" />
          </div>
          <TabStripScrollIndicator metrics={tabStripOverflowState} />
          {dragScroll.isTabDragActive ? (
            <>
              {/* Why: drag-hover edges replace the old chevrons without taking layout width. */}
              <span
                aria-hidden
                className="absolute inset-y-0 left-0 z-20 w-6"
                onPointerEnter={dragScroll.onDragScrollStartEnter}
                onPointerLeave={dragScroll.onDragScrollLeave}
              />
              <span
                aria-hidden
                className="absolute inset-y-0 right-0 z-20 w-6"
                onPointerEnter={dragScroll.onDragScrollEndEnter}
                onPointerLeave={dragScroll.onDragScrollLeave}
              />
            </>
          ) : null}
        </div>
      </SortableContext>
      {trailingControls}
      <TabStripAllTabsMenu
        entries={menuEntries}
        hidden={!tabStripOverflowState.hasOverflow}
        onSelect={onSelectMenuEntry}
      />
    </>
  )
}
