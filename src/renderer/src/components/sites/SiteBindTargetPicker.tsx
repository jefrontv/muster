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

  return (
    <section className="space-y-2">
      <h3 className="text-xs font-medium text-muted-foreground">{strings.chooseFolder}</h3>

      {candidates.length === 0 ? (
        <p className="text-sm text-muted-foreground">{strings.noCandidates}</p>
      ) : (
        <ul className="space-y-1">
          {candidates.map((candidate) => (
            <li key={candidate.path}>
              <button
                type="button"
                aria-pressed={candidate.path === selectedPath}
                // Why disabled: confirm() rejects a path that is not on disk, so offering it as a
                // bind target would only produce an error. The clone/browse actions are the way out.
                disabled={!candidate.exists}
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
                  {!candidate.exists ? (
                    <span className="mt-0.5 block text-xs text-destructive">
                      {strings.missingFolder}
                    </span>
                  ) : candidate.siteId ? (
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
