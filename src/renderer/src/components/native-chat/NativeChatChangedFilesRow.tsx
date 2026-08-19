import { ChevronDown, ChevronRight, FileDiff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import {
  selectChangedFilePreview,
  type NativeChatChangedFile,
  type NativeChatTurnChangedFiles
} from './native-chat-turn-changed-files'
import { useNativeChatToggleScrollCompensation } from './use-native-chat-toggle-scroll-compensation'

/** Path as `dir/…/name`, keeping the filename whole — the end matters most. */
function shortPath(path: string): string {
  const parts = path.replace(/^\.?\//, '').split('/')
  if (parts.length <= 2) {
    return parts.join('/')
  }
  return `${parts[0]}/…/${parts.at(-1)}`
}

function LineCounts({ file }: { file: NativeChatChangedFile }): React.JSX.Element {
  return (
    <span className="shrink-0 tabular-nums">
      {file.additions > 0 ? (
        <span className="text-emerald-600 dark:text-emerald-400">+{file.additions}</span>
      ) : null}
      {file.additions > 0 && file.deletions > 0 ? ' ' : null}
      {file.deletions > 0 ? (
        <span className="text-rose-600 dark:text-rose-400">−{file.deletions}</span>
      ) : null}
    </span>
  )
}

/**
 * What a turn changed on disk, summarised once the turn is done.
 *
 * The turn fold hides every intermediate message, inline diffs included, so
 * without this a settled turn leaves no trace of which files it touched.
 */
export function NativeChatChangedFilesRow({
  changed,
  expanded,
  onToggle
}: {
  changed: NativeChatTurnChangedFiles
  expanded: boolean
  onToggle: () => void
}): React.JSX.Element {
  const { elementRef, captureBeforeToggle } = useNativeChatToggleScrollCompensation(expanded)
  const Chevron = expanded ? ChevronDown : ChevronRight
  const count = changed.files.length
  const preview = selectChangedFilePreview(changed.files)

  return (
    <div ref={elementRef} className="my-1">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => {
          captureBeforeToggle()
          onToggle()
        }}
        className="flex w-full items-center gap-1.5 rounded-md border border-border/60 bg-muted/20 px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Chevron className="size-3.5 shrink-0" />
        <FileDiff className="size-3.5 shrink-0" />
        <span className="shrink-0 font-medium text-foreground">
          {count === 1
            ? translate('components.native-chat.changedFiles.one', '1 file changed')
            : translate('components.native-chat.changedFiles.many', `${count} files changed`, {
                count
              })}
        </span>
        {!expanded ? (
          <span className="min-w-0 flex-1 truncate text-muted-foreground/80">
            {preview.map((file) => shortPath(file.path)).join(', ')}
            {count > preview.length ? ` +${count - preview.length}` : ''}
          </span>
        ) : (
          <span className="flex-1" />
        )}
        <LineCounts
          file={{
            path: '',
            additions: changed.totalAdditions,
            deletions: changed.totalDeletions
          }}
        />
      </button>
      {expanded ? (
        <ul className="mt-1 space-y-0.5 border-l border-border/40 pl-3">
          {changed.files.map((file) => (
            <li key={file.path} className="flex items-center gap-2 text-xs">
              <span
                className={cn('min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground')}
                title={file.path}
              >
                {file.path}
              </span>
              <LineCounts file={file} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
