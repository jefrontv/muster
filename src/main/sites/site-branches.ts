// Local branch names for the environment-name autocomplete. Read live like the branch in
// site-summary.ts, and forgiving for the same reason: a folder without git is a valid site
// state, so any failure means "no suggestions", never an error surfaced to the dialog.

import { commandExecFileAsync } from '../git/runner'

const BRANCH_LIST_TIMEOUT_MS = 5_000

export async function listCheckoutBranches(checkoutDir: string): Promise<string[]> {
  try {
    const { stdout } = await commandExecFileAsync(
      'git',
      ['for-each-ref', '--format=%(refname:short)', 'refs/heads'],
      { cwd: checkoutDir, timeout: BRANCH_LIST_TIMEOUT_MS }
    )
    return stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
  } catch {
    return []
  }
}
