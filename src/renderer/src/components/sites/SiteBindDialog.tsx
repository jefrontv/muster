// The explicit-consent gate for a `muster://` link, and the guided setup that follows it.
//
// A link is only ever *staged* by main: anybody can craft one, so nothing is written until the user
// sees exactly what would be stored, picks the local checkout, and confirms. The password is never
// sent here — the dialog only knows that one exists.
//
// Confirming does not close the dialog. Writing the Site record is the *middle* of the ocsites
// flow, not the end: the folder may still need a LocalWP stack and the server content may still
// need pulling down. So Confirm swaps the body for SiteSetupContinuation, which offers those two
// stages and closes when the user is finished. Dismissing at that point is safe — the bind is
// already saved, and both remaining stages are optional by construction.

import { GitBranch, KeyRound, Link2, Loader2, ShieldOff } from 'lucide-react'
import type React from 'react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { PendingSiteBind, SiteBindFields } from '../../../../shared/site-bind-types'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { getSiteBindFieldLabels, getSiteBindStrings } from './site-bind-strings'
import { SiteBindTargetPicker } from './SiteBindTargetPicker'
import { appendCloneLogLine, SiteCloneLog } from './SiteCloneLog'
import { buildSiteBindSetupProposal } from './site-bind-setup-proposal'
import { SiteSetupContinuation } from './SiteSetupContinuation'
import { getSiteSetupStrings } from './site-setup-strings'
import { SiteSetupMinimizeButton } from './SiteSetupMinimizeButton'
import { useMinimizedSiteSetup } from './use-minimized-site-setup'
import { siteBindApi, usePendingSiteBind } from './use-pending-site-bind'

/** Display order; `liveDomainProtocol` is folded into `liveDomain`, so it is not listed. */
const SUMMARY_FIELDS = [
  'reponame',
  'hostname',
  'username',
  'rootPath',
  'liveDomain',
  'localDomain',
  'environment',
  'deployCommand',
  'themeDistPath',
  'notes'
] as const

function summaryValue(fields: SiteBindFields, key: (typeof SUMMARY_FIELDS)[number]): string {
  if (key === 'liveDomain' && fields.liveDomain.length > 0) {
    return `${fields.liveDomainProtocol}://${fields.liveDomain}`
  }
  if (key === 'environment' && fields.environment.length === 0) {
    return 'main'
  }
  return fields[key]
}

function BindSummary({ fields }: { fields: SiteBindFields }): React.JSX.Element {
  const labels = getSiteBindFieldLabels()
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
      {SUMMARY_FIELDS.map((key) => {
        const value = summaryValue(fields, key)
        if (value.length === 0) {
          return null
        }
        return (
          <div key={key} className="col-span-2 grid grid-cols-subgrid">
            <dt className="text-xs text-muted-foreground">{labels[key]}</dt>
            <dd className="min-w-0 truncate font-mono text-xs">{value}</dd>
          </div>
        )
      })}
    </dl>
  )
}

export function SiteBindDialog(): React.JSX.Element | null {
  const { pending, dismiss, clear } = usePendingSiteBind()
  const fetchSites = useAppStore((state) => state.fetchSites)
  const selectSite = useAppStore((state) => state.selectSite)
  const [selectedPath, setSelectedPath] = useState('')
  const [cloning, setCloning] = useState(false)
  const [cloneProgress, setCloneProgress] = useState<{ phase: string; percent: number } | null>(
    null
  )
  const [cloneLog, setCloneLog] = useState<string[]>([])
  const [cloneDestination, setCloneDestination] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')
  // Set once the bind is written. Its presence is what swaps the body over to the follow-on
  // stages — the pending request is cleared at the same time, so this is the only thing keeping
  // the dialog open.
  const [boundSiteId, setBoundSiteId] = useState('')
  const [boundFields, setBoundFields] = useState<SiteBindFields | null>(null)
  /** A setup stage is mid-run; the dialog must not close out from under it. */
  const [setupBusy, setSetupBusy] = useState(false)

  // One id per bind request, so a second link that arrives while this one is parked gets its own
  // chip instead of overwriting it. Falls back to the bound site once the request is cleared.
  const flowId = `bind:${pending?.requestId ?? boundSiteId}`
  const flowLabel = boundFields?.reponame || pending?.fields.hostname || 'site'
  const { minimized, minimize } = useMinimizedSiteSetup(flowId, {
    label: flowLabel,
    // Phase comes from what the dialog already tracks: anything mid-flight is a spinner, and
    // everything else is a question the user has to answer before it can continue.
    stage: cloning
      ? 'Cloning'
      : confirming
        ? 'Binding'
        : setupBusy
          ? 'Setting up'
          : boundSiteId.length > 0
            ? 'Needs a decision'
            : 'Confirm the link',
    phase: cloning || confirming || setupBusy ? 'running' : error.length > 0 ? 'error' : 'waiting',
    percent: cloning ? (cloneProgress?.percent ?? null) : null
  })

  // A newer link replaces the old request outright, so the chosen folder must not carry over.
  // Only a candidate that is actually on disk may be preselected: a stale Site/Repo record whose
  // folder was deleted would otherwise be offered as a bind target that confirm() then rejects.
  useEffect(() => {
    setSelectedPath(pending?.candidates.find((candidate) => candidate.exists)?.path ?? '')
    setError('')
  }, [pending?.requestId, pending?.candidates])

  // Why a lookup rather than trusting the link: `bitbucketCloneUrlForReponame` can only build a URL
  // from a workspace-qualified `reponame`, and real ocsites links carry a bare slug — so the clone
  // affordance would never appear for them. Asking the configured connector for the actual repo
  // recovers it. Failure is silent by design: no connector, or no match, simply means no clone
  // button, which is the same state as before.
  const reponame = pending?.fields.reponame ?? ''
  const linkCloneUrl = pending?.suggestedCloneUrl ?? ''
  const [resolvedCloneUrl, setResolvedCloneUrl] = useState('')
  useEffect(() => {
    setResolvedCloneUrl('')
    if (linkCloneUrl.length > 0 || reponame.length === 0) {
      return
    }
    let cancelled = false
    void (async () => {
      const result = await window.api.siteSetup.cloneTargets({ reponame })
      if (cancelled || !result.ok) {
        return
      }
      setResolvedCloneUrl(result.value.targets[0]?.cloneUrl ?? '')
    })()
    return () => {
      cancelled = true
    }
  }, [reponame, linkCloneUrl])

  // Both clone paths (`clone` and `setUpInRoot`) shell through `repos.clone`, which streams on the
  // same channels the "new site" flow reads. Subscribe while a link is staged so the first git line
  // is not missed; the state is only rendered while `cloning` is set.
  useEffect(() => {
    if (!pending) {
      return
    }
    const offProgress = window.api.repos.onCloneProgress(setCloneProgress)
    const offLog = window.api.repos.onCloneLog((data) => {
      setCloneLog((prev) => appendCloneLogLine(prev, data.line))
    })
    return () => {
      offProgress()
      offLog()
    }
  }, [pending])
  // Why a root at all: ocsites cloned a not-yet-checked-out site straight into the user's projects
  // folder instead of asking for a path, so a link for an unknown site is one click.
  //
  // `primary()`, not `list()[0]`. The derived set renders alphabetically, so its first entry is
  // whichever path sorts first — which is how `~/.agent-local/sites` came to be proposed as the
  // clone destination for a user whose 160 projects live under Documents/Sites.
  const [primaryRoot, setPrimaryRoot] = useState('')
  const pendingRequestId = pending?.requestId ?? ''
  useEffect(() => {
    if (pendingRequestId.length === 0) {
      return
    }
    let cancelled = false
    void (async () => {
      const result = await window.api.siteRoots.primary()
      if (!cancelled && result.ok) {
        setPrimaryRoot(result.value)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [pendingRequestId])

  if (!pending && boundSiteId.length === 0) {
    return null
  }
  const strings = getSiteBindStrings()
  const setupStrings = getSiteSetupStrings()

  const clone = async (pendingBind: PendingSiteBind): Promise<void> => {
    const destination = await window.api.repos.pickDirectory()
    if (!destination) {
      return
    }
    setCloning(true)
    setCloneProgress(null)
    setCloneLog([])
    setCloneDestination(destination)
    setError('')
    try {
      // Orca's own clone: it streams progress and registers the Repo, so this flow never shells git.
      const repo = await window.api.repos.clone({
        url: pendingBind.suggestedCloneUrl || resolvedCloneUrl,
        destination,
        // The link named a branch: check it out rather than landing on the repo default.
        branch: pendingBind.fields.checkoutBranch
      })
      setSelectedPath(repo.path)
    } catch (cloneError) {
      const message = cloneError instanceof Error ? cloneError.message : String(cloneError)
      setError(message)
      toast.error(strings.cloneFailedToast, { description: message })
    } finally {
      setCloning(false)
    }
  }

  // Clones into the configured projects folder without a picker, then binds — the ocsites
  // "set it up for me" path. `repos.clone` takes the PARENT and derives the folder from the URL,
  // and mkdir -p's it, so a root that does not exist yet is created rather than an error.
  const setUpInRoot = async (pendingBind: PendingSiteBind, root: string): Promise<void> => {
    setCloning(true)
    setCloneProgress(null)
    setCloneLog([])
    setCloneDestination(root)
    setError('')
    try {
      const repo = await window.api.repos.clone({
        url: pendingBind.suggestedCloneUrl || resolvedCloneUrl,
        destination: root,
        branch: pendingBind.fields.checkoutBranch
      })
      setSelectedPath(repo.path)
      await confirm(pendingBind, repo.path)
    } catch (setupError) {
      const message = setupError instanceof Error ? setupError.message : String(setupError)
      setError(message)
      toast.error(strings.cloneFailedToast, { description: message })
    } finally {
      setCloning(false)
    }
  }

  // `path` is explicit so the auto-setup flow can bind the freshly cloned folder without waiting
  // for the selectedPath state update to land.
  const confirm = async (pendingBind: PendingSiteBind, path = selectedPath): Promise<void> => {
    const api = siteBindApi()
    if (!api) {
      return
    }
    setConfirming(true)
    setError('')
    try {
      const result = await api.confirm({ requestId: pendingBind.requestId, path })
      if (!result.ok) {
        setError(result.error)
        return
      }
      const { applied } = result.value
      await fetchSites()
      selectSite(applied.siteId)
      if (applied.secretError.length > 0) {
        toast.warning(strings.secretFailedToast, { description: applied.secretError })
      } else {
        toast.success(strings.boundToast, { description: applied.path })
      }
      // Capture the fields before clearing: the follow-on stages need `reponame` and
      // `environment`, and `clear()` drops the pending request they came from.
      setBoundFields(pendingBind.fields)
      setBoundSiteId(applied.siteId)
      clear()
    } finally {
      setConfirming(false)
    }
  }

  const finish = (): void => {
    setBoundSiteId('')
    setBoundFields(null)
    setSelectedPath('')
  }

  // Stage 3/4. `pending` is already cleared here, so this branch must not read it.
  if (boundSiteId.length > 0) {
    return (
      <Dialog
        open={!minimized}
        onOpenChange={(open) => {
          // Escape and outside-clicks are the other ways out of the dialog; a stage mid-run has to
          // refuse them too, or the nav's disabled Done is a lock with the door left open.
          //
          // Minimizing is not this path: it closes the dialog through `minimized`, which leaves the
          // subtree mounted and the work running rather than ending the flow.
          if (!open && !minimized && !setupBusy) {
            finish()
          }
        }}
      >
        <DialogContent className="max-w-xl" keepMounted>
          <DialogHeader className="pr-16">
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="size-4" />
              {setupStrings.title}
            </DialogTitle>
            <DialogDescription>{setupStrings.description}</DialogDescription>
          </DialogHeader>
          <SiteSetupMinimizeButton onMinimize={minimize} />

          {/* No DialogFooter here: the setup pages own their own Back/Next/Done, so Done only
              appears on the last page instead of sitting next to the loading spinner. */}
          <SiteSetupContinuation
            siteId={boundSiteId}
            reponame={boundFields?.reponame ?? ''}
            branch={null}
            onDone={finish}
            onBusyChange={setSetupBusy}
          />
        </DialogContent>
      </Dialog>
    )
  }

  if (!pending) {
    return null
  }
  const active = pending
  const effectiveCloneUrl = active.suggestedCloneUrl || resolvedCloneUrl
  const { proposedPath, proposedRootLabel, needsFreshSetup } = buildSiteBindSetupProposal({
    primaryRoot,
    cloneUrl: effectiveCloneUrl,
    candidates: active.candidates
  })
  // Needs all three: nothing reachable to bind, a root to clone into, and a URL to clone from.
  const canSetUpInRoot = needsFreshSetup && proposedPath.length > 0 && effectiveCloneUrl.length > 0

  return (
    <Dialog
      open={!minimized}
      onOpenChange={(open) => {
        // Minimizing also closes the dialog, so dismissing has to exclude it — otherwise sending a
        // clone to the status bar would throw the whole bind request away.
        if (!open && !minimized && !cloning) {
          dismiss()
        }
      }}
    >
      <DialogContent className="max-w-xl" keepMounted>
        <DialogHeader className="pr-16">
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="size-4" />
            {strings.title}
          </DialogTitle>
          <DialogDescription>{strings.description}</DialogDescription>
        </DialogHeader>
        <SiteSetupMinimizeButton onMinimize={minimize} />

        <div className="scrollbar-sleek max-h-[55vh] space-y-4 overflow-y-auto pr-1">
          <section className="space-y-2">
            <h3 className="text-xs font-medium text-muted-foreground">{strings.willStore}</h3>
            <BindSummary fields={active.fields} />
          </section>

          <p className="flex items-start gap-2 rounded-md bg-muted px-2 py-1.5 text-xs">
            {active.passwordProvided ? (
              <KeyRound className="mt-0.5 size-3.5 shrink-0" />
            ) : (
              <ShieldOff className="mt-0.5 size-3.5 shrink-0" />
            )}
            {active.passwordProvided ? strings.passwordNotice : strings.noPasswordNotice}
          </p>

          <SiteBindTargetPicker
            candidates={active.candidates}
            selectedPath={selectedPath}
            onSelect={setSelectedPath}
            cloneUrl={effectiveCloneUrl}
            cloning={cloning}
            onClone={() => void clone(active)}
            proposedPath={proposedPath}
            canSetUpInRoot={canSetUpInRoot}
            needsFreshSetup={needsFreshSetup}
          />

          {cloning ? (
            <div className="space-y-2 rounded-md border border-border bg-muted/40 p-3">
              <div className="flex items-center gap-2 text-sm">
                <Loader2 className="size-3.5 shrink-0 animate-spin" />
                <span className="truncate">
                  {cloneProgress
                    ? `${cloneProgress.phase} ${cloneProgress.percent}%`
                    : strings.cloning}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-200"
                  style={{ width: `${Math.min(100, Math.max(0, cloneProgress?.percent ?? 0))}%` }}
                />
              </div>
              {cloneLog.length > 0 ? <SiteCloneLog lines={cloneLog} /> : null}
              {cloneDestination.length > 0 ? (
                <p className="break-all font-mono text-[11px] text-muted-foreground/70">
                  {cloneDestination}
                </p>
              ) : null}
            </div>
          ) : null}

          {error.length > 0 ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={dismiss}>
            {strings.cancel}
          </Button>
          {/* Binding needs an existing checkout of this repo. With nothing to bind, offering the
              action would only ever error, so the setup that creates the checkout takes its place. */}
          {canSetUpInRoot ? (
            <Button
              disabled={cloning || confirming}
              onClick={() => void setUpInRoot(active, primaryRoot)}
            >
              {cloning ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <GitBranch className="size-3.5" />
              )}
              {cloning
                ? strings.settingUp
                : strings.setUpInRoot.replace('{{folder}}', proposedRootLabel)}
            </Button>
          ) : (
            <Button
              disabled={selectedPath.length === 0 || confirming || cloning}
              onClick={() => void confirm(active)}
            >
              {confirming ? strings.confirming : strings.confirm}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default SiteBindDialog
