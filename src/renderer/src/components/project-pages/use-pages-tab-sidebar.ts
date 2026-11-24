import { useEffect } from 'react'
import { useAppStore } from '@/store'
import type { OpenFile } from '@/store/slices/editor'

/** Shows the Pages panel in the right sidebar while this Pages tab is in front, then puts back what was there. */
export function usePagesTabSidebar(file: OpenFile): void {
  const inFront = useAppStore(
    (s) =>
      s.activeWorktreeId === file.worktreeId &&
      s.activeTabType === 'editor' &&
      s.activeFileId === file.id
  )
  useEffect(() => {
    if (!inFront) {
      return undefined
    }
    const { rightSidebarTab: previous, setRightSidebarTab } = useAppStore.getState()
    if (previous !== 'pages') {
      setRightSidebarTab('pages')
    }
    return () => {
      // Leave it if the user picked another panel themselves meanwhile.
      if (previous !== 'pages' && useAppStore.getState().rightSidebarTab === 'pages') {
        useAppStore.getState().setRightSidebarTab(previous)
      }
    }
  }, [inFront])
}
