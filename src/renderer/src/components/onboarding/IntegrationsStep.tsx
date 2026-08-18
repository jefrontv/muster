import { useEffect, useState } from 'react'
import { DownloadCloud, ExternalLink, Github, Terminal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store'
import { IntegrationStatusPill } from '@/components/integration-status-pill'
import { cn } from '@/lib/utils'
import { OnboardingInlineCommandTerminal } from './OnboardingInlineCommandTerminal'
import { ActiveCollabRow } from './onboarding-activecollab-row'
import { BitbucketRow } from './onboarding-bitbucket-row'
import { translate } from '@/i18n/i18n'

type GitHubSetupState = 'checking' | 'connected' | 'not-installed' | 'not-authenticated'

function getGitHubSetupState(
  status: ReturnType<typeof useAppStore.getState>['preflightStatus']
): GitHubSetupState {
  if (!status) {
    return 'checking'
  }
  if (!status.gh.installed) {
    return 'not-installed'
  }
  return status.gh.authenticated ? 'connected' : 'not-authenticated'
}

export function GitHubRow(props: { compact?: boolean } = {}): React.JSX.Element {
  const { compact = false } = props
  const preflightStatus = useAppStore((s) => s.preflightStatus)
  const preflightStatusLoading = useAppStore((s) => s.preflightStatusLoading)
  const refreshPreflightStatus = useAppStore((s) => s.refreshPreflightStatus)

  const state: GitHubSetupState = preflightStatusLoading
    ? 'checking'
    : getGitHubSetupState(preflightStatus)
  const [githubTerminalOpen, setGithubTerminalOpen] = useState(false)

  return (
    <div className="rounded-xl border border-border bg-muted/20">
      <div className={cn(compact ? 'flex flex-col gap-3 p-4' : 'flex items-start gap-4 p-5')}>
        <div className={cn('flex items-start gap-3', compact ? '' : 'gap-4 flex-1 min-w-0')}>
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-foreground">
            <Github className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[15px] font-semibold leading-tight text-foreground">
                {translate('auto.components.onboarding.IntegrationsStep.217beb0658', 'GitHub')}
              </h3>
              {state === 'connected' ? (
                <IntegrationStatusPill tone="connected">
                  {translate('auto.components.onboarding.IntegrationsStep.c91a5782f1', 'Connected')}
                </IntegrationStatusPill>
              ) : state === 'not-installed' ? (
                <IntegrationStatusPill tone="attention">
                  {translate(
                    'auto.components.onboarding.IntegrationsStep.5c115cb713',
                    'CLI not installed'
                  )}
                </IntegrationStatusPill>
              ) : state === 'not-authenticated' ? (
                <IntegrationStatusPill tone="attention">
                  {translate(
                    'auto.components.onboarding.IntegrationsStep.8405043962',
                    'Sign in needed'
                  )}
                </IntegrationStatusPill>
              ) : (
                <IntegrationStatusPill tone="neutral">
                  {translate('auto.components.onboarding.IntegrationsStep.c1547656f0', 'Checking…')}
                </IntegrationStatusPill>
              )}
            </div>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              {translate(
                'auto.components.onboarding.IntegrationsStep.50db38cf4b',
                'Pull requests, issues, and check status.'
              )}
            </p>
          </div>
        </div>
        <div className={cn('flex items-center gap-2', compact ? 'flex-wrap' : 'shrink-0')}>
          {state === 'not-installed' ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.api.shell.openUrl('https://cli.github.com')}
            >
              <ExternalLink className="size-3.5" />
              {translate('auto.components.onboarding.IntegrationsStep.bd5d976fb2', 'Install gh')}
            </Button>
          ) : null}
          {state === 'not-authenticated' ? (
            <Button
              variant="outline"
              size="sm"
              disabled={githubTerminalOpen}
              onClick={() => setGithubTerminalOpen(true)}
            >
              <Terminal className="size-3.5" />
              {githubTerminalOpen
                ? translate('auto.components.onboarding.IntegrationsStep.0b4a7d23ab', 'Signing in')
                : translate('auto.components.onboarding.IntegrationsStep.d6e5dba05a', 'Sign in')}
            </Button>
          ) : null}
          {state !== 'connected' ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void refreshPreflightStatus({ force: true })}
            >
              {translate('auto.components.onboarding.IntegrationsStep.80e3ce0bc9', 'Re-check')}
            </Button>
          ) : null}
        </div>
      </div>
      {state === 'not-authenticated' && githubTerminalOpen ? (
        <div className={cn(compact ? 'px-4 pb-4' : 'px-5 pb-5')}>
          <OnboardingInlineCommandTerminal
            command="gh auth login"
            title={translate(
              'auto.components.onboarding.IntegrationsStep.6d469169f2',
              'GitHub setup'
            )}
            ariaLabel={translate(
              'auto.components.onboarding.IntegrationsStep.f9d2e12d17',
              'GitHub sign in command'
            )}
            description={translate(
              'auto.components.onboarding.IntegrationsStep.af69f42372',
              'Press Enter to run GitHub CLI auth. Re-check GitHub after the browser or device flow finishes.'
            )}
          />
        </div>
      ) : null}
    </div>
  )
}

function OcsitesImportRow(): React.JSX.Element | null {
  const preflightStatus = useAppStore((s) => s.preflightStatus)
  const importSitesFromOcsites = useAppStore((s) => s.importSitesFromOcsites)
  const [state, setState] = useState<'idle' | 'importing' | 'done' | 'error'>('idle')
  const [resultLabel, setResultLabel] = useState<string | null>(null)

  if (preflightStatus?.ocsites?.detected !== true) {
    return null
  }

  const runImport = async (): Promise<void> => {
    setState('importing')
    const result = await importSitesFromOcsites()
    if ('error' in result) {
      setState('error')
      setResultLabel(result.error)
      return
    }
    setState('done')
    setResultLabel(
      translate(
        'auto.components.onboarding.IntegrationsStep.ocsitesImported',
        'Imported {{created}} new and updated {{updated}} sites.',
        { created: result.created, updated: result.updated }
      )
    )
  }

  return (
    <div className="rounded-xl border border-border bg-muted/20">
      <div className="flex items-start gap-4 p-5">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-foreground">
          <DownloadCloud className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-semibold leading-tight text-foreground">
              {translate('auto.components.onboarding.IntegrationsStep.ocsitesTitle', 'ocsites')}
            </h3>
            {state === 'done' ? (
              <IntegrationStatusPill tone="connected">
                {translate('auto.components.onboarding.IntegrationsStep.ocsitesDone', 'Imported')}
              </IntegrationStatusPill>
            ) : (
              <IntegrationStatusPill tone="neutral">
                {translate(
                  'auto.components.onboarding.IntegrationsStep.ocsitesDetected',
                  'Configuration found'
                )}
              </IntegrationStatusPill>
            )}
          </div>
          <p
            className={cn(
              'mt-1 text-[13px] leading-relaxed',
              state === 'error' ? 'text-destructive' : 'text-muted-foreground'
            )}
          >
            {resultLabel ??
              translate(
                'auto.components.onboarding.IntegrationsStep.ocsitesDescription',
                'Bring your existing ocsites sites, environments, and passwords into Muster.'
              )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {state !== 'done' ? (
            <Button
              variant="outline"
              size="sm"
              disabled={state === 'importing'}
              onClick={() => void runImport()}
            >
              {state === 'importing'
                ? translate(
                    'auto.components.onboarding.IntegrationsStep.ocsitesImporting',
                    'Importing…'
                  )
                : translate('auto.components.onboarding.IntegrationsStep.ocsitesImport', 'Import')}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

const CAPABILITIES = [
  'Pull ActiveCollab tasks into Muster and start work straight from one',
  'Open GitHub and Bitbucket pull requests, reviews, and CI checks in-app',
  "Start a workspace pre-loaded with a task's title and context",
  'See task and review status on every workspace'
] as const

export function IntegrationsStep(): React.JSX.Element {
  const refreshPreflightStatus = useAppStore((s) => s.refreshPreflightStatus)

  useEffect(() => {
    void refreshPreflightStatus()
  }, [refreshPreflightStatus])

  return (
    <div className="space-y-6">
      <ul className="-mt-6 space-y-1.5 text-[14px] leading-relaxed text-muted-foreground">
        {CAPABILITIES.map((line) => (
          <li key={line} className="flex gap-2.5">
            <span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground" aria-hidden />
            <span>{line}</span>
          </li>
        ))}
      </ul>

      <div className="space-y-3">
        <GitHubRow />
        <BitbucketRow />
        <ActiveCollabRow />
        <OcsitesImportRow />
      </div>
    </div>
  )
}
