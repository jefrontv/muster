import type { GitUpstreamStatus } from '../../../../shared/git-status-types'
import { shouldForcePushWithLeaseForUpstream } from '../../../../shared/git-upstream-status'
import { translate } from '@/i18n/i18n'

export type ForcePushConfirmation = {
  title: string
  description: string
  confirmLabel: string
  confirmVariant: 'destructive'
}

// Why: force-with-lease still overwrites remote-only commits; skip the prompt only when they are older copies of local commits (routine post-rebase push).
export function resolveForcePushConfirmation(
  status: GitUpstreamStatus | undefined
): ForcePushConfirmation | null {
  if (!status?.hasUpstream || status.behind <= 0 || shouldForcePushWithLeaseForUpstream(status)) {
    return null
  }
  const upstream =
    status.upstreamName ??
    translate(
      'auto.components.right.sidebar.SourceControl.forcePushConfirm.remoteBranch',
      'The remote branch'
    )
  const description =
    status.behind === 1
      ? translate(
          'auto.components.right.sidebar.SourceControl.forcePushConfirm.description_one',
          "{{value0}} has 1 commit that isn't on your branch. Force pushing deletes it from the remote.",
          { value0: upstream }
        )
      : translate(
          'auto.components.right.sidebar.SourceControl.forcePushConfirm.description_other',
          "{{value0}} has {{value1}} commits that aren't on your branch. Force pushing deletes them from the remote.",
          { value0: upstream, value1: status.behind }
        )
  return {
    title: translate(
      'auto.components.right.sidebar.SourceControl.forcePushConfirm.title',
      'Force push and replace remote commits?'
    ),
    description,
    confirmLabel: translate(
      'auto.components.right.sidebar.SourceControl.forcePushConfirm.confirm',
      'Force Push'
    ),
    confirmVariant: 'destructive'
  }
}
