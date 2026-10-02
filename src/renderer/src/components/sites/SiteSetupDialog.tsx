// The one site setup dialog: pick a source, review one plan, press one button, watch one run.
//
// Three ways in - the New site button (repo picker), a `muster://` link, and Finish setup on a site
// that exists - all land on the same review and the same runner. Nothing is written until the
// review's "Set up site": `register` inside the runner is the single consent point, which is the
// contract the old bind dialog had and this keeps for every source.
//
// Mounted by SiteSetupHost at the App root and kept mounted while minimised, so the run it holds
// survives leaving the Sites page.

import { Link2, Loader2 } from 'lucide-react'
import type React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { PendingSiteBind } from '../../../../shared/site-bind-types'
import type { CloneSourceRepo } from '../../../../shared/site-clone-source-types'
import { repoSlug } from '../../../../shared/site-local-domain'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { getSiteSetupDialogStrings } from './site-setup-dialog-strings'
import type { SetupRunStepId, SiteSetupSource } from './site-setup-choices'
import { SiteSetupDone } from './SiteSetupDone'
import { SiteSetupLinkTargetRows } from './SiteSetupLinkTargetRows'
import { SiteSetupMinimizeButton } from './SiteSetupMinimizeButton'
import { SiteSetupReview } from './SiteSetupReview'
import { AddSiteEnvironmentDialog } from './AddSiteEnvironmentDialog'
import { SiteSetupRun } from './SiteSetupRun'
import { SiteSetupSourceScreen } from './SiteSetupSourceScreen'
import { useMinimizedSiteSetup } from './use-minimized-site-setup'
import { useSiteSetupReviewData } from './use-site-setup-review-data'
import { useServeDomainCheck } from './use-serve-domain-check'
import { useSiteSetupRunner } from './use-site-setup-runner'

export type SiteSetupRequest =
  | { kind: 'repo' }
  | { kind: 'link'; pending: PendingSiteBind }
  | { kind: 'site'; siteId: string; label: string }

type Screen = 'source' | 'review' | 'running' | 'done'

export function SiteSetupDialog({
  request,
  onClose,
  onSiteReady
}: {
  request: SiteSetupRequest
  /** `dismissed` while nothing was written; `finished` once the run started, whatever its outcome. */
  onClose: (reason: 'dismissed' | 'finished') => void
  /** Fires once the Site record exists, so the sites list can select it behind the dialog. */
  onSiteReady: (siteId: string) => void
}): React.JSX.Element {
  const strings = getSiteSetupDialogStrings()
  const { runner, snapshot } = useSiteSetupRunner()
  const [screen, setScreen] = useState<Screen>(request.kind === 'repo' ? 'source' : 'review')
  const [repo, setRepo] = useState<CloneSourceRepo | null>(null)
  const [lockedSteps, setLockedSteps] = useState<SetupRunStepId[]>([])
  const readyReportedRef = useRef(false)
  const {
    destinationRoot,
    setDestinationRoot,
    linkTarget,
    setLinkTarget,
    linkCloneUrl,
    linkCloneProblem,
    plan,
    availableStacks,
    cert,
    choices,
    setChoices,
    promptStackChoice
  } = useSiteSetupReviewData(request, repo)
  const [addEnvironmentOpen, setAddEnvironmentOpen] = useState(false)
  const setSettingsSearchQuery = useAppStore((state) => state.setSettingsSearchQuery)
  const openSettingsTarget = useAppStore((state) => state.openSettingsTarget)
  const openSettingsPage = useAppStore((state) => state.openSettingsPage)

  const label =
    request.kind === 'repo'
      ? repo
        ? repoSlug(repo.fullName)
        : ''
      : request.kind === 'link'
        ? repoSlug(request.pending.fields.reponame) || request.pending.fields.hostname
        : request.label

  useEffect(() => {
    if (snapshot.siteId.length > 0 && !readyReportedRef.current) {
      readyReportedRef.current = true
      onSiteReady(snapshot.siteId)
      if (snapshot.secretError.length > 0) {
        toast.warning(strings.secretFailedToast, { description: snapshot.secretError })
      }
    }
  }, [snapshot.siteId, snapshot.secretError, onSiteReady, strings.secretFailedToast])

  useEffect(() => {
    if (snapshot.phase === 'done') {
      setScreen('done')
    }
  }, [snapshot.phase])

  const runningStep = snapshot.steps.find((step) => step.state === 'running')
  const stageLabels: Record<SetupRunStepId, string> = {
    clone: strings.stageClone,
    register: strings.stageRegister,
    serve: strings.stageServe,
    https: strings.stageHttps,
    import: strings.stageImport
  }
  const flowId = useMemo(
    () =>
      request.kind === 'link'
        ? `bind:${request.pending.requestId}`
        : request.kind === 'site'
          ? `site:${request.siteId}`
          : `new-site:${Date.now()}`,
    [request]
  )
  const { minimized, minimize } = useMinimizedSiteSetup(flowId, {
    label: label || 'site',
    stage:
      snapshot.phase === 'running'
        ? stageLabels[runningStep?.id ?? 'register']
        : snapshot.phase === 'done'
          ? strings.stageDone
          : snapshot.phase === 'failed'
            ? strings.stageFailed
            : strings.stageConfirm,
    phase:
      snapshot.phase === 'running' ? 'running' : snapshot.phase === 'failed' ? 'error' : 'waiting',
    percent: runningStep?.percent ?? null
  })

  const source = (): SiteSetupSource | null => {
    if (request.kind === 'repo') {
      return repo ? { kind: 'repo', repo, destinationRoot } : null
    }
    if (request.kind === 'site') {
      return { kind: 'site', siteId: request.siteId }
    }
    if (!linkTarget) {
      return null
    }
    return {
      kind: 'link',
      pending: request.pending,
      target:
        linkTarget.kind === 'existing'
          ? linkTarget
          : { kind: 'clone', root: linkTarget.root, cloneUrl: linkCloneUrl }
    }
  }

  // Minimised, not dismissed: the link's details stay in the status bar while the user connects
  // Bitbucket, and restoring it re-resolves the clone URL.
  const openIntegrations = (): void => {
    setSettingsSearchQuery('')
    openSettingsTarget({ pane: 'integrations', repoId: null })
    openSettingsPage()
    minimize()
  }

  const start = (): void => {
    const built = source()
    if (!built || !choices) {
      return
    }
    setScreen('running')
    if (snapshot.phase === 'failed') {
      void runner.retry(choices)
      return
    }
    void runner.start(built, choices)
  }

  const running = snapshot.phase === 'running'
  const started = snapshot.phase !== 'idle'
  const refuse = (event: { preventDefault: () => void }): void => {
    event.preventDefault()
  }
  const dismissOrFinish = (): void => {
    onClose(started ? 'finished' : 'dismissed')
  }

  const serveDomainError = useServeDomainCheck({
    source: source(),
    stack: choices?.serve.stack ?? null,
    domain: choices?.serve.domain ?? '',
    enabled: choices?.serve.enabled === true && !lockedSteps.includes('serve')
  })

  const canStart =
    choices !== null &&
    serveDomainError === '' &&
    (request.kind !== 'repo' || repo !== null) &&
    (request.kind !== 'link' ||
      (linkTarget !== null && (linkTarget.kind === 'existing' || linkCloneUrl.length > 0)))

  const title =
    screen === 'source'
      ? strings.sourceTitle
      : screen === 'review'
        ? strings.reviewTitle.replace('{{label}}', label)
        : screen === 'running'
          ? strings.runningTitle.replace('{{label}}', label)
          : snapshot.steps.some((step) => step.state === 'failed')
            ? strings.finishedWithProblemsTitle.replace('{{label}}', label)
            : strings.doneTitle.replace('{{label}}', label)
  const description =
    screen === 'source'
      ? strings.sourceDescription
      : screen === 'review'
        ? request.kind === 'repo'
          ? strings.reviewRepoDescription.replace('{{repo}}', repo?.fullName ?? '')
          : request.kind === 'link'
            ? strings.reviewLinkDescription
            : strings.reviewSiteDescription
        : null

  return (
    <Dialog
      open={!minimized}
      onOpenChange={(open) => {
        // Minimising also closes the dialog, so dismissing has to exclude it - otherwise sending a
        // run to the status bar would throw the whole flow away. A live run refuses to close.
        if (!open && !minimized && !running) {
          dismissOrFinish()
        }
      }}
    >
      <DialogContent
        className="max-w-xl"
        keepMounted
        showCloseButton={!running}
        onEscapeKeyDown={running ? refuse : undefined}
        // An outside click must never end a flow: it can hold a clone, and restoring from the
        // status-bar chip mounts this dialog mid-click, which Radix would read as an outside interaction.
        onPointerDownOutside={refuse}
        onInteractOutside={refuse}
      >
        <DialogHeader className="pr-16">
          <DialogTitle className="flex items-center gap-2">
            {request.kind === 'link' ? <Link2 className="size-4" /> : null}
            {title}
          </DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>

        {screen === 'source' ? (
          <SiteSetupSourceScreen
            destinationRoot={destinationRoot}
            onDestinationChange={setDestinationRoot}
            onPick={(picked) => {
              setRepo(picked)
              setScreen('review')
            }}
            onCancel={() => onClose('dismissed')}
          />
        ) : null}

        {screen === 'review' ? (
          <>
            <div className="scrollbar-sleek max-h-[55vh] overflow-y-auto pr-1">
              {choices ? (
                <SiteSetupReview
                  source={
                    source() ??
                    (request.kind === 'link'
                      ? {
                          kind: 'link',
                          pending: request.pending,
                          target: { kind: 'clone', root: destinationRoot, cloneUrl: linkCloneUrl }
                        }
                      : { kind: 'site', siteId: '' })
                  }
                  plan={plan}
                  availableStacks={availableStacks ?? []}
                  cert={cert}
                  choices={choices}
                  onChange={setChoices}
                  lockedSteps={lockedSteps}
                  promptStackChoice={promptStackChoice}
                  serveDomainError={serveDomainError}
                  sourceRows={
                    request.kind === 'link' ? (
                      <SiteSetupLinkTargetRows
                        pending={request.pending}
                        primaryRoot={destinationRoot}
                        cloneUrl={linkCloneUrl}
                        value={linkTarget}
                        onChange={setLinkTarget}
                        cloneProblem={linkCloneProblem}
                        onOpenIntegrations={openIntegrations}
                      />
                    ) : undefined
                  }
                />
              ) : (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />
                  {strings.loading}
                </p>
              )}
              {request.kind === 'link' && choices && !canStart ? (
                <p className="mt-2 text-xs text-muted-foreground">{strings.chooseTarget}</p>
              ) : null}
            </div>
            <DialogFooter>
              {request.kind === 'repo' && !started ? (
                <Button variant="ghost" onClick={() => setScreen('source')}>
                  {strings.back}
                </Button>
              ) : (
                <Button variant="ghost" onClick={dismissOrFinish}>
                  {strings.cancel}
                </Button>
              )}
              {/* A disabled button gets no pointer events, so the reason sits on its wrapper. */}
              <span title={serveDomainError || undefined}>
                <Button disabled={!canStart} onClick={start}>
                  {snapshot.phase === 'failed' ? strings.retry : strings.setUp}
                </Button>
              </span>
            </DialogFooter>
          </>
        ) : null}

        {screen === 'running' ? (
          <SiteSetupRun
            steps={snapshot.steps}
            phase={snapshot.phase === 'failed' ? 'failed' : 'running'}
            siteLabel={label}
            onCancelCurrent={runner.cancelCurrent}
            onRetry={() => {
              setLockedSteps(runner.completedSteps())
              setScreen('review')
            }}
            onFinishLater={() => onClose('finished')}
          />
        ) : null}

        {screen === 'done' ? (
          <SiteSetupDone
            steps={snapshot.steps}
            siteLabel={label}
            domain={snapshot.domain}
            createdLocalWp={snapshot.createdLocalWp}
            databaseReplaced={snapshot.databaseReplaced}
            onClose={() => onClose('finished')}
            onOpenSite={(url) => void window.api.shell.openUrl(url)}
            onAddEnvironment={
              request.kind === 'repo' && snapshot.siteId.length > 0
                ? () => setAddEnvironmentOpen(true)
                : null
            }
          />
        ) : null}
        {snapshot.siteId.length > 0 ? (
          <AddSiteEnvironmentDialog
            open={addEnvironmentOpen}
            onOpenChange={setAddEnvironmentOpen}
            siteId={snapshot.siteId}
            environmentNames={[]}
            defaultSource=""
            onCreated={() => setAddEnvironmentOpen(false)}
          />
        ) : null}

        {/* Last child on purpose: as the first tabbable element it took the dialog's initial focus,
            and a Radix tooltip opens on focus. Absolutely positioned, so DOM order costs no layout. */}
        <SiteSetupMinimizeButton onMinimize={minimize} />
      </DialogContent>
    </Dialog>
  )
}

export default SiteSetupDialog
