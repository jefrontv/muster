// What the Serve row offers when no local stack is installed: Agent Local in one click (macOS, via
// the Extension Hub), or the DDEV and LocalWP download pages. The row then updates on its own.

import { ExternalLink, LoaderCircle } from 'lucide-react'
import type React from 'react'
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { useExtensionRun } from '@/hooks/useExtensionRun'
import { refreshAvailableSiteStacks } from '@/lib/use-available-site-stacks'
import { ExtensionMissingToolNotice } from '@/components/settings/extension-missing-tool-notice'
import { getSiteSetupReviewStrings } from './site-setup-review-strings'

const DDEV_URL = 'https://ddev.com/get-started/'
const LOCALWP_URL = 'https://localwp.com'

// Agent Local ships for macOS only (its catalog entry is darwin-gated).
function canInstallAgentLocal(): boolean {
  return typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac')
}

export function SiteSetupNoStackFixes(): React.JSX.Element {
  const strings = getSiteSetupReviewStrings()
  const run = useExtensionRun('agent-local')
  const running = run.phase === 'running'

  useEffect(() => {
    if (run.phase === 'succeeded') {
      refreshAvailableSiteStacks()
    }
  }, [run.phase])

  return (
    <div className="w-full space-y-2">
      <div className="flex flex-wrap gap-2">
        {canInstallAgentLocal() ? (
          <Button size="xs" disabled={running} onClick={() => void run.start('install')}>
            {running ? <LoaderCircle className="animate-spin" /> : null}
            {running ? strings.installingAgentLocal : strings.installAgentLocal}
          </Button>
        ) : null}
        <Button size="xs" variant="outline" onClick={() => void window.api.shell.openUrl(DDEV_URL)}>
          <ExternalLink className="size-3" />
          {strings.getDdev}
        </Button>
        <Button
          size="xs"
          variant="outline"
          onClick={() => void window.api.shell.openUrl(LOCALWP_URL)}
        >
          <ExternalLink className="size-3" />
          {strings.getLocalWp}
        </Button>
      </div>
      {run.phase === 'failed' && run.missingTool ? (
        <ExtensionMissingToolNotice
          missing={run.missingTool}
          onCheckAgain={() => void run.start('install')}
        />
      ) : run.phase === 'failed' && run.error ? (
        <p role="alert" className="text-xs break-words text-destructive">
          {run.error}
        </p>
      ) : null}
    </div>
  )
}
