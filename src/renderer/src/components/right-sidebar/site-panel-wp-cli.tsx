// WP-CLI quick actions for the Site panel: the whitelisted read/flush commands, run inline over
// SSH against the branch-resolved environment. Output lands in a small tail box under the buttons.

import { Loader2, TerminalSquare } from 'lucide-react'
import type React from 'react'
import { useState } from 'react'
import { SITE_WP_CLI_ACTIONS, type SiteWpCliResult } from '../../../../shared/site-wp-cli-actions'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import { useConfirmationDialog } from '@/components/confirmation-dialog'
import { cn } from '@/lib/utils'
import { SectionHeading } from './site-panel-controls'

export function SitePanelWpCliSection({
  siteId,
  targetName,
  disabledReason
}: {
  siteId: string
  targetName: string | null
  /** Non-null hides the whole section: no environment means nothing to run against. */
  disabledReason: string | null
}): React.JSX.Element | null {
  const confirm = useConfirmationDialog()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [result, setResult] = useState<{ actionId: string; value: SiteWpCliResult } | null>(null)

  if (disabledReason !== null) {
    return null
  }

  const run = async (actionId: string, confirmed = false): Promise<void> => {
    setBusyId(actionId)
    try {
      const response = await window.api.siteRuns.wpCli({
        siteId,
        actionId,
        ...(targetName ? { environment: targetName } : {}),
        confirmed
      })
      if (!response.ok) {
        setResult({ actionId, value: { ok: false, message: response.error } })
        return
      }
      const value = response.value
      if (value.blocked && value.needsConfirmation && !confirmed) {
        const accepted = await confirm({
          title: translate(
            'auto.components.right.sidebar.SitePanelWpCli.confirmTitle',
            'Confirm target'
          ),
          description:
            value.message ??
            translate(
              'auto.components.right.sidebar.SitePanelWpCli.confirmBody',
              'The branch does not match an environment. Run anyway?'
            ),
          confirmLabel: translate(
            'auto.components.right.sidebar.SitePanelWpCli.confirmRun',
            'Run anyway'
          ),
          confirmVariant: 'destructive'
        })
        if (accepted) {
          await run(actionId, true)
        }
        return
      }
      setResult({ actionId, value })
    } finally {
      setBusyId(null)
    }
  }

  const shown = result?.value
  const action = SITE_WP_CLI_ACTIONS.find((entry) => entry.id === result?.actionId)

  return (
    <section className="space-y-1.5">
      <SectionHeading>
        {translate('auto.components.right.sidebar.SitePanelWpCli.heading', 'WP-CLI')}
      </SectionHeading>
      <div className="flex flex-wrap gap-1.5">
        {SITE_WP_CLI_ACTIONS.map((entry) => (
          <Button
            key={entry.id}
            variant="outline"
            size="sm"
            className="h-6 gap-1 px-2 text-[11px]"
            disabled={busyId !== null}
            onClick={() => {
              if (entry.writes) {
                void confirm({
                  title: entry.label,
                  description: translate(
                    'auto.components.right.sidebar.SitePanelWpCli.writeBody',
                    'Runs `{{command}}` on {{environment}}.',
                    { command: entry.command, environment: targetName ?? '—' }
                  ),
                  confirmLabel: translate('auto.components.right.sidebar.SitePanelWpCli.run', 'Run')
                }).then((accepted) => {
                  if (accepted) {
                    void run(entry.id)
                  }
                })
                return
              }
              void run(entry.id)
            }}
          >
            {busyId === entry.id ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <TerminalSquare className="size-3" />
            )}
            {entry.label}
          </Button>
        ))}
      </div>
      {shown ? (
        <div className="space-y-1">
          <p className={cn('text-[11px]', shown.ok ? 'text-muted-foreground' : 'text-destructive')}>
            {action?.label ?? result?.actionId}
            {shown.environment ? ` · ${shown.environment}` : ''}
            {shown.host ? ` · ${shown.host}` : ''}
            {typeof shown.exitCode === 'number' ? ` · exit ${shown.exitCode}` : ''}
            {shown.message ? ` — ${shown.message}` : ''}
            {shown.truncated
              ? ` · ${translate('auto.components.right.sidebar.SitePanelWpCli.truncated', 'truncated')}`
              : ''}
          </p>
          {shown.output ? (
            <pre className="max-h-40 overflow-y-auto scrollbar-sleek whitespace-pre-wrap break-words rounded-md bg-muted/40 p-2 font-mono text-[11px]">
              {shown.output}
            </pre>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
