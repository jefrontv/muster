// "Agent access" for ActiveCollab: one button, then the agents it reached as results.
//
// Shared by onboarding and Settings > Integrations so the two can never ask for different steps.

import { Check, LoaderCircle, MoreHorizontal } from 'lucide-react'
import { IntegrationStatusPill } from '@/components/integration-status-pill'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { ExtensionMissingToolNotice } from './extension-missing-tool-notice'
import type { ActiveCollabAgentAccess } from './use-activecollab-agent-access'

function actionLabel(access: ActiveCollabAgentAccess): string {
  if (access.working) {
    return translate('auto.components.settings.activecollab.access.working', 'Setting up…')
  }
  if (
    access.binaryFound &&
    access.pendingCount > 0 &&
    access.harnesses.length > access.pendingCount
  ) {
    if (access.pendingCount === 1) {
      return translate(
        'auto.components.settings.activecollab.access.add_one',
        'Add to 1 more agent'
      )
    }
    return translate(
      'auto.components.settings.activecollab.access.add_more',
      'Add to {{count}} more agents'
    ).replace('{{count}}', String(access.pendingCount))
  }
  return translate('auto.components.settings.activecollab.access.give', 'Give my agents access')
}

export function ActiveCollabAgentAccessPanel({
  access,
  compact = false,
  showHeading = true
}: {
  access: ActiveCollabAgentAccess
  compact?: boolean
  showHeading?: boolean
}): React.JSX.Element | null {
  if (!access.checked) {
    return null
  }
  if (access.loadError) {
    return (
      <p role="alert" className="text-xs break-words text-destructive">
        {access.loadError}
      </p>
    )
  }

  return (
    <div className="space-y-2.5" data-testid="activecollab-agent-access">
      <div className={cn('flex items-start gap-3', compact && 'gap-2')}>
        <div className="min-w-0 flex-1">
          {showHeading ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[13px] font-medium leading-tight text-foreground">
                {translate(
                  'auto.components.onboarding.IntegrationsStep.activecollabMcp',
                  'Agent access'
                )}
              </p>
              <IntegrationStatusPill tone={access.ready ? 'connected' : 'attention'}>
                {access.ready
                  ? translate(
                      'auto.components.onboarding.IntegrationsStep.activecollabMcpReady',
                      'Ready'
                    )
                  : translate(
                      'auto.components.onboarding.IntegrationsStep.activecollabMcpSetup',
                      'Setup needed'
                    )}
              </IntegrationStatusPill>
            </div>
          ) : null}
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            {access.ready
              ? translate(
                  'auto.components.onboarding.IntegrationsStep.activecollabMcpReadyHelp',
                  'Your agents can read and edit tasks with this login. Restart any that are already running.'
                )
              : translate(
                  'auto.components.settings.activecollab.access.help',
                  'Installs the ActiveCollab server and adds it to every agent on this computer.'
                )}
          </p>
        </div>
        {!access.ready ? (
          <Button
            size="sm"
            // Fixed width so the in-flight label cannot resize the row.
            className="w-44 shrink-0"
            disabled={access.working}
            onClick={() => void access.giveAccess()}
          >
            {access.working ? <LoaderCircle className="animate-spin" /> : null}
            {actionLabel(access)}
          </Button>
        ) : null}
      </div>

      {access.harnesses.length > 0 ? (
        <ul className="space-y-1">
          {access.harnesses.map((harness) => {
            const added = harness.configured && harness.current
            return (
              <li
                key={harness.id}
                className="flex items-center gap-2 text-xs"
                data-harness-id={harness.id}
              >
                <span
                  className={cn(
                    'flex size-4 shrink-0 items-center justify-center',
                    added ? 'text-[var(--status-success)]' : 'text-muted-foreground/50'
                  )}
                >
                  {added ? (
                    <Check className="size-3.5" />
                  ) : (
                    <span className="size-1.5 rounded-full bg-current" />
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate text-foreground">{harness.label}</span>
                <span className="shrink-0 text-muted-foreground">
                  {added
                    ? translate('auto.components.settings.activecollab.access.added', 'Added')
                    : harness.configured
                      ? translate(
                          'auto.components.settings.activecollab.access.outdated',
                          'Needs update'
                        )
                      : translate(
                          'auto.components.settings.activecollab.access.not_added',
                          'Not added yet'
                        )}
                </span>
                {harness.configured ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={translate(
                          'auto.components.extensions.harness_more',
                          'More actions for {{harness}}'
                        ).replace('{{harness}}', harness.label)}
                      >
                        <MoreHorizontal className="size-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => void access.removeFrom(harness.id)}
                      >
                        {translate(
                          'auto.components.settings.activecollab.access.remove',
                          'Remove from {{harness}}'
                        ).replace('{{harness}}', harness.label)}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <span className="size-6 shrink-0" />
                )}
              </li>
            )
          })}
        </ul>
      ) : null}

      {access.missingTool ? (
        <ExtensionMissingToolNotice
          missing={access.missingTool}
          onCheckAgain={() => void access.giveAccess()}
        />
      ) : null}

      {access.error ? (
        <div role="alert" className="space-y-1">
          <p className="text-xs break-words text-destructive">{access.error}</p>
          {access.output.trim().length > 0 ? (
            <details className="text-[11px] text-muted-foreground">
              <summary className="cursor-pointer select-none">
                {translate('auto.components.settings.activecollab.access.details', 'Details')}
              </summary>
              <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-muted/40 p-2 font-mono">
                {access.output.trim()}
              </pre>
            </details>
          ) : null}
        </div>
      ) : null}

      <p className="text-[11px] text-muted-foreground/80">
        {translate(
          'auto.components.settings.activecollab.access.local_only',
          'Agents on this computer only. Agents in SSH workspaces don’t get this server.'
        )}
      </p>
    </div>
  )
}
