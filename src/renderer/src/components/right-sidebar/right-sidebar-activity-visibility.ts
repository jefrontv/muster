import type { ActivityBarItem } from './activity-bar-buttons'

type RightSidebarActivityVisibilityState = {
  isFolder: boolean
  isFolderWorkspace: boolean
  isSshRepo: boolean
  hasSite: boolean
  /** Drafts are waiting, or the drafts tab is open (so posting the last one keeps it in place). */
  hasDrafts?: boolean
}

export function getVisibleRightSidebarActivityItems(
  items: ActivityBarItem[],
  {
    isFolder,
    isFolderWorkspace,
    isSshRepo,
    hasSite,
    hasDrafts = false
  }: RightSidebarActivityVisibilityState
): ActivityBarItem[] {
  return items.filter((item) => {
    if (item.gitOnly && isFolder) {
      return false
    }
    if (item.folderOnly && !isFolderWorkspace) {
      return false
    }
    if (item.sshOnly && !isSshRepo) {
      return false
    }
    if (item.siteOnly && !hasSite) {
      return false
    }
    if (item.draftsOnly && !hasDrafts) {
      return false
    }
    return true
  })
}
