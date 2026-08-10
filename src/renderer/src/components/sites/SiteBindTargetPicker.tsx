import { Check, GitBranch, Loader2 } from 'lucide-react'
import type React from 'react'
import type { SiteBindCandidate } from '../../../../shared/site-bind-types'
import { Button } from '@/components/ui/button'
import { getSiteBindStrings } from './site-bind-strings'

type SiteBindTargetPickerProps = {
  candidates: SiteBindCandidate[]
  selectedPath: string
  onSelect: (path: string) => void
  /** Empty when the link named no workspace-qualified repository, which makes cloning impossible. */
  cloneUrl: string
  cloning: boolean
  onClone: () => void
  /** Where a brand-new checkout would land: `<primary configured root>/<repo folder>`. */
  proposedPath: string
  /** True when the footer owns the one-click setup, so this section only explains where it lands. */
  canSetUpInRoot: boolean
  /** True when no candidate is reachable, so setting up fresh is the expected path. */
  needsFreshSetup: boolean
}

export function SiteBindTargetPicker({
  candidates,
  selectedPath,
  onSelect,
  cloneUrl,
  cloning,
  onClone,
  proposedPath,
  canSetUpInRoot,
  needsFreshSetup
}: SiteBindTargetPickerProps): React.JSX.Element {
  const strings = getSiteBindStrings()
  const known = candidates.some((entry) => entry.path === selectedPath)
  // Only folders that are actually there can be bound — confirm() rejects the rest — so the ones
  // that are gone are listed as a count below rather than as cards nobody can pick.
  const bindable = candidates.filter((candidate) => candidate.exists)
  const staleCount = candidates.length - bindable.length

  return (
    <section className="space-y-2">
      {/* No heading when there is nothing to choose between: "Which local folder should this bind
          to?" over zero options is a question the user cannot answer. */}
      {bindable.length > 0 ? (
        <h3 className="text-xs font-medium text-muted-foreground">{strings.chooseFolder}</h3>
      ) : null}

      {candidates.length === 0 ? (
        <p className="text-sm text-muted-foreground">{strings.noCandidates}</p>
      ) : bindable.length === 0 ? null : (
        <ul className="space-y-1">
          {bindable.map((candidate) => (
            <li key={candidate.path}>
              <button
                type="button"
                aria-pressed={candidate.path === selectedPath}
                onClick={() => onSelect(candidate.path)}
                className="flex w-full items-start gap-2 rounded-md border border-border px-2 py-2 text-left text-sm hover:bg-accent aria-pressed:border-primary aria-pressed:bg-accent disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
              >
                <Check
                  className={
                    candidate.path === selectedPath
                      ? 'mt-0.5 size-4 shrink-0 text-primary'
                      : 'mt-0.5 size-4 shrink-0 opacity-0'
                  }
                />
                {/* Why stacked: the folder name is what identifies the target, but it lives at the
                    end of a long path. On one line the path truncated to "/Users/ja…" and the
                    existing-record note ate the remaining width.

                    The path stays left-to-right and truncates from the right: `dir="rtl"` would
                    keep the tail but relocates the leading slash to the end ("Users/…/x/"). The
                    name above already answers "which folder", so the path only has to answer
                    "where". */}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{candidate.displayName}</span>
                  <span className="block truncate font-mono text-[11px] text-muted-foreground">
                    {candidate.path}
                  </span>
                  {candidate.siteId ? (
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {strings.updatesExisting}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selectedPath.length > 0 && !known ? (
        <p className="truncate font-mono text-xs text-muted-foreground">{selectedPath}</p>
      ) : null}
      {staleCount > 0 ? (
        <p className="text-xs text-muted-foreground">
          {(staleCount === 1 ? strings.staleRecords : strings.staleRecordsPlural).replace(
            '{{count}}',
            String(staleCount)
          )}
        </p>
      ) : null}
      {needsFreshSetup ? (
        <p className="text-xs text-muted-foreground">
          {canSetUpInRoot
            ? strings.willCreateAt.replace('{{path}}', proposedPath)
            : strings.noRootConfigured}
        </p>
      ) : null}
      {/* The footer owns setup when a root is configured; this pick-a-destination clone is the only
          way forward when there is no root to clone into. */}
      {!canSetUpInRoot && needsFreshSetup && cloneUrl.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" disabled={cloning} onClick={onClone}>
            {cloning ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <GitBranch className="size-3.5" />
            )}
            {cloning ? strings.cloning : strings.clone}
          </Button>
        </div>
      ) : null}
    </section>
  )
}
