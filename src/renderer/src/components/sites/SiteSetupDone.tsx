// The dialog renders the "<site> is ready" heading; this is the body. It reads like the run screen
// it follows - the same rows, now settled - with the one thing the user wants next up top: the
// local address. Credentials appear only when this run created the LocalWP install they belong to.

import { Check, Copy, Globe, Minus } from 'lucide-react'
import type React from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { LOCALWP_ADMIN_EMAIL, LOCALWP_ADMIN_PASSWORD } from '../../../../shared/site-setup-defaults'
import type { SetupRunStep, SetupRunStepId } from './site-setup-choices'
import { SETUP_RUN_STEP_ORDER } from './site-setup-choices'
import { getSiteSetupRunStrings, type SiteSetupRunStrings } from './site-setup-run-strings'
import { SiteSetupRow, SiteSetupRowList } from './SiteSetupRow'

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

// Through main, not navigator.clipboard: the renderer's clipboard write needs a focused document
// and a permission grant Electron does not give it, so it silently did nothing here.
async function copyValue(value: string, copiedLabel: string): Promise<void> {
  await window.api.ui.writeClipboardText(value)
  toast.success(copiedLabel)
}

function CopyButton({ value, label }: { value: string; label: string }): React.JSX.Element {
  const strings = getSiteSetupRunStrings()
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={`${strings.copy} ${label}`}
      onClick={() => void copyValue(value, strings.copied)}
    >
      <Copy />
    </Button>
  )
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
  const httpsDone = stepById.https?.state === 'done'
  const url = domain.length > 0 ? `${httpsDone ? 'https' : 'http'}://${domain}` : ''

  return (
    <div className="space-y-4" aria-label={siteLabel}>
      {url.length > 0 ? (
        <div className="flex items-center gap-3 rounded-md border border-border bg-muted/40 px-3 py-2.5">
          <Globe className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">{strings.localAddress}</p>
            <p className="truncate font-mono text-sm">{url}</p>
          </div>
          <CopyButton value={url} label={strings.localAddress} />
        </div>
      ) : null}

      <SiteSetupRowList>
        {VISIBLE_STEP_IDS.map((id) => {
          const step = stepById[id]
          if (!step || step.state === 'not-run' || step.state === 'pending') {
            return null
          }
          const title = strings[STEP_TITLE_KEYS[id]]
          const skipped = step.state === 'skipped'
          return (
            <SiteSetupRow
              key={id}
              icon={
                skipped ? (
                  <Minus className="size-4 text-muted-foreground" />
                ) : (
                  <Check className="size-4 text-green-600 dark:text-green-500" />
                )
              }
              title={title}
              summary={
                skipped
                  ? step.detail.length > 0
                    ? `${strings.skipped} · ${step.detail}`
                    : strings.skipped
                  : step.detail
              }
              state={skipped ? 'locked' : 'available'}
            />
          )
        })}
      </SiteSetupRowList>

      {showAdminCredentials ? (
        <div className="space-y-2 rounded-md border border-border px-3 py-2.5">
          <p className="text-xs font-medium">{strings.adminAccountLabel}</p>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-xs">
            <dt className="text-muted-foreground">{strings.adminEmail}</dt>
            <dd className="truncate font-mono">{LOCALWP_ADMIN_EMAIL}</dd>
            <dd>
              <CopyButton value={LOCALWP_ADMIN_EMAIL} label={strings.adminEmail} />
            </dd>
            <dt className="text-muted-foreground">{strings.adminPassword}</dt>
            <dd className="truncate font-mono">{LOCALWP_ADMIN_PASSWORD}</dd>
            <dd>
              <CopyButton value={LOCALWP_ADMIN_PASSWORD} label={strings.adminPassword} />
            </dd>
          </dl>
          <p className="text-[11px] text-muted-foreground">{strings.adminAccountNotice}</p>
        </div>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
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
