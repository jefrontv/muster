import { readFile } from 'node:fs/promises'
import * as path from 'node:path'
import {
  cleanPreparedMergeMessage,
  NON_INTERACTIVE_EDITOR_ENV,
  runGitSequencerActionWithGit,
  type GitSequencerAction,
  type GitSequencerActionResult
} from '../../shared/git-sequencer-action'
import { addWslEnvKeys } from '../../shared/wsl-env'
import { gitExecFileAsync } from './runner'
import { resolveGitDir, runWithGitReadCacheInvalidation } from './status'
import { gitOptionsForWorktree, type GitRuntimeOptions } from './git-runtime-options'

function nonInteractiveEditorEnv(options: GitRuntimeOptions): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...NON_INTERACTIVE_EDITOR_ENV }
  if (options.wslDistro) {
    addWslEnvKeys(env, Object.keys(NON_INTERACTIVE_EDITOR_ENV))
  }
  return env
}

export async function runGitSequencerAction(
  worktreePath: string,
  action: GitSequencerAction,
  options: GitRuntimeOptions = {}
): Promise<GitSequencerActionResult> {
  const execOptions = {
    ...gitOptionsForWorktree(worktreePath, options),
    env: nonInteractiveEditorEnv(options)
  }
  return runWithGitReadCacheInvalidation(() =>
    runGitSequencerActionWithGit((args) => gitExecFileAsync(args, execOptions), action)
  )
}

export async function readPreparedMergeMessage(worktreePath: string): Promise<string | null> {
  try {
    const gitDir = await resolveGitDir(worktreePath)
    return cleanPreparedMergeMessage(await readFile(path.join(gitDir, 'MERGE_MSG'), 'utf-8'))
  } catch {
    return null
  }
}
