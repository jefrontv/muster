// Shared by local git (main) and the SSH relay so both run the same command sequence.

export const NO_COMMIT_TO_AMEND_MESSAGE = 'No commit to amend'

export type GitCommitOptions = {
  // Replace HEAD's commit with the staged tree and the given message.
  amend?: boolean
}

export type GitLastCommitMessageResult = {
  message: string
}

type RunGit = (args: string[]) => Promise<{ stdout: string }>

export function buildGitCommitArgs(message: string, options: GitCommitOptions = {}): string[] {
  return options.amend ? ['commit', '--amend', '-m', message] : ['commit', '-m', message]
}

export async function readLastCommitMessageWithGit(
  runGit: RunGit
): Promise<GitLastCommitMessageResult> {
  try {
    await runGit(['rev-parse', '--verify', '--quiet', 'HEAD'])
  } catch {
    throw new Error(NO_COMMIT_TO_AMEND_MESSAGE)
  }
  const { stdout } = await runGit(['log', '-1', '--format=%B', 'HEAD'])
  return { message: stdout.trimEnd() }
}
