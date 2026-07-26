import { existsSync } from 'node:fs'
import { join } from 'node:path'

// This fork parks upstream's CI: every workflow except `pr.yml` lives in
// `.github/workflows-upstream-disabled/` (see the README there for why). Tests that assert on a
// parked workflow's YAML would fail permanently, which trains people to ignore a red suite. Gating
// them on this check keeps the assertions in the tree and re-arms them automatically the moment
// someone `git mv`s a workflow back into `.github/workflows/`.

/** True when the named workflow is active (present in .github/workflows). */
export function workflowIsActive(projectDir, workflowFileName) {
  return existsSync(join(projectDir, '.github/workflows', workflowFileName))
}
