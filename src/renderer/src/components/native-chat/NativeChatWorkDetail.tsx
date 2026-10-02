// What a Code mode work row expands to, by the activity's detail kind: a diff,
// a terminal block, a file list, sources, or a key/value input. Never raw JSON
// for the input; tool results that are JSON fold past a few lines.

import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import {
  inputScalarFields,
  relativeToolPath,
  urlDomain
} from '../../../../shared/native-chat-tool-input-fields'
import type { NativeChatWorkToolEntry } from './native-chat-turn-work'
import { editHunks } from './native-chat-edit-hunks'
import { NativeChatDiffView } from './NativeChatDiffView'
import { useNativeChatSurface } from './native-chat-surface-context'

const BLOCK_CLASS =
  'max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border/60 bg-muted/30 px-2.5 py-2 font-mono text-[11px] leading-relaxed scrollbar-sleek'
const FOLD_LINES = 20

function TerminalBlock({ entry }: { entry: NativeChatWorkToolEntry }): React.JSX.Element {
  const detail = entry.result?.detail
  const stdout = detail?.stdout ?? (detail?.stderr ? '' : (entry.result?.output ?? ''))
  const stderr = detail?.stderr ?? ''
  return (
    <div className={BLOCK_CLASS}>
      {stdout ? <span className="text-foreground/80">{stdout}</span> : null}
      {stdout && stderr ? '\n' : null}
      {stderr ? <span className="text-destructive">{stderr}</span> : null}
      {!stdout && !stderr ? (
        <span className="text-muted-foreground">
          {translate('components.native-chat.detail.noOutput', 'No output')}
        </span>
      ) : null}
      {detail?.truncated ? (
        <span className="block pt-1 font-sans text-muted-foreground">
          {translate('components.native-chat.detail.outputShortened', 'Output shortened')}
        </span>
      ) : null}
    </div>
  )
}

/** Paths a read or search touched; each opens in the editor when there is one. */
function FileList({ paths }: { paths: string[] }): React.JSX.Element {
  const { cwd, openFile } = useNativeChatSurface()
  return (
    <ul className="space-y-0.5">
      {paths.map((path) => (
        <li key={path}>
          <button
            type="button"
            disabled={!openFile}
            onClick={() => openFile?.(path)}
            className="max-w-full truncate rounded-sm font-mono text-[11px] text-muted-foreground transition-colors enabled:hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title={path}
          >
            {relativeToolPath(path, cwd)}
          </button>
        </li>
      ))}
    </ul>
  )
}

function filesFor(entry: NativeChatWorkToolEntry): string[] {
  if (entry.activity.path) {
    return [entry.activity.path]
  }
  // Grep and Glob list one path per line after their "Found N files" header.
  return (entry.result?.output ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^([A-Za-z]:)?[\\/]/.test(line))
    .slice(0, 50)
}

export function NativeChatSourceList({
  sources
}: {
  sources: readonly { url: string; title: string | null }[]
}): React.JSX.Element {
  return (
    <ul className="space-y-0.5">
      {sources.map((source) => (
        <li key={source.url}>
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer"
            className="group/source flex max-w-full items-center gap-1.5 rounded-sm text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="min-w-0 truncate">{source.title ?? urlDomain(source.url)}</span>
            {source.title ? (
              <span className="shrink-0 text-muted-foreground/70">{urlDomain(source.url)}</span>
            ) : null}
            <ExternalLink className="size-3 shrink-0 opacity-0 group-hover/source:opacity-100" />
          </a>
        </li>
      ))}
    </ul>
  )
}

function prettyResult(output: string): string {
  try {
    return JSON.stringify(JSON.parse(output), null, 2)
  } catch {
    return output
  }
}

function FoldedText({ text, error }: { text: string; error: boolean }): React.JSX.Element {
  const [all, setAll] = useState(false)
  const lines = text.split('\n')
  const folded = !all && lines.length > FOLD_LINES
  return (
    <div className={cn(BLOCK_CLASS, error ? 'text-destructive' : 'text-foreground/80')}>
      {folded ? lines.slice(0, FOLD_LINES).join('\n') : text}
      {folded ? (
        <button
          type="button"
          onClick={() => setAll(true)}
          className="block pt-1 font-sans text-muted-foreground hover:text-foreground"
        >
          {translate('components.native-chat.detail.showAll', 'Show all {{count}} lines', {
            count: lines.length
          })}
        </button>
      ) : null}
    </div>
  )
}

function Fields({ entry }: { entry: NativeChatWorkToolEntry }): React.JSX.Element {
  const fields = inputScalarFields(entry.call?.input)
  return (
    <div className="space-y-1.5">
      {fields.length > 0 ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px]">
          {fields.map((field) => (
            <div key={field.key} className="contents">
              <dt className="text-muted-foreground">{field.key}</dt>
              <dd className="min-w-0 break-words font-mono text-foreground/80">{field.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {entry.result?.output ? (
        <FoldedText text={prettyResult(entry.result.output)} error={entry.activity.failed} />
      ) : null}
    </div>
  )
}

export function NativeChatWorkDetail({
  entry
}: {
  entry: NativeChatWorkToolEntry
}): React.JSX.Element | null {
  switch (entry.activity.detail) {
    case 'diff': {
      const edit = editHunks(entry.call, entry.result)
      if (!edit) {
        return null
      }
      return (
        <NativeChatDiffView
          hunks={edit.hunks}
          numbered={edit.numbered}
          path={entry.activity.path}
          truncated={edit.truncated}
        />
      )
    }
    case 'terminal':
      return <TerminalBlock entry={entry} />
    case 'files':
      return <FileList paths={filesFor(entry)} />
    case 'sources':
      return entry.activity.sources ? (
        <NativeChatSourceList sources={entry.activity.sources} />
      ) : null
    case 'fields':
      return <Fields entry={entry} />
    case 'text':
      return entry.result?.output ? (
        <FoldedText text={entry.result.output} error={entry.activity.failed} />
      ) : null
    case 'none':
      return null
  }
}
