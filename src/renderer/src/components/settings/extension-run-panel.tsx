// What an install, update or setup pass looks like while it happens, and what it leaves behind.
//
// The log opens by itself while the command runs and stays open when it fails, then collapses once
// it succeeds: watching it work is reassuring, reading the receipt afterwards is not. Nobody should
// have to read a package manager to install a tool, but they should be able to see it doing
// something, and they need the command to copy when a real shell is the only way out.

import { useEffect, useRef } from 'react'
import { Check, Copy, LoaderCircle, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import type { ExtensionRun } from '@/hooks/useExtensionRun'

function RunOutput({ output }: { output: string }): React.JSX.Element {
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [output])

  return (
    <div className="scrollbar-sleek max-h-56 overflow-y-auto rounded-md border border-border bg-muted/30 p-2.5">
      <pre className="whitespace-pre-wrap break-all font-mono text-[11px] leading-4 text-muted-foreground">
        {output || translate('auto.components.extensions.run_waiting', 'Starting…')}
      </pre>
      <div ref={endRef} />
    </div>
  )
}

function runningLabel(run: ExtensionRun, updating: boolean): string {
  if (run.mode === 'setup') {
    return translate('auto.components.extensions.run_setup', 'Setting up…')
  }
  return updating
    ? translate('auto.components.extensions.run_updating', 'Updating…')
    : translate('auto.components.extensions.run_installing', 'Installing…')
}

function doneLabel(run: ExtensionRun): string {
  if (run.registered.length === 0) {
    return translate('auto.components.extensions.run_done', 'Done.')
  }
  return translate(
    'auto.components.extensions.run_done_registered',
    'Done. Now available in {{agents}}.'
  ).replace('{{agents}}', run.registered.join(', '))
}

export function ExtensionRunPanel({
  run,
  updating,
  onCopyCommand
}: {
  run: ExtensionRun
  /** Whether the pending action is an update rather than a first install. */
  updating: boolean
  /** Absent when there is no command worth copying. */
  onCopyCommand: (() => void) | null
}): React.JSX.Element | null {
  if (run.phase === 'idle') {
    return null
  }
  const running = run.phase === 'running'

  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/20 p-2.5">
      <p className="flex items-center gap-1.5 text-xs">
        {running ? (
          <>
            <LoaderCircle className="size-3.5 animate-spin text-muted-foreground" />
            <span className="text-muted-foreground">{runningLabel(run, updating)}</span>
          </>
        ) : run.phase === 'succeeded' ? (
          <>
            <Check className="size-3.5 shrink-0 text-status-success" />
            <span className="text-status-success">{doneLabel(run)}</span>
          </>
        ) : (
          <>
            <TriangleAlert className="size-3.5 shrink-0 text-destructive" />
            <span className="break-words text-destructive">{run.error}</span>
          </>
        )}
      </p>

      {run.output || run.phase === 'failed' ? (
        <details open={running || run.phase === 'failed'}>
          <summary className="cursor-pointer list-none text-xs text-muted-foreground underline underline-offset-2 [details[open]>&]:hidden">
            {translate('auto.components.extensions.run_details', 'Show details')}
          </summary>
          <div className="mt-2 space-y-2">
            <RunOutput output={run.output} />
            {onCopyCommand ? (
              <Button variant="outline" size="xs" onClick={onCopyCommand}>
                <Copy className="size-3" />
                {translate('auto.components.extensions.copy_command', 'Copy the command')}
              </Button>
            ) : null}
          </div>
        </details>
      ) : null}
    </div>
  )
}
