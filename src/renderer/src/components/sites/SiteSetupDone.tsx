// Screen 4 from the redesign plan. The dialog renders the "<site> is ready" heading; this is the
// body: the settled step list, the one-time wp-admin credentials when LocalWP created them, and
// the Close / Open footer.

import type React from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { LOCALWP_ADMIN_EMAIL, LOCALWP_ADMIN_PASSWORD } from '../../../../shared/site-setup-defaults'
import type { SetupRunStep, SetupRunStepId } from './site-setup-choices'
import { SETUP_RUN_STEP_ORDER } from './site-setup-choices'
import { getSiteSetupRunStrings, type SiteSetupRunStrings } from './site-setup-run-strings'

export type SiteSetupDoneProps = {
  steps: SetupRunStep[]
  siteLabel: string
  /** '' when Serve did not run. */
  domain: string
  /** True only when Serve created a LocalWP install. */
  showAdminCredentials: boolean
  onClose: () => void
  onOpenSite: (() => void) | null
}

const VISIBLE_STEP_IDS = SETUP_RUN_STEP_ORDER.filter((id) => id !== 'register')

const STEP_TITLE_KEYS: Record<(typeof VISIBLE_STEP_IDS)[number], keyof SiteSetupRunStrings> = {
  clone: 'stepClone',
  serve: 'stepServe',
  https: 'stepHttps',
  import: 'stepImport'
}

async function copyValue(value: string, copiedLabel: string): Promise<void> {
  await navigator.clipboard.writeText(value)
  toast.success(copiedLabel)
}

export function SiteSetupDone({
  steps,
  siteLabel,
  domain,
  showAdminCredentials,
  onClose,
  onOpenSite
}: SiteSetupDoneProps): React.JSX.Element {
  const strings = getSiteSetupRunStrings()
  const stepById: Partial<Record<SetupRunStepId, SetupRunStep>> = {}
  for (const step of steps) {
    stepById[step.id] = step
  }

  return (
    <div className="space-y-4" aria-label={siteLabel}>
      <ul className="space-y-1 text-sm">
        {VISIBLE_STEP_IDS.map((id) => {
          const step = stepById[id]
          if (!step || step.state === 'not-run') {
            return null
          }
          const title = strings[STEP_TITLE_KEYS[id]]
          if (step.state === 'skipped') {
            return (
              <li key={id} className="text-muted-foreground">
                – {strings.skippedPrefix.replace('{{title}}', title)}
                {step.detail.length > 0 ? `: ${step.detail}` : ''}
              </li>
            )
          }
          return <li key={id}>✓ {step.detail.length > 0 ? step.detail : title}</li>
        })}
      </ul>

      {showAdminCredentials ? (
        <div className="space-y-1.5 rounded-md border border-border bg-muted/40 p-3">
          <div className="flex items-center gap-2 text-xs font-medium">
            {strings.adminAccountLabel}
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs">{LOCALWP_ADMIN_EMAIL}</span>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => void copyValue(LOCALWP_ADMIN_EMAIL, strings.copied)}
            >
              {strings.copy}
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs">{LOCALWP_ADMIN_PASSWORD}</span>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => void copyValue(LOCALWP_ADMIN_PASSWORD, strings.copied)}
            >
              {strings.copy}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">{strings.adminAccountNotice}</p>
        </div>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          {strings.close}
        </Button>
        {onOpenSite !== null ? (
          <Button variant="default" onClick={onOpenSite}>
            {strings.openSite.replace('{{domain}}', domain)}
          </Button>
        ) : null}
      </div>
    </div>
  )
}

export default SiteSetupDone
