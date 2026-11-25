import { createContext, useContext, useMemo, type RefObject } from 'react'

/** The tab being dragged, so its own strip can slide the other tabs aside. */
export type TabDragSource = { groupId: string; visibleTabId: string }

type TabDragContextValue = {
  isTabDragActive: boolean
  isTabDragActiveRef: RefObject<boolean>
  dragSource: TabDragSource | null
}

const defaultRef: RefObject<boolean> = { current: false }

const TabDragContext = createContext<TabDragContextValue>({
  isTabDragActive: false,
  isTabDragActiveRef: defaultRef,
  dragSource: null
})

export function TabDragProvider({
  isTabDragActive,
  isTabDragActiveRef,
  dragSource = null,
  children
}: {
  isTabDragActive: boolean
  isTabDragActiveRef: RefObject<boolean>
  dragSource?: TabDragSource | null
  children: React.ReactNode
}): React.JSX.Element {
  const value = useMemo(
    () => ({ isTabDragActive, isTabDragActiveRef, dragSource }),
    [isTabDragActive, isTabDragActiveRef, dragSource]
  )
  return <TabDragContext.Provider value={value}>{children}</TabDragContext.Provider>
}

export function useTabDragActive(): boolean {
  return useContext(TabDragContext).isTabDragActive
}

export function useTabDragSource(): TabDragSource | null {
  return useContext(TabDragContext).dragSource
}

export function useTabDragActiveRef(): RefObject<boolean> {
  return useContext(TabDragContext).isTabDragActiveRef
}
