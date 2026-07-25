import { Check, FolderOpen, GitBranch, Loader2 } from 'lucide-react'
import type React from 'react'
import type { SiteBindCandidate } from '../../../../shared/site-bind-types'
import { Button } from '@/components/ui/button'
import { getSiteBindStrings } from './site-bind-strings'

type SiteBindTargetPickerProps = {
  candidates: SiteBindCandidate[]
  selectedPath: string
  onSelect: (path: string) => void
  onBrowse: () => void
  /** Empty when the link named no workspace-qualified repository, which makes cloning impossible. */
  cloneUrl: string
  cloning: boolean
  onClone: () => void
}

export function SiteBindTargetPicker({
  candidates,
  selectedPath,
  onSelect,
  onBrowse,
  cloneUrl,
  cloning,
  onClone
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
                onClick={() => onSelect(candidate.path)}
                className="flex w-full items-center gap-2 rounded-md border border-border px-2 py-1.5 text-left text-sm hover:bg-accent aria-pressed:border-primary aria-pressed:bg-accent"
              >
                <Check
                  className={
                    candidate.path === selectedPath
                      ? 'size-4 shrink-0 text-primary'
                      : 'size-4 shrink-0 opacity-0'
                  }
                />
                <span className="min-w-0 flex-1 truncate font-mono text-xs">{candidate.path}</span>
                {candidate.siteId ? (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {strings.updatesExisting}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}

      {selectedPath.length > 0 && !known ? (
        <p className="truncate font-mono text-xs text-muted-foreground">{selectedPath}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={onBrowse}>
          <FolderOpen className="size-3.5" />
          {strings.browse}
        </Button>
        {cloneUrl.length > 0 ? (
          <Button variant="outline" size="sm" disabled={cloning} onClick={onClone}>
            {cloning ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <GitBranch className="size-3.5" />
            )}
            {cloning ? strings.cloning : strings.clone}
          </Button>
        ) : null}
      </div>

      {candidates.length === 0 && cloneUrl.length > 0 ? (
        <p className="text-xs text-muted-foreground">{strings.cloneHint}</p>
      ) : null}
    </section>
  )
}
