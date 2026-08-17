// Which local stack runs this site, on the site itself.
//
// The guided setup has a picker too, but that dialog is only reachable from a clone or a
// `muster://configure` link — so a site already in Muster had no way to move onto another stack.
// This is that control: it reports what the stacks say about the folder, lets the user commit to
// one, and starts or stops it.
//
// It never guesses. `detect` asks the stacks themselves, and the only control that writes outside
// Muster's own record is the explicit setup button.

import { CircleAlert, Loader2, Play, Square } from 'lucide-react'
import type React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { SiteLocalStack, SiteSummary } from '../../../../shared/site-types'
import { siteStackAutodetectPatch } from './site-stack-autodetect'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

const STACK_LABELS: Record<SiteLocalStack, string> = {
  plain: 'None',
  mamp: 'MAMP',
  localwp: 'LocalWP',
  'agent-local': 'Agent Local'
}

/** `plain` is always offered: it is how a user says "Muster should not manage this". */
const ALWAYS_OFFERED: SiteLocalStack[] = ['plain']

/** Long enough that a local start shows nothing, short enough that an SSH one still reassures. */
const SPINNER_DELAY_MS = 200

type Pending = 'start' | 'stop' | 'setup' | ''

type Detected = { stack: SiteLocalStack; domain: string }

export function SiteLocalStackControl({ summary }: { summary: SiteSummary }): React.JSX.Element {
  const { site } = summary
  const updateSite = useAppStore((state) => state.updateSite)
  const [available, setAvailable] = useState<SiteLocalStack[] | null>(null)
  const [detected, setDetected] = useState<Detected | null>(null)
  const [pending, setPending] = useState<Pending>('')
  const [spinning, setSpinning] = useState(false)
  const [status, setStatus] = useState('')
  const [failure, setFailure] = useState('')
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

  const refreshDetection = useCallback(async (): Promise<SiteLocalStack | null> => {
    const answer = await window.api.siteStacks.detect(site.id)
    if (!answer.ok) {
      return null
    }
    setDetected({ stack: answer.value.stack, domain: answer.value.domain })
    return answer.value.stack
  }, [site.id])

  // Re-detect per site and stack: the answer is about this folder, and it changes when the user
  // adopts a stack or when a leftover Agent Local slug is already serving it.
  useEffect(() => {
    let cancelled = false
    setDetected(null)
    setStatus('')
    setFailure('')
    void (async () => {
      const answer = await window.api.siteStacks.detect(site.id)
      if (!cancelled && answer.ok) {
        setDetected({ stack: answer.value.stack, domain: answer.value.domain })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [site.id, site.localStack, refreshDetection])

  // Source what the stacks already know into the record: adopt the detected stack on an
  // unconfigured site, and keep localDomain equal to the confirmed stack's serving domain —
  // deploys and search-replace read it. The signature ref stops a re-render between the write
  // and the store refresh from writing the same patch twice.
  const appliedAutodetectRef = useRef('')
  useEffect(() => {
    if (!detected) {
      return
    }
    const patch = siteStackAutodetectPatch(
      { localStack: site.localStack, localDomain: site.localDomain },
      detected
    )
    if (!patch) {
      return
    }
    const signature = `${site.id}\0${patch.localStack ?? ''}\0${patch.localDomain ?? ''}`
    if (appliedAutodetectRef.current === signature) {
      return
    }
    appliedAutodetectRef.current = signature
    void updateSite(site.id, patch)
  }, [detected, site.id, site.localStack, site.localDomain, updateSite])

  const run = useCallback(
    async (
      label: Exclude<Pending, ''>,
      action: () => Promise<{ ok: boolean; message: string }>
    ): Promise<void> => {
      // Disabled immediately so a double click cannot double-submit; the spinner waits, because
      // these calls are instant locally and only slow against a wedged daemon.
      setPending(label)
      setStatus('')
      setFailure('')
      const spinner = setTimeout(() => setSpinning(true), SPINNER_DELAY_MS)
      try {
        const outcome = await action()
        if (outcome.ok) {
          setStatus(outcome.message)
        } else {
          setFailure(outcome.message)
        }
      } finally {
        clearTimeout(spinner)
        setSpinning(false)
        setPending('')
      }
    },
    []
  )

  const managed = site.localStack !== 'plain'
  // Picking a stack only records the intent. A folder that stack does not manage yet has to be
  // registered with it, which is what the setup action does.
  const needsSetup = managed && detected !== null && detected.stack !== site.localStack
  const confirmed = managed && detected?.stack === site.localStack
  // findLast, not filter().at(-1): a trailing slash leaves an empty final segment.
  const folderName = site.path.split('/').findLast((segment) => segment.length > 0) ?? 'site'
  const suggestedDomain = site.localDomain.trim() || `${folderName}.test`
  const busy = pending !== ''

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Label className="text-xs">
            {translate('auto.components.sites.SiteDetailPanel.localStack', 'Local stack')}
          </Label>
          {confirmed ? (
            // "Ready", not "Set up": next to a "Set up with …" button, the past tense reads as
            // another action.
            <Badge variant="dot" className="gap-1 text-[11px] font-normal">
              {translate('auto.components.sites.SiteDetailPanel.stackConfirmed', 'Ready')}
            </Badge>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          {translate(
            'auto.components.sites.SiteDetailPanel.localStackHint',
            'Which stack serves this site and owns its local database.'
          )}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={site.localStack}
          disabled={busy}
          // Radix clears the value when the active item is pressed again; a site always has a
          // stack, so that is a no-op rather than a third state.
          onValueChange={(next) => {
            if (next) {
              void updateSite(site.id, { localStack: next as SiteLocalStack })
            }
          }}
        >
          {[...ALWAYS_OFFERED, ...(available ?? [])].map((choice) => (
            <ToggleGroupItem key={choice} value={choice} className="px-2.5 text-xs">
              {STACK_LABELS[choice]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        {confirmed ? (
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() =>
                void run('start', async () => {
                  const answer = await window.api.siteStacks.start(site.id)
                  return answer.ok
                    ? { ok: answer.value.ok, message: answer.value.message }
                    : { ok: false, message: answer.error }
                })
              }
            >
              {spinning && pending === 'start' ? <Loader2 className="animate-spin" /> : <Play />}
              {translate('auto.components.sites.SiteDetailPanel.stackStart', 'Start')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() =>
                void run('stop', async () => {
                  const answer = await window.api.siteStacks.stop(site.id)
                  return answer.ok
                    ? { ok: answer.value.ok, message: answer.value.message }
                    : { ok: false, message: answer.error }
                })
              }
            >
              {spinning && pending === 'stop' ? <Loader2 className="animate-spin" /> : <Square />}
              {translate('auto.components.sites.SiteDetailPanel.stackStop', 'Stop')}
            </Button>
          </div>
        ) : null}
      </div>

      {needsSetup ? (
        <div className="space-y-1.5 rounded-md border border-border bg-card/50 p-2.5">
          <p className="text-xs text-muted-foreground">
            {translate(
              'auto.components.sites.SiteDetailPanel.stackSetupHint',
              '{{stack}} does not serve this folder yet. Registering it keeps the files where they are.'
            ).replace('{{stack}}', STACK_LABELS[site.localStack])}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="h-8 w-52 font-mono text-xs"
              value={domain}
              placeholder={suggestedDomain}
              disabled={busy}
              aria-label={translate(
                'auto.components.sites.SiteDetailPanel.stackDomainLabel',
                'Local domain'
              )}
              onChange={(event) => setDomain(event.target.value)}
            />
            <Button
              size="sm"
              // Fixed width so swapping in the in-flight label cannot resize the row.
              className="w-40"
              disabled={busy}
              onClick={() =>
                void run('setup', async () => {
                  const answer = await window.api.siteStacks.runMigration({
                    siteId: site.id,
                    domain: (domain.trim() || suggestedDomain).trim(),
                    // Only LocalWP seeds a wp-admin account; agent-local adopts the install as-is.
                    adminEmail: 'hello@efront.com.au',
                    adminPassword: 'admin',
                    stack: site.localStack
                  })
                  const serving = await refreshDetection()
                  if (answer.ok && answer.value.ok) {
                    return { ok: true, message: answer.value.message }
                  }
                  // A leftover slug from a deleted checkout is already serving this folder.
                  if (serving === site.localStack) {
                    return {
                      ok: true,
                      message: `${STACK_LABELS[site.localStack]} is already serving this folder.`
                    }
                  }
                  return {
                    ok: false,
                    message: answer.ok ? answer.value.message : answer.error
                  }
                })
              }
            >
              {spinning && pending === 'setup' ? <Loader2 className="animate-spin" /> : null}
              {pending === 'setup'
                ? translate('auto.components.sites.SiteDetailPanel.stackSettingUp', 'Setting up…')
                : translate(
                    'auto.components.sites.SiteDetailPanel.stackAdopt',
                    'Set up with {{stack}}'
                  ).replace('{{stack}}', STACK_LABELS[site.localStack])}
            </Button>
          </div>
        </div>
      ) : null}

      {/* What the stacks report, kept separate from what the record says. The two disagreeing is
          the case worth surfacing: a LocalWP site adopted by agent-local still looks like LocalWP
          on disk, so only the stacks themselves can settle it. */}
      {detected && detected.stack !== site.localStack && detected.stack !== 'plain' ? (
        <p className="text-[11px] text-muted-foreground">
          {translate(
            'auto.components.sites.SiteDetailPanel.stackDetected',
            '{{stack}} reports it manages this folder.'
          ).replace('{{stack}}', STACK_LABELS[detected.stack])}{' '}
          <Button
            variant="link"
            className="h-auto p-0 text-[11px]"
            disabled={busy}
            // Adopting the stack also adopts its serving domain — the two travel together.
            onClick={() =>
              void updateSite(site.id, {
                localStack: detected.stack,
                ...(detected.domain.trim() && detected.domain !== site.localDomain
                  ? { localDomain: detected.domain.trim() }
                  : {})
              })
            }
          >
            {translate('auto.components.sites.SiteDetailPanel.stackUseDetected', 'Switch to it')}
          </Button>
        </p>
      ) : null}

      {status.length > 0 ? <p className="text-[11px] text-muted-foreground">{status}</p> : null}

      {/* Inline and persistent, not a toast: these messages come from another process and the user
          needs to be able to read, copy, and act on them. */}
      {failure.length > 0 ? (
        <p className="flex items-start gap-1.5 text-[11px] text-destructive">
          <CircleAlert className="mt-px size-3 shrink-0" />
          <span className="break-words">{failure}</span>
        </p>
      ) : null}
    </div>
  )
}

export default SiteLocalStackControl
