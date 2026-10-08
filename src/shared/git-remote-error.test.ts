import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  formatSubmodulePushFailureDetail,
  isDivergentPullReconciliationError,
  isNoUpstreamError,
  MERGE_RECONCILIATION_PULL_ARGS,
  normalizeGitErrorMessage,
  pullArgsSpecifyReconciliation,
  runPullWithDivergenceFallback
} from './git-remote-error'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('normalizeGitErrorMessage', () => {
  it('keeps the submodule name when a recursive push is rejected', () => {
    const error = new Error(
      "Command failed: git push\nPushing submodule 'find-cmux-followers'\n" +
        'To https://github.com/stablyai/orca-internal\n' +
        ' ! [rejected]        master -> master (fetch first)\n' +
        "Unable to push submodule 'find-cmux-followers'\n" +
        'fatal: failed to push all needed submodules'
    )

    expect(normalizeGitErrorMessage(error, 'push')).toBe(
      "Submodule 'find-cmux-followers' has remote changes. Pull inside the submodule, then try again."
    )
  })

  it('preserves redacted pre-push hook output instead of the generic git tail line', () => {
    const error = new Error(
      [
        'Command failed: git push https://x-access-token:ghp_secret@github.com/acme/repo.git HEAD',
        'husky - pre-push hook failed',
        'eslint found 2 errors',
        "error: failed to push some refs to 'https://ghp_tailSecret@github.com/acme/repo.git'"
      ].join('\n')
    )

    const message = normalizeGitErrorMessage(error, 'push')

    expect(message).toContain('husky - pre-push hook failed')
    expect(message).toContain('eslint found 2 errors')
    expect(message).toContain(
      "error: failed to push some refs to 'https://github.com/acme/repo.git'"
    )
    expect(message).not.toContain('x-access-token')
    expect(message).not.toContain('ghp_secret')
    expect(message).not.toContain('ghp_tailSecret')
  })

  it('does not preserve remote pre-receive output as a push hook failure', () => {
    const error = new Error(
      [
        'Command failed: git push origin main',
        'remote: pre-receive hook declined',
        'remote: eslint failed in hosted checks',
        "error: failed to push some refs to 'origin'"
      ].join('\n')
    )

    expect(normalizeGitErrorMessage(error, 'push')).toBe('remote: eslint failed in hosted checks')
  })

  it('keeps the GitLab protected-branch reason instead of the generic push tail', () => {
    const error = new Error(
      [
        'Command failed: git push --set-upstream origin HEAD',
        'remote: GitLab: You are not allowed to push code to protected branches on this project.',
        'To gitlab.com:acme/site.git',
        ' ! [remote rejected] main -> main (pre-receive hook declined)',
        "error: failed to push some refs to 'gitlab.com:acme/site.git'"
      ].join('\n')
    )

    expect(normalizeGitErrorMessage(error, 'push')).toBe(
      'remote: GitLab: You are not allowed to push code to protected branches on this project.'
    )
  })

  it('skips GitHub progress and banner lines when picking the remote reason', () => {
    const error = new Error(
      [
        'Command failed: git push origin main',
        'remote: Resolving deltas: 100% (2/2), done.',
        'remote: error: GH006: Protected branch update failed for refs/heads/main.',
        'To github.com:acme/site.git',
        ' ! [remote rejected] main -> main (protected branch hook declined)',
        "error: failed to push some refs to 'github.com:acme/site.git'"
      ].join('\n')
    )

    expect(normalizeGitErrorMessage(error, 'push')).toBe(
      'remote: GH006: Protected branch update failed for refs/heads/main.'
    )
  })

  it('falls back to the bracketed rejection reason when the remote prints no detail', () => {
    const error = new Error(
      [
        'Command failed: git push origin main',
        ' ! [remote rejected] main -> main (pre-receive hook declined)',
        "error: failed to push some refs to 'bitbucket.org:acme/site.git'"
      ].join('\n')
    )

    expect(normalizeGitErrorMessage(error, 'push')).toBe(
      'The remote rejected the push (pre-receive hook declined).'
    )
  })

  it('reports merge conflicts that git prints on stdout instead of the fetch tail line', () => {
    const error = Object.assign(
      new Error(
        'Command failed: git pull\nFrom bitbucket.org:acme/site\n   300cde9..d0d667e  main       -> origin/main'
      ),
      {
        stdout:
          'Auto-merging style.css\nCONFLICT (content): Merge conflict in style.css\n' +
          'Automatic merge failed; fix conflicts and then commit the result.\n'
      }
    )

    expect(normalizeGitErrorMessage(error, 'pull')).toBe(
      'Automatic merge failed; fix conflicts and then commit the result.'
    )
  })

  it('reports rebase conflicts from pull --rebase', () => {
    const error = Object.assign(
      new Error(
        'Command failed: git pull --rebase origin main\n' +
          'error: could not apply 1a2b3c4... tweak header\n' +
          'hint: Resolve all conflicts manually, mark them as resolved with'
      ),
      { stdout: 'CONFLICT (content): Merge conflict in header.php\n' }
    )

    expect(normalizeGitErrorMessage(error, 'pull')).toBe(
      'Rebase stopped with conflicts; fix conflicts and then continue the rebase.'
    )
  })

  it('reports Git 2.25 am-backend rebase conflicts', () => {
    const error = new Error(
      'Command failed: git pull --rebase\nerror: Failed to merge in the changes.\n' +
        'Patch failed at 0001 tweak header\n' +
        'Resolve all conflicts manually, mark them as resolved with "git add/rm <conflicted_files>"'
    )

    expect(normalizeGitErrorMessage(error, 'pull')).toBe(
      'Rebase stopped with conflicts; fix conflicts and then continue the rebase.'
    )
  })

  it('explains an SSH key rejection instead of the "repository exists" tail', () => {
    const error = new Error(
      'Command failed: git push\ngit@bitbucket.org: Permission denied (publickey).\n' +
        'fatal: Could not read from remote repository.\n\n' +
        'Please make sure you have the correct access rights\nand the repository exists.'
    )

    expect(normalizeGitErrorMessage(error, 'push')).toBe(
      'SSH key rejected. Check that your SSH key is added to your Git host account and has access to this repository.'
    )
  })

  it('explains SSH host key verification failures', () => {
    const error = new Error(
      'Command failed: git fetch --prune\nHost key verification failed.\n' +
        'fatal: Could not read from remote repository.\n\nand the repository exists.'
    )

    expect(normalizeGitErrorMessage(error, 'fetch')).toMatch(/^SSH host key verification failed/)
  })

  it('treats an SSH connect failure as a network error, not an access error', () => {
    const error = new Error(
      'Command failed: git fetch\nssh: connect to host gitlab.com port 22: Operation timed out\n' +
        'fatal: Could not read from remote repository.\n\nand the repository exists.'
    )

    expect(normalizeGitErrorMessage(error, 'fetch')).toBe('Network error. Check your connection.')
  })

  it('explains a stale index.lock without leaking the local path', () => {
    const error = new Error(
      "Command failed: git pull\nfatal: Unable to create '/Users/me/site/.git/index.lock': File exists.\n\n" +
        'Another git process seems to be running in this repository.\n' +
        'remove the file manually to continue.'
    )

    const message = normalizeGitErrorMessage(error, 'pull')
    expect(message).toBe(
      'Another Git process is using this repository. Wait for it to finish, or delete the stale index.lock file if none is running.'
    )
    expect(message).not.toContain('/Users/me')
  })

  it('explains how to configure a pull policy for divergent branches', () => {
    const error = new Error(
      'Command failed: git pull\n' +
        'hint: You have divergent branches and need to specify how to reconcile them.\n' +
        'fatal: Need to specify how to reconcile divergent branches.'
    )

    expect(normalizeGitErrorMessage(error, 'pull')).toBe(
      'Pull needs a Git pull policy for divergent branches. Configure one for this repository ' +
        'or host, then try again: git config pull.rebase false (merge), ' +
        'git config pull.rebase true (rebase), or git config pull.ff only (fast-forward only).'
    )
  })

  it('uses the tail diagnostic from newline-heavy failures without line-array splitting', () => {
    const splitSpy = vi.spyOn(String.prototype, 'split')
    const error = new Error(
      `Command failed: git fetch\r\n${'remote: progress update\r\n'.repeat(10_000)}remote side closed connection\r\n`
    )

    expect(normalizeGitErrorMessage(error, 'fetch')).toBe('remote side closed connection')

    const usedLineSplit = splitSpy.mock.calls.some(
      ([separator]) =>
        (typeof separator === 'string' && separator === '\n') ||
        (separator instanceof RegExp && separator.source === '\\r?\\n')
    )
    expect(usedLineSplit).toBe(false)
  })
})

describe('formatSubmodulePushFailureDetail', () => {
  it('keeps normalized guidance when transport layers prefix the error', () => {
    expect(
      formatSubmodulePushFailureDetail(
        "Error invoking remote method 'git:push': Error: Submodule 'vendor/tools' has remote changes. Pull inside the submodule, then try again."
      )
    ).toBe(
      "Submodule 'vendor/tools' has remote changes. Pull inside the submodule, then try again."
    )
  })

  it('falls back to submodule-specific guidance when git omits the nested reason', () => {
    expect(
      formatSubmodulePushFailureDetail(
        "Unable to push submodule 'vendor/tools'\nfatal: failed to push all needed submodules"
      )
    ).toBe(
      "Submodule 'vendor/tools' could not be pushed. Resolve the submodule push error, then try again."
    )
  })

  it('checks newline-heavy output without full CRLF normalization', () => {
    const replaceSpy = vi.spyOn(String.prototype, 'replace')
    const message = `${'remote: progress\r\n'.repeat(10_000)}Unable to push submodule 'vendor/tools'\r\nfatal: failed to push all needed submodules\r\n`

    expect(formatSubmodulePushFailureDetail(message)).toBe(
      "Submodule 'vendor/tools' could not be pushed. Resolve the submodule push error, then try again."
    )

    const usedCrlfReplace = replaceSpy.mock.calls.some(
      ([pattern]) => pattern instanceof RegExp && pattern.source === '\\r\\n'
    )
    expect(usedCrlfReplace).toBe(false)
  })
})

describe('isNoUpstreamError', () => {
  it('treats a missing HEAD@{u} tracking ref as no upstream', () => {
    const error = new Error(
      "fatal: ambiguous argument 'HEAD@{u}': unknown revision or path not in the working tree.\n" +
        "Use '--' to separate paths from revisions, like this:\n" +
        "'git <command> [<revision>...] -- [<file>...]'"
    )

    expect(isNoUpstreamError(error)).toBe(true)
  })

  it('does not treat unrelated ambiguous refs as no upstream', () => {
    const error = new Error(
      "fatal: ambiguous argument 'feature': unknown revision or path not in the working tree."
    )

    expect(isNoUpstreamError(error)).toBe(false)
  })
})

describe('isDivergentPullReconciliationError', () => {
  it('detects git 2.27+ divergent-branch reconciliation failures', () => {
    const error = new Error(
      'Command failed: git pull\n' +
        'hint: You have divergent branches and need to specify how to reconcile them.\n' +
        'fatal: Need to specify how to reconcile divergent branches.'
    )

    expect(isDivergentPullReconciliationError(error)).toBe(true)
  })

  it('does not match a fast-forward-only abort on divergent branches', () => {
    const error = new Error(
      'Command failed: git pull\nfatal: Not possible to fast-forward, aborting.'
    )

    expect(isDivergentPullReconciliationError(error)).toBe(false)
  })

  it('returns false for non-Error values', () => {
    expect(isDivergentPullReconciliationError('divergent branches')).toBe(false)
  })
})

describe('pullArgsSpecifyReconciliation', () => {
  it('is false when no strategy flag is present', () => {
    expect(pullArgsSpecifyReconciliation([])).toBe(false)
    expect(pullArgsSpecifyReconciliation(['origin', 'main'])).toBe(false)
  })

  it('is true for any explicit reconciliation flag', () => {
    expect(pullArgsSpecifyReconciliation(['--ff-only'])).toBe(true)
    expect(pullArgsSpecifyReconciliation(['--rebase'])).toBe(true)
    expect(pullArgsSpecifyReconciliation(['--no-rebase'])).toBe(true)
    expect(pullArgsSpecifyReconciliation(['--rebase=interactive'])).toBe(true)
    expect(pullArgsSpecifyReconciliation(['-r'])).toBe(true)
  })
})

describe('runPullWithDivergenceFallback', () => {
  const divergentError = new Error(
    'Command failed: git pull\n' +
      'hint: You have divergent branches and need to specify how to reconcile them.\n' +
      'fatal: Need to specify how to reconcile divergent branches.'
  )

  it('retries with merge reconciliation args on a policy error', async () => {
    const calls: string[][] = []
    const runPull = vi.fn(async (effectiveArgs: string[]) => {
      calls.push(effectiveArgs)
      if (effectiveArgs.length === 0) {
        throw divergentError
      }
    })

    await runPullWithDivergenceFallback([], runPull)

    expect(calls).toEqual([[], [...MERGE_RECONCILIATION_PULL_ARGS]])
    expect(runPull).toHaveBeenCalledTimes(2)
  })

  it('does not retry when pull args already specify reconciliation', async () => {
    const runPull = vi.fn(async () => {
      throw divergentError
    })

    await expect(runPullWithDivergenceFallback(['--ff-only'], runPull)).rejects.toBe(divergentError)
    expect(runPull).toHaveBeenCalledTimes(1)
    expect(runPull).toHaveBeenCalledWith(['--ff-only'])
  })

  it('rethrows non-divergence errors without retrying', async () => {
    const otherError = new Error('fatal: Not possible to fast-forward, aborting.')
    const runPull = vi.fn(async () => {
      throw otherError
    })

    await expect(runPullWithDivergenceFallback([], runPull)).rejects.toBe(otherError)
    expect(runPull).toHaveBeenCalledTimes(1)
  })
})
