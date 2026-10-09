// Shared by local git (main) and the SSH relay so continue/skip/abort run the same commands.
import {
  describeGitConflictFailure,
  describeGitLockFailure,
  gitErrorOutputText
} from './git-failure-detail'
import {
  appendGitFailureTail,
  normalizeGitAbortErrorMessage,
  stripCredentialsFromMessage
} from './git-remote-error'

export const GIT_SEQUENCER_ACTIONS = [
  'rebase-continue',
  'rebase-skip',
  'cherry-pick-continue',
  'cherry-pick-abort'
] as const

export type GitSequencerAction = (typeof GIT_SEQUENCER_ACTIONS)[number]

export type GitSequencerActionResult = {
  // True when git moved on but stopped again at the next conflicting commit.
  stoppedOnConflict: boolean
}

// Why: GIT_EDITOR outranks core.editor, so hosts also set this env; the -c flag covers WSL and wrappers that drop env.
export const NON_INTERACTIVE_EDITOR_ENV = { GIT_EDITOR: 'true' } as const

type RunGit = (args: string[]) => Promise<{ stdout: string }>

export function isGitSequencerAction(value: unknown): value is GitSequencerAction {
  return typeof value === 'string' && (GIT_SEQUENCER_ACTIONS as readonly string[]).includes(value)
}

export function gitSequencerActionArgs(action: GitSequencerAction): string[] {
  const editorArgs = ['-c', 'core.editor=true']
  switch (action) {
    case 'rebase-continue':
      return [...editorArgs, 'rebase', '--continue']
    case 'rebase-skip':
      return [...editorArgs, 'rebase', '--skip']
    case 'cherry-pick-continue':
      return [...editorArgs, 'cherry-pick', '--continue']
    case 'cherry-pick-abort':
      return ['cherry-pick', '--abort']
  }
}

const UNRESOLVED_CONFLICTS_PATTERN =
  /you need to resolve your current index first|Committing is not possible because you have unmerged files|needs merge|You must edit all merge conflicts/i
const EMPTY_STEP_PATTERN =
  /No changes - did you forget to use 'git add'|The previous cherry-pick is now empty|nothing to commit/i
const NOTHING_IN_PROGRESS_PATTERN = /No rebase in progress|no cherry-pick or revert in progress/i

const ACTION_FALLBACK: Record<GitSequencerAction, string> = {
  'rebase-continue': 'Could not continue the rebase.',
  'rebase-skip': 'Could not skip the commit.',
  'cherry-pick-continue': 'Could not continue the cherry-pick.',
  'cherry-pick-abort': 'Could not abort the cherry-pick.'
}

export function normalizeGitSequencerErrorMessage(
  error: unknown,
  action: GitSequencerAction
): string {
  if (action === 'cherry-pick-abort') {
    return normalizeGitAbortErrorMessage(error, 'cherry-pick')
  }
  const fallback = ACTION_FALLBACK[action]
  if (!(error instanceof Error)) {
    return fallback
  }
  const output = stripCredentialsFromMessage(gitErrorOutputText(error))
  const lockFailure = describeGitLockFailure(output)
  if (lockFailure) {
    return lockFailure
  }
  if (UNRESOLVED_CONFLICTS_PATTERN.test(output)) {
    return 'Resolve and stage every conflicted file, then continue.'
  }
  if (EMPTY_STEP_PATTERN.test(output)) {
    return action === 'cherry-pick-continue'
      ? 'Nothing is left to commit for this cherry-pick. Abort it, or stage changes and continue.'
      : 'Nothing is left to commit for this step. Skip the commit, or stage changes and continue.'
  }
  if (NOTHING_IN_PROGRESS_PATTERN.test(output)) {
    const operation = action === 'cherry-pick-continue' ? 'cherry-pick' : 'rebase'
    return `No ${operation} is in progress. Refresh Source Control and try again.`
  }
  return appendGitFailureTail(error, fallback)
}

export async function runGitSequencerActionWithGit(
  runGit: RunGit,
  action: GitSequencerAction
): Promise<GitSequencerActionResult> {
  try {
    await runGit(gitSequencerActionArgs(action))
    return { stoppedOnConflict: false }
  } catch (error) {
    // Why: continuing a multi-commit rebase/cherry-pick exits non-zero when the next commit conflicts; that is progress, not failure.
    if (
      action !== 'cherry-pick-abort' &&
      error instanceof Error &&
      describeGitConflictFailure(gitErrorOutputText(error)) &&
      !UNRESOLVED_CONFLICTS_PATTERN.test(gitErrorOutputText(error))
    ) {
      return { stoppedOnConflict: true }
    }
    throw new Error(normalizeGitSequencerErrorMessage(error, action))
  }
}

// Why: git's prepared MERGE_MSG lists conflicted paths as `#` comment lines that `commit -m` would keep verbatim.
export function cleanPreparedMergeMessage(raw: string): string | null {
  const message = raw
    .split(/\r?\n/)
    .filter((line) => !line.startsWith('#'))
    .join('\n')
    .trim()
  return message || null
}
