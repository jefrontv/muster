// What a settled turn changed on disk. Code mode: a card of relative paths with
// real line counts, each opening the file. Chat mode: one plain line with file
// names only ("Changed header.php and style.css").

import { ChevronRight, FileDiff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { relativeToolPath } from '../../../../shared/native-chat-tool-input-fields'
import { describeChangedFilesLine } from '../../../../shared/native-chat-work-summary'
import {
  selectChangedFilePreview,
  type NativeChatTurnChangedFiles
} from './native-chat-turn-changed-files'
import { useNativeChatSurface } from './native-chat-surface-context'
import { useNativeChatToggleScrollCompensation } from './use-native-chat-toggle-scroll-compensation'
import { NativeChatLineCounts } from './NativeChatWorkRow'

function ChatChangesLine({ changed }: { changed: NativeChatTurnChangedFiles }): React.JSX.Element {
  const line = describeChangedFilesLine(
    changed.files.map((file) => file.path),
    translate
  )
  return (
    <p
      className="flex items-center gap-1.5 text-xs text-muted-foreground"
      title={line.names.length > 3 ? line.names.join(', ') : undefined}
    >
      <FileDiff className="size-3.5 shrink-0" />
      <span className="min-w-0 truncate">{line.text}</span>
    </p>
  )
}

export function NativeChatChangedFilesRow({
  changed,
  expanded,
  onToggle
}: {
  changed: NativeChatTurnChangedFiles
  expanded: boolean
  onToggle: () => void
}): React.JSX.Element {
  const { surface, cwd, openFile } = useNativeChatSurface()
  const { elementRef, captureBeforeToggle } = useNativeChatToggleScrollCompensation(expanded)
  if (surface === 'chat') {
    return <ChatChangesLine changed={changed} />
  }
  const count = changed.files.length
  const preview = selectChangedFilePreview(changed.files)
  return (
    <div ref={elementRef} className="rounded-md border border-border/60">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => {
          captureBeforeToggle()
          onToggle()
        }}
        className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronRight
          className={cn('size-3.5 shrink-0 transition-transform', expanded && 'rotate-90')}
        />
        <FileDiff className="size-3.5 shrink-0" />
        <span className="shrink-0 font-medium text-foreground">
          {count === 1
            ? translate('components.native-chat.changedFiles.one', '1 file changed')
            : translate('components.native-chat.changedFiles.many', '{{count}} files changed', {
                count
              })}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground/80">
          {expanded
            ? ''
            : `${preview.map((file) => relativeToolPath(file.path, cwd)).join(', ')}${count > preview.length ? ` +${count - preview.length}` : ''}`}
        </span>
        <NativeChatLineCounts
          additions={changed.totalAdditions}
          deletions={changed.totalDeletions}
        />
      </button>
      {expanded ? (
        <ul className="border-t border-border/60 px-2 py-1">
          {changed.files.map((file) => (
            <li key={file.path} className="flex items-center gap-2 text-xs">
              <button
                type="button"
                disabled={!openFile}
                onClick={() => openFile?.(file.path)}
                className="min-w-0 flex-1 truncate rounded-sm text-left font-mono text-[11px] text-muted-foreground transition-colors enabled:hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                title={file.path}
              >
                {relativeToolPath(file.path, cwd)}
              </button>
              <NativeChatLineCounts additions={file.additions} deletions={file.deletions} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
