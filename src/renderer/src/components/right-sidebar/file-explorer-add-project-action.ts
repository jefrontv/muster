import { isFolderRepo } from '../../../../shared/repo-kind'
import type { Repo } from '../../../../shared/types'
import type { AddProjectFromFolderModalPayload } from '@/store/slices/modal-payloads'
import type { TreeNode } from './file-explorer-types'

export function canShowAddAsProjectAction(node: TreeNode, activeRepo: Repo | null): boolean {
  return node.isDirectory && Boolean(activeRepo && isFolderRepo(activeRepo))
}

export function buildAddProjectFromFolderModalData(
  node: TreeNode,
  activeRepo: Repo
): AddProjectFromFolderModalPayload {
  return {
    folderPath: node.path,
    ...(activeRepo.connectionId ? { connectionId: activeRepo.connectionId } : {})
  }
}
