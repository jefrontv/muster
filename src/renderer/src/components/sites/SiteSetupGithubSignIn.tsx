// GitHub sign-in inside New site: runs `gh auth login` in the same inline terminal onboarding uses,
// instead of asking the user to copy the command into a terminal of their own.

import { ExternalLink, Terminal } from 'lucide-react'
import type React from 'react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { OnboardingInlineCommandTerminal } from '@/components/onboarding/OnboardingInlineCommandTerminal'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { getSiteSetupSourceStrings } from './site-setup-source-strings'

const GH_AUTH_LOGIN_COMMAND = 'gh auth login'

export function SiteSetupGithubSignIn({
  onSignedIn
}: {
  /** Called when the sign-in terminal exits, so the caller re-reads the providers. */
  onSignedIn: () => void
}): React.JSX.Element {
  const strings = getSiteSetupSourceStrings()
  const ghInstalled = useAppStore((s) => s.preflightStatus?.gh.installed !== false)
  const [open, setOpen] = useState(false)

  const copy = (): void => {
    void window.api.ui.writeClipboardText(GH_AUTH_LOGIN_COMMAND)
    toast.success(strings.copyCommandCopiedToast)
  }

  if (!ghInstalled) {
    return (
      <Button
        size="sm"
        variant="outline"
        className="w-fit"
        onClick={() => void window.api.shell.openUrl('https://cli.github.com')}
      >
        <ExternalLink className="size-3.5" />
        {translate('auto.components.sites.SiteSetupSourceScreen.installGh', 'Install gh')}
      </Button>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={open} onClick={() => setOpen(true)}>
          <Terminal className="size-3.5" />
          {translate(
            'auto.components.sites.SiteSetupSourceScreen.signInGithub',
            'Sign in to GitHub'
          )}
        </Button>
        <Button size="sm" variant="ghost" onClick={copy}>
          {strings.copyCommand}
        </Button>
      </div>
      {open ? (
        <OnboardingInlineCommandTerminal
          command={GH_AUTH_LOGIN_COMMAND}
          title={translate(
            'auto.components.onboarding.IntegrationsStep.6d469169f2',
            'GitHub setup'
          )}
          ariaLabel={translate(
            'auto.components.onboarding.IntegrationsStep.f9d2e12d17',
            'GitHub sign in command'
          )}
          description={translate(
            'auto.components.sites.SiteSetupSourceScreen.signInGithubHint',
            'Press Enter to run GitHub CLI sign-in. Your repositories appear here once it finishes.'
          )}
          terminalHeightPx={220}
          autoScrollIntoView={false}
          onTerminalExit={() => {
            setOpen(false)
            onSignedIn()
          }}
        />
      ) : null}
    </div>
  )
}
