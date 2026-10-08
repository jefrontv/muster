// Plain-language mappings for git failures whose last stderr line is not the useful one.

// Why: git ≥2.26 prints "could not apply"; the 2.25 am backend prints "Patch failed at" + "Resolve all conflicts manually".
const REBASE_CONFLICT_PATTERN =
  /could not apply [0-9a-f]{4,}|Patch failed at \d+|Resolve all conflicts manually/i
const MERGE_CONFLICT_PATTERN = /(?:^|\n)CONFLICT \(|Automatic merge failed/
const SSH_PUBLICKEY_DENIED_PATTERN = /Permission denied \([^)]*publickey/i
const HOST_KEY_VERIFICATION_PATTERN = /Host key verification failed/i
const HTTP_ACCESS_DENIED_PATTERN =
  /The requested URL returned error: 403|Permission to \S+ denied to/i
const REPOSITORY_NOT_FOUND_PATTERN =
  /Repository not found|does not appear to be a git repository|repository '[^']*' not found/i
const COULD_NOT_READ_REMOTE_PATTERN = /Could not read from remote repository/i
const LOCK_FILE_EXISTS_PATTERN = /Unable to create '([^']*\.lock)': File exists/i
const REMOTE_REJECTED_PATTERN =
  /\[remote rejected\]|hook declined|protected branch|failed to push some refs/i
const REMOTE_REJECTED_REASON_PATTERN = /\[remote rejected\][^(\n]*\(([^)\n]+)\)/i
// Why: progress, banner and PR-link lines from GitHub/GitLab/Bitbucket say nothing about why a push was refused.
const REMOTE_NOISE_LINE_PATTERN =
  /^(?:[-=*_~#\s]*|(?:Counting|Compressing|Enumerating|Resolving|Processing|Writing) \S+.*|Total \d.*|To create a merge request.*|Create (?:a )?(?:new )?pull request.*|View (?:merge|pull) request.*|https?:\/\/\S+|\S+ hook declined)$/i

// Why: lets the renderer show these sentences verbatim without also echoing arbitrary git tail lines.
const PLAIN_GIT_FAILURE_PATTERN =
  /^(?:SSH host key verification failed\.|SSH key rejected\.|Remote repository not found\.|Access denied\.|Could not read from the remote repository\.|Another Git process is using this repository\.|The remote rejected the push \(|Authentication failed\.|Network error\.)/

export function isPlainGitFailureMessage(line: string): boolean {
  return PLAIN_GIT_FAILURE_PATTERN.test(line)
}

export const MERGE_CONFLICT_MESSAGE =
  'Automatic merge failed; fix conflicts and then commit the result.'
export const REBASE_CONFLICT_MESSAGE =
  'Rebase stopped with conflicts; fix conflicts and then continue the rebase.'

function outputText(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }
  return value instanceof Uint8Array ? new TextDecoder().decode(value) : ''
}

// Why: CONFLICT/"Automatic merge failed" go to stdout, which Node leaves out of error.message.
export function gitErrorOutputText(error: Error): string {
  const { stdout, stderr } = error as Error & { stdout?: unknown; stderr?: unknown }
  return [error.message, outputText(stdout), outputText(stderr)].join('\n')
}

export function describeGitConflictFailure(output: string): string | null {
  if (REBASE_CONFLICT_PATTERN.test(output)) {
    return REBASE_CONFLICT_MESSAGE
  }
  return MERGE_CONFLICT_PATTERN.test(output) ? MERGE_CONFLICT_MESSAGE : null
}

export function describeGitLockFailure(output: string): string | null {
  const lockPath = output.match(LOCK_FILE_EXISTS_PATTERN)?.[1]
  if (!lockPath) {
    return null
  }
  const lockName = lockPath.split(/[\\/]/).at(-1) ?? 'index.lock'
  return `Another Git process is using this repository. Wait for it to finish, or delete the stale ${lockName} file if none is running.`
}

export function describeGitAccessFailure(output: string): string | null {
  if (HOST_KEY_VERIFICATION_PATTERN.test(output)) {
    return 'SSH host key verification failed. Connect to the host once with ssh in a terminal to trust it, then try again.'
  }
  if (SSH_PUBLICKEY_DENIED_PATTERN.test(output)) {
    return 'SSH key rejected. Check that your SSH key is added to your Git host account and has access to this repository.'
  }
  if (REPOSITORY_NOT_FOUND_PATTERN.test(output)) {
    return 'Remote repository not found. Check the remote URL and that your account has access.'
  }
  if (HTTP_ACCESS_DENIED_PATTERN.test(output)) {
    return 'Access denied. Check that your account has permission for this repository.'
  }
  if (COULD_NOT_READ_REMOTE_PATTERN.test(output)) {
    return 'Could not read from the remote repository. Check your SSH key and access rights.'
  }
  return null
}

function firstMeaningfulRemoteLine(output: string): string | null {
  for (const match of output.matchAll(/(?:^|[\r\n])[ \t]*remote:([^\r\n]*)/g)) {
    const detail = match[1].replace(/^\s*error:\s*/i, '').trim()
    if (!REMOTE_NOISE_LINE_PATTERN.test(detail)) {
      return detail
    }
  }
  return null
}

// Why: hosts explain protected-branch and permission rejections on `remote:` lines; git's tail is just "failed to push some refs".
export function describeRemotePushRejection(output: string): string | null {
  if (!REMOTE_REJECTED_PATTERN.test(output)) {
    return null
  }
  const remoteLine = firstMeaningfulRemoteLine(output)
  if (remoteLine) {
    return `remote: ${remoteLine}`
  }
  const reason = output.match(REMOTE_REJECTED_REASON_PATTERN)?.[1]?.trim()
  return reason ? `The remote rejected the push (${reason}).` : null
}
