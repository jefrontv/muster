import { readFile } from 'node:fs/promises'
import * as path from 'node:path'
import type { GitExec } from './git-handler-ops'
import { expandTilde } from './context'
import { resolveGitDir } from './git-handler-status-ops'
import {
  cleanPreparedMergeMessage,
  isGitSequencerAction,
  NON_INTERACTIVE_EDITOR_ENV,
  runGitSequencerActionWithGit,
  type GitSequencerActionResult
} from '../shared/git-sequencer-action'

export async function runSequencerActionOp(
  git: GitExec,
  params: Record<string, unknown>
): Promise<GitSequencerActionResult> {
  const worktreePath = params.worktreePath as string
  const action = params.action
  if (!isGitSequencerAction(action)) {
    throw new Error('Unsupported git operation.')
  }
  return runGitSequencerActionWithGit(
    (args) => git(args, worktreePath, { env: NON_INTERACTIVE_EDITOR_ENV }),
    action
  )
}

export async function readMergeMessageOp(params: Record<string, unknown>): Promise<string | null> {
  try {
    const gitDir = await resolveGitDir(expandTilde(params.worktreePath as string))
    return cleanPreparedMergeMessage(await readFile(path.join(gitDir, 'MERGE_MSG'), 'utf-8'))
  } catch {
    return null
  }
}
