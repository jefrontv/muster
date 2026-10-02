// Registers the built-in muster-sites MCP server with the user's coding agents, during onboarding
// rather than after the fact in Settings.
//
// Why a step and not a row on Integrations: every other integration there is an account to
// connect. This one writes a server entry into each agent's config, and it only applies in Code
// mode, so it is skipped entirely for Chat (see use-onboarding-flow.ts).
//
// One button installs into every agent on this computer: wiring is the default and withdrawing is
// the exception, the same rule the Extension Hub follows. The per-agent rows stay one click away
// under "Choose agents" for people who want to leave one out.
//
// The status and install actions come from the same controller the Settings card uses, so the two
// surfaces can never disagree about what is installed.

import { Check, ChevronRight, LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import { SiteMcpHarnessRow } from '@/components/settings/site-mcp-harness-row'
import { siteMcpHarnessStateKind } from '@/components/settings/site-mcp-harness-state'
import { useSiteMcpGlobalStatus } from '@/components/settings/use-site-mcp-global-status'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { OnboardingRecommendedTools } from './onboarding-recommended-tools'

export function OnboardingSiteMcpStep(): React.JSX.Element {
  const mcp = useSiteMcpGlobalStatus()
  const [installingAll, setInstallingAll] = useState(false)
  const harnesses = mcp.status?.harnesses ?? []
  const present = harnesses.filter((harness) => harness.present)
  const bound = harnesses.some((harness) => siteMcpHarnessStateKind(harness) === 'current')
  const pending = present.filter((harness) => siteMcpHarnessStateKind(harness) !== 'current')

  const installAll = async (): Promise<void> => {
    setInstallingAll(true)
    try {
      for (const harness of pending) {
        await mcp.install(harness.id)
      }
    } finally {
      setInstallingAll(false)
    }
  }

  return (
    <div className="space-y-5" data-testid="onboarding-site-mcp-step">
      {!mcp.checked ? (
        <p className="text-[13px] text-muted-foreground">
          {translate('auto.components.onboarding.SiteMcpStep.checking', 'Checking your agents…')}
        </p>
      ) : mcp.loadError !== null ? (
        <div className="space-y-3">
          <p role="alert" className="text-[13px] break-words text-destructive">
            {mcp.loadError}
          </p>
          <Button variant="outline" size="sm" onClick={() => void mcp.refresh()}>
            {translate('auto.components.onboarding.SiteMcpStep.retry', 'Try again')}
          </Button>
        </div>
      ) : present.length === 0 ? (
        // Nothing to write into yet. Skipping is the honest outcome: Settings carries the same
        // card once an agent exists.
        <p className="text-[13px] text-muted-foreground">
          {translate(
            'auto.components.onboarding.SiteMcpStep.no_harnesses',
            'No coding agents found yet. Install one and Muster can add site tools to it from Settings later.'
          )}
        </p>
      ) : (
        <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-3">
          <div className="flex items-start gap-3">
            <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-muted-foreground">
              {pending.length === 0
                ? translate(
                    'auto.components.onboarding.SiteMcpStep.all_ready',
                    'Every agent on this computer has site tools.'
                  )
                : translate(
                    'auto.components.onboarding.SiteMcpStep.install_hint',
                    'Adds site tools to every agent on this computer.'
                  )}
            </p>
            {pending.length > 0 ? (
              <Button
                size="sm"
                className="shrink-0"
                disabled={installingAll || mcp.busy !== null}
                onClick={() => void installAll()}
              >
                {installingAll ? <LoaderCircle className="animate-spin" /> : null}
                {translate(
                  'auto.components.onboarding.SiteMcpStep.install_all',
                  'Install for all my agents'
                )}
              </Button>
            ) : null}
          </div>
          <ul className="space-y-1">
            {present.map((harness) => {
              const added = siteMcpHarnessStateKind(harness) === 'current'
              return (
                <li key={harness.id} className="flex items-center gap-2 text-xs">
                  <span
                    className={cn(
                      'flex size-4 shrink-0 items-center justify-center',
                      added ? 'text-[var(--status-success)]' : 'text-muted-foreground/50'
                    )}
                  >
                    {mcp.busy === harness.id ? (
                      <LoaderCircle className="size-3.5 animate-spin text-muted-foreground" />
                    ) : added ? (
                      <Check className="size-3.5" />
                    ) : (
                      <span className="size-1.5 rounded-full bg-current" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-foreground">{harness.label}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {added
                      ? translate('auto.components.onboarding.SiteMcpStep.added', 'Added')
                      : translate(
                          'auto.components.onboarding.SiteMcpStep.not_added',
                          'Not added yet'
                        )}
                  </span>
                </li>
              )
            })}
          </ul>
          {mcp.notice?.tone === 'error' ? (
            <p role="alert" className="text-xs break-words text-destructive">
              {mcp.notice.message}
            </p>
          ) : null}
          <Collapsible className="group/agents">
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="xs"
                className="-ml-1.5 h-6 gap-1 px-1.5 text-xs text-muted-foreground"
              >
                <ChevronRight className="size-3 transition-transform group-data-[state=open]/agents:rotate-90" />
                {translate('auto.components.onboarding.SiteMcpStep.choose_agents', 'Choose agents')}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 pt-1.5">
              {harnesses.map((harness) => (
                <SiteMcpHarnessRow
                  key={harness.id}
                  harness={harness}
                  busy={mcp.busy === harness.id}
                  notice={mcp.notice?.scope === harness.id ? mcp.notice : null}
                  blockedReason={null}
                  boundElsewhere={bound}
                  onInstall={() => void mcp.install(harness.id)}
                  compact
                />
              ))}
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}

      <OnboardingRecommendedTools />
    </div>
  )
}
