import type { GitStatusEntry } from '../../../../shared/types'
import { getStageAllPaths } from './discard-all-sequence'

// Why: Commit All must stage exactly what the Stage All button stages, untracked files included.
export function resolveCommitAllPaths(
  unstaged: readonly GitStatusEntry[],
  untracked: readonly GitStatusEntry[]
): string[] {
  return [...getStageAllPaths(unstaged, 'unstaged'), ...getStageAllPaths(untracked, 'untracked')]
}
