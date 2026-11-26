// Environment row for a muster:// clone: which branch the clone starts on. Defaults to the link's
// branch; picking another only changes the clone, never where credentials or imports point.

import { ChevronDown, GitBranch, Info } from 'lucide-react'
import type React from 'react'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { PendingSiteBind } from '../../../../shared/site-bind-types'
import type { SiteSetupChoices } from './site-setup-choices'
import { getSiteSetupReviewStrings } from './site-setup-review-strings'
import { SiteSetupBranchPicker } from './SiteSetupBranchPicker'
import { SiteSetupRow } from './SiteSetupRow'
import { orderCloneBranches, useRemoteBranches } from './use-remote-branches'

export function SiteSetupCloneBranchRow({
  pending,
  targetKind,
  cloneUrl,
  choices,
  onChange,
  locked = false
}: {
  pending: PendingSiteBind
  /** Null until the user has picked a folder. */
  targetKind: 'clone' | 'existing' | null
  cloneUrl: string
  choices: SiteSetupChoices
  onChange: (next: SiteSetupChoices) => void
  locked?: boolean
}): React.JSX.Element {
  const strings = getSiteSetupReviewStrings()
  const [editing, setEditing] = useState(false)
  const cloning = targetKind === 'clone'
  const remote = useRemoteBranches(cloning ? cloneUrl : '')
  const environment = pending.fields.environment || choices.import.environment
  const linkBranch = pending.fields.checkoutBranch
  // An empty link branch means the remote lacks it; main then clones the default branch.
  const branch = choices.cloneBranch || linkBranch || remote.defaultBranch || ''
  const options = orderCloneBranches(remote.branches, linkBranch || branch, remote.defaultBranch)
  const mismatch = cloning && branch.length > 0 && branch !== (linkBranch || environment)

  const summary = remote.loading
    ? strings.cloneBranchLoading
    : [
        strings.cloneBranchSummary
          .replace('{{environment}}', environment)
          .replace('{{branch}}', branch || strings.cloneBranchDefault),
        cloning && !remote.ok ? strings.cloneBranchListFailed : ''
      ]
        .filter(Boolean)
        .join(' · ')

  const detail = strings.cloneBranchMismatchDetail
    .replace('{{branch}}', branch)
    .replace(/\{\{environment\}\}/g, environment)

  return (
    <SiteSetupRow
      icon={<GitBranch className="size-4" />}
      title={strings.cloneBranchTitle}
      summary={summary}
      state={targetKind === 'existing' ? 'unavailable' : locked ? 'locked' : 'available'}
      reason={strings.cloneBranchExisting}
      control={
        cloning ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={strings.cloneBranchEditLabel}
            aria-expanded={editing}
            aria-controls="site-setup-clone-branch-editor"
            data-state={editing ? 'open' : 'closed'}
            disabled={locked}
            onClick={() => setEditing((open) => !open)}
          >
            <ChevronDown className={cn('transition-transform', editing && 'rotate-180')} />
          </Button>
        ) : null
      }
    >
      {cloning && editing ? (
        <SiteSetupBranchPicker
          id="site-setup-clone-branch-editor"
          options={options}
          value={branch}
          linkBranch={linkBranch}
          defaultBranch={remote.defaultBranch}
          environment={environment}
          loading={remote.loading}
          disabled={locked}
          onSelect={(next) =>
            onChange({ ...choices, cloneBranch: next === linkBranch ? undefined : next })
          }
        />
      ) : null}
      {mismatch && editing ? (
        <p className="flex items-start gap-2 rounded-lg border border-status-attention-border bg-status-attention-background px-2.5 py-2 text-xs text-status-attention-ink">
          <Info className="mt-px size-3.5 shrink-0" aria-hidden />
          {detail}
        </p>
      ) : mismatch ? (
        <Badge variant="attention">
          {strings.cloneBranchMismatch.replace('{{environment}}', environment)}
        </Badge>
      ) : null}
    </SiteSetupRow>
  )
}
