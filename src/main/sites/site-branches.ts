// Branch names for the environment-name autocomplete. Read live like the branch in
// site-summary.ts, and forgiving for the same reason: a folder without git is a valid site
// state, so any failure means "no suggestions", never an error surfaced to the dialog.
//
// Remote-tracking refs count: a fresh clone has one local head, so heads-only listing hid
// every branch the site actually deploys from.

import { commandExecFileAsync } from '../git/runner'

const BRANCH_LIST_TIMEOUT_MS = 5_000

const LOCAL_PREFIX = 'refs/heads/'
const REMOTE_PREFIX = 'refs/remotes/'

// Full refnames, not %(refname:short): "feature/x" and "origin/x" both hold a slash, so the
// short form gives no way to tell a remote apart from a nested local branch.
function branchNameFromRef(ref: string): string | null {
  if (ref.startsWith(LOCAL_PREFIX)) {
    return ref.slice(LOCAL_PREFIX.length) || null
  }
  if (!ref.startsWith(REMOTE_PREFIX)) {
    return null
  }
  const remoteRelative = ref.slice(REMOTE_PREFIX.length)
  const separator = remoteRelative.indexOf('/')
  if (separator < 0) {
    return null
  }
  const name = remoteRelative.slice(separator + 1)
  // refs/remotes/<remote>/HEAD is a symref onto another listed branch, not a branch of its own.
  return name && name !== 'HEAD' ? name : null
}

export async function listCheckoutBranches(checkoutDir: string): Promise<string[]> {
  try {
    const { stdout } = await commandExecFileAsync(
      'git',
      ['for-each-ref', '--format=%(refname)', 'refs/heads', 'refs/remotes'],
      { cwd: checkoutDir, timeout: BRANCH_LIST_TIMEOUT_MS }
    )
    const names = new Set<string>()
    for (const line of stdout.split('\n')) {
      const name = branchNameFromRef(line.trim())
      if (name) {
        names.add(name)
      }
    }
    return [...names]
  } catch {
    return []
  }
}
