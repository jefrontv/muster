// Which local stack runs this site, on the site itself.
//
// The guided setup has a picker too, but that dialog is only reachable from a clone or a
// `muster://configure` link — so a site already in Muster had no way to move onto another stack.
// This is that control: it reports what the stacks say about the folder, lets the user commit to
// one, and starts or stops it.
//
// It never guesses. `detect` asks the stacks themselves, and the button that changes anything is
// the explicit one — an unmanaged folder is left alone until the user says otherwise.

import { Check, Loader2, Play, Square } from 'lucide-react'
import type React from 'react'
import { useCallback, useEffect, useState } from 'react'
import type { SiteLocalStack, SiteSummary } from '../../../../shared/site-types'
import type { LocalWpControlOutcome } from '../../../../shared/site-stack-types'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const STACK_LABELS: Record<SiteLocalStack, string> = {
  plain: 'None',
  mamp: 'MAMP',
  localwp: 'LocalWP',
  'agent-local': 'agent-local'
}

/** `plain` is always offered: it is how a user says "Muster should not manage this". */
const ALWAYS_OFFERED: SiteLocalStack[] = ['plain']

export function SiteLocalStackControl({ summary }: { summary: SiteSummary }): React.JSX.Element {
  const { site } = summary
  const updateSite = useAppStore((state) => state.updateSite)
  const [available, setAvailable] = useState<SiteLocalStack[] | null>(null)
  const [detected, setDetected] = useState<SiteLocalStack | null>(null)
  const [busy, setBusy] = useState('')
  const [status, setStatus] = useState('')
  const [domain, setDomain] = useState('')

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const answer = await window.api.siteStacks.available()
      if (!cancelled && answer.ok) {
        setAvailable(answer.value)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Re-detect per site, not once: the answer is about this folder, and it changes when the user
  // adopts or drops a stack.
  useEffect(() => {
    let cancelled = false
    setDetected(null)
    setStatus('')
    void (async () => {
      const answer = await window.api.siteStacks.detect(site.id)
      if (!cancelled && answer.ok) {
        setDetected(answer.value.stack)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [site.id])

  const run = useCallback(
    async (label: string, action: () => Promise<{ ok: boolean; value?: LocalWpControlOutcome; error?: string }>) => {
      setBusy(label)
      setStatus('')
      try {
        const answer = await action()
        setStatus(answer.ok ? (answer.value?.message ?? '') : answer.error ?? '')
      } finally {
        setBusy('')
      }
    },
    []
  )

  const choices = [...ALWAYS_OFFERED, ...(available ?? [])]
  // Picking a stack only records the intent. A folder the stack does not manage yet has to be
  // registered with it, which is what the setup action below does — and it is the only thing here
  // that writes outside Muster's own record.
  const needsAdoption = site.localStack !== 'plain' && detected !== site.localStack
  const suggestedDomain =
    site.localDomain.trim() || `${site.path.split('/').filter(Boolean).at(-1) ?? 'site'}.test`
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">
        {translate('auto.components.sites.SiteDetailPanel.localStack', 'Local stack')}
      </Label>
      <div className="flex flex-wrap items-center gap-1.5">
        <div role="radiogroup" aria-label="Local stack" className="flex rounded-md bg-muted/60 p-0.5">
          {choices.map((choice) => (
            <button
              key={choice}
              type="button"
              role="radio"
              aria-checked={site.localStack === choice}
              disabled={busy.length > 0}
              onClick={() => void updateSite(site.id, { localStack: choice })}
              className={cn(
                'rounded px-2 py-1 text-[11px] font-medium transition-colors',
                site.localStack === choice
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {STACK_LABELS[choice]}
            </button>
          ))}
        </div>

        {site.localStack !== 'plain' ? (
          <>
            <Button
              size="sm"
              variant="outline"
              disabled={busy.length > 0}
              onClick={() =>
                void run('start', () => window.api.siteStacks.start(site.id))
              }
            >
              {busy === 'start' ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Play className="size-3.5" />
              )}
              {translate('auto.components.sites.SiteDetailPanel.stackStart', 'Start')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy.length > 0}
              onClick={() => void run('stop', () => window.api.siteStacks.stop(site.id))}
            >
              {busy === 'stop' ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Square className="size-3.5" />
              )}
              {translate('auto.components.sites.SiteDetailPanel.stackStop', 'Stop')}
            </Button>
          </>
        ) : null}
      </div>

      {needsAdoption ? (
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <Input
            className="h-7 w-48 font-mono text-[11px]"
            value={domain}
            placeholder={suggestedDomain}
            onChange={(event) => setDomain(event.target.value)}
          />
          <Button
            size="sm"
            disabled={busy.length > 0}
            onClick={() =>
              void run('adopt', async () => {
                const answer = await window.api.siteStacks.runMigration({
                  siteId: site.id,
                  domain: (domain.trim() || suggestedDomain).trim(),
                  // Only LocalWP seeds a wp-admin account; agent-local adopts the existing install.
                  adminEmail: 'hello@efront.com.au',
                  adminPassword: 'admin',
                  stack: site.localStack
                })
                if (answer.ok && !answer.value.ok) {
                  return { ok: false, error: answer.value.message }
                }
                if (answer.ok) {
                  setDetected(site.localStack)
                }
                return answer.ok
                  ? { ok: true, value: { message: answer.value.message } as LocalWpControlOutcome }
                  : answer
              })
            }
          >
            {busy === 'adopt' ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Check className="size-3.5" />
            )}
            {translate(
              'auto.components.sites.SiteDetailPanel.stackAdopt',
              'Set up with {{stack}}'
            ).replace('{{stack}}', STACK_LABELS[site.localStack])}
          </Button>
        </div>
      ) : null}

      {/* What the stacks themselves report, kept separate from what the record says — the two
          disagreeing is exactly the case worth surfacing (a LocalWP site adopted by agent-local
          still looks like LocalWP on disk). */}
      {detected && detected !== site.localStack ? (
        <p className="text-[11px] text-muted-foreground/80">
          {translate(
            'auto.components.sites.SiteDetailPanel.stackDetected',
            'Detected on disk: {{stack}}'
          ).replace('{{stack}}', STACK_LABELS[detected])}{' '}
          <button
            type="button"
            className="underline underline-offset-2 hover:text-foreground"
            onClick={() => void updateSite(site.id, { localStack: detected })}
          >
            {translate('auto.components.sites.SiteDetailPanel.stackUseDetected', 'Use it')}
          </button>
        </p>
      ) : null}
      {detected && detected === site.localStack && detected !== 'plain' ? (
        <p className="flex items-center gap-1 text-[11px] text-muted-foreground/80">
          <Check className="size-3" />
          {translate('auto.components.sites.SiteDetailPanel.stackConfirmed', 'Confirmed on disk')}
        </p>
      ) : null}
      {status.length > 0 ? (
        <p className="text-[11px] text-muted-foreground/80">{status}</p>
      ) : null}
    </div>
  )
}

export default SiteLocalStackControl
