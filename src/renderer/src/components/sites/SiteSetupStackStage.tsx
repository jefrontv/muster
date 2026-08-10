// The LocalWP stage of the guided setup: work out which of ocsites' two setups this folder needs,
// collect the wp-admin account, then run it with its progress on screen.
//
// Split out of SiteSetupContinuation because this stage is the only one that streams. ocsites ran
// the same work on a worker thread behind a live log with explicit running/error/done states
// (tui_deploy:2591-2668); a multi-minute operation that can block on an OS password prompt is
// unusable behind a single static line.
//
// The mode comes from a preview on mount rather than from the setup plan: the migration planner is
// the authority that the run itself re-consults, and the same call reports what will be moved and
// deleted. A folder with no WordPress yet is a `create` (ocsites setup_localwp_before_clone) — it
// used to dead-end here on the migrate path's wp-config.php gate.
//
// Both `previewMigration` and `runMigration` answer with a tagged IPC envelope wrapping a result
// that has its OWN `ok`. Reading only the envelope reports a blocked or failed migration as a
// success — that is what produced a checkmark for a migration that never ran.

import { Check, HardDrive, Loader2, TriangleAlert } from 'lucide-react'
import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import type { LocalWpSetupMode } from '../../../../shared/site-stack-types'
import type { SiteLocalStack } from '../../../../shared/site-types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { readLastLocalStackChoice, rememberLocalStackChoice } from './last-local-stack-choice'
import { getSiteSetupStrings } from './site-setup-strings'

/** Enough to hold a whole migration's chatter; the head is dropped so a runaway log cannot grow. */
const MAX_LOG_LINES = 200
/** Module scope so the default prop keeps referential equality across renders. */
const NO_STACKS: SiteLocalStack[] = []
/** Local requires a wp-admin account to build the install; it is local-only and never asked for. */
const LOCALWP_ADMIN_EMAIL = 'hello@efront.com.au'
const LOCALWP_ADMIN_PASSWORD = 'admin'

type StackPhase = 'idle' | 'running' | 'done' | 'failed'

/** What the preview told us about this folder; null until the first preview answers. */
type StackPreview = {
  mode: LocalWpSetupMode
  blockedReason: string
  moveCount: number
  deleteCount: number
}

export function SiteSetupStackStage({
  siteId,
  suggestedDomain,
  detectedStack = null,
  preferredStack = null,
  unavailableStacks = NO_STACKS,
  onMigrated,
  onChoicePendingChange,
  onBusyChange
}: {
  siteId: string
  suggestedDomain: string
  /** The stack already serving this folder, when the planner found one; it wins over the default. */
  detectedStack?: SiteLocalStack | null
  /** Where the folder should move to, when something already manages it. Outranks `detectedStack`. */
  preferredStack?: SiteLocalStack | null
  /** Stacks that cannot run this folder as it stands; shown, but not selectable. */
  unavailableStacks?: SiteLocalStack[]
  /** Fired once the migration really succeeded — the local domain only exists from that point. */
  onMigrated: (domain: string, stack: SiteLocalStack) => void
  /**
   * True while a stack could be picked but none is. Normally false — the group opens on a default —
   * but it stays the pager's guard against advancing into an import with nothing to run it.
   */
  onChoicePendingChange?: (pending: boolean) => void
  /** Locks the pager's nav: this setup moves files and can be waiting on an OS password prompt. */
  onBusyChange?: (busy: boolean) => void
}): React.JSX.Element {
  const strings = getSiteSetupStrings()
  const [domain, setDomain] = useState(suggestedDomain)
  // Which stacks this machine can run, and which one the user picked. Until the probe answers the
  // picker is not rendered at all: a control that appears and then loses an option reads as a bug.
  const [availableStacks, setAvailableStacks] = useState<SiteLocalStack[] | null>(null)
  // Null until something actually decides. Seeding this with 'localwp' meant a machine running both
  // stacks silently pre-picked one, and the user could set the site up on it without ever noticing
  // there was a choice.
  const [stack, setStack] = useState<SiteLocalStack | null>(null)
  // ocsites used one house account for both of its setups (tui_deploy:2792, :3035) and Local only
  // ever sees it locally, so these are fixed rather than asked for.
  const adminEmail = LOCALWP_ADMIN_EMAIL
  const adminPassword = LOCALWP_ADMIN_PASSWORD
  const [preview, setPreview] = useState<StackPreview | null>(null)
  const [phase, setPhase] = useState<StackPhase>('idle')
  const [lines, setLines] = useState<string[]>([])
  const [failure, setFailure] = useState('')
  const logRef = useRef<HTMLDivElement | null>(null)
  /** True once a setup has completed, freezing the picker on the stack that actually ran. */
  const settledRef = useRef(false)

  useEffect(() => {
    return window.api.siteStacks.onMigrationProgress((event) => {
      if (event.siteId !== siteId) {
        return
      }
      setLines((previous) => [...previous, event.message].slice(-MAX_LOG_LINES))
    })
  }, [siteId])

  // Newest line first matters more than scroll position: the log is what says the setup is alive.
  useEffect(() => {
    const element = logRef.current
    if (element) {
      element.scrollTop = element.scrollHeight
    }
  }, [lines])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const answer = await window.api.siteStacks.available()
      if (cancelled || !answer.ok) {
        return
      }
      setAvailableStacks(answer.value)
      // Once a setup has actually run, the choice is history, not a proposal. Re-deriving it here
      // flipped the picker to the other stack the moment the parent replanned — the run succeeded
      // on Agent Local, detection then said "already managed", and the stage started describing
      // LocalWP instead.
      if (settledRef.current) {
        return
      }
      // Where the folder should END UP wins first: when something already manages it, the useful
      // proposal is the stack it can move to, not the one that already has it. Otherwise what is
      // already serving it wins, since proposing a LocalWP migration for a site agent-local runs
      // would offer to move files that do not need moving. Failing both, default to LocalWP —
      // what existing sites use — and fall back to whatever is installed rather than offering a
      // stack that cannot run.
      if (preferredStack && answer.value.includes(preferredStack)) {
        setStack(preferredStack)
        return
      }
      if (detectedStack && answer.value.includes(detectedStack)) {
        setStack(detectedStack)
        return
      }
      // Whatever the last site was actually set up with, so a user who works on one stack is not
      // re-picking it every time. Falling back to the first installed one keeps the group from
      // opening with nothing selected, which reads as a broken control.
      const remembered = readLastLocalStackChoice()
      setStack(
        (remembered && answer.value.includes(remembered) ? remembered : answer.value[0]) ?? null
      )
    })()
    return () => {
      cancelled = true
    }
  }, [detectedStack, preferredStack])

  // Zero installed stacks is not a pending choice, it is a machine with nothing to offer — blocking
  // the pager there would trap the user on a page with no control to satisfy it.
  useEffect(() => {
    onChoicePendingChange?.(availableStacks !== null && availableStacks.length > 0 && stack === null)
  }, [stack, availableStacks, onChoicePendingChange])

  useEffect(() => {
    onBusyChange?.(phase === 'running')
  }, [phase, onBusyChange])

  // Read-only: this is the same planner the run re-consults, so asking it now costs one call and
  // buys the honest heading, the honest button, and the list of what is about to move or be deleted.
  useEffect(() => {
    if (!stack) {
      // Nothing to preview yet: the planner's answer depends on which stack is being proposed.
      setPreview(null)
      return
    }
    let cancelled = false
    void (async () => {
      const answer = await window.api.siteStacks.previewMigration({
        siteId,
        domain: suggestedDomain,
        adminEmail: LOCALWP_ADMIN_EMAIL,
        adminPassword: LOCALWP_ADMIN_PASSWORD,
        stack
      })
      if (cancelled || !answer.ok) {
        return
      }
      setPreview({
        mode: answer.value.mode,
        blockedReason: answer.value.blockedReason,
        moveCount: answer.value.moves.length,
        deleteCount: answer.value.appPublicEntries.length
      })
    })()
    return () => {
      cancelled = true
    }
  }, [siteId, suggestedDomain, stack])

  const run = async (): Promise<void> => {
    if (!stack) {
      return
    }
    setPhase('running')
    setLines([])
    setFailure('')
    const credentials = {
      siteId,
      domain,
      adminEmail: adminEmail.trim(),
      adminPassword: adminPassword.trim(),
      stack
    }
    const fail = (reason: string): void => {
      setFailure(reason)
      setPhase('failed')
    }
    try {
      // Preview again right before mutating: it is the call that reports a conflicting site, an
      // unusable domain, or a non-empty app/public, so it turns a mid-run failure into a message.
      const planned = await window.api.siteStacks.previewMigration(credentials)
      if (!planned.ok) {
        fail(planned.error)
        return
      }
      if (!planned.value.ok) {
        fail(planned.value.blockedReason)
        return
      }
      const migrated = await window.api.siteStacks.runMigration(credentials)
      if (!migrated.ok) {
        fail(migrated.error)
        return
      }
      if (!migrated.value.ok) {
        fail(migrated.value.message)
        return
      }
      // runMigration streams ocsites' own terminal line in create mode, so only add the localized
      // marker when the log does not already end on it. Named per stack: this line was reporting
      // "LocalWP site ready" after an Agent Local run.
      const doneLine = stack === 'agent-local' ? strings.stackAgentLocalDone : strings.stackDone
      setLines((previous) =>
        previous.at(-1) === doneLine ? previous : [...previous, doneLine].slice(-MAX_LOG_LINES)
      )
      settledRef.current = true
      // A carried-through decision, so it becomes the default the next setup opens on.
      rememberLocalStackChoice(stack)
      setPhase('done')
      onMigrated(domain, stack)
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error))
    }
  }

  const busy = phase === 'running'
  const creating = preview?.mode === 'create'
  const onAgentLocal = stack === 'agent-local'
  /** Why the chosen stack cannot run this folder, straight from the planner. */
  const blocked = preview?.blockedReason ?? ''
  // Only a real choice is worth a control: one installed stack means there is nothing to pick.
  const stackChoices = (availableStacks ?? []).length > 1 ? (availableStacks ?? []) : []
  const awaitingChoice = stack === null
  // Four combinations, because "no WordPress yet" changes what each stack is about to do: LocalWP
  // builds an install, agent-local attaches the folder to an empty database.
  const body = awaitingChoice
    ? strings.stackPickFirst
    : onAgentLocal
      ? creating
        ? strings.stackAgentLocalCreateBody
        : strings.stackAgentLocalBody
      : creating
        ? strings.stackCreateBody
        : strings.stackBody
  const action = onAgentLocal
    ? creating
      ? strings.stackAgentLocalCreateAction
      : strings.stackAgentLocalAction
    : creating
      ? strings.stackCreateAction
      : strings.stackAction
  return (
    <div className="space-y-2 rounded-md border border-border px-3 py-2.5">
      <div className="flex items-start gap-2.5">
        <HardDrive className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-sm font-medium">{strings.stackHeading}</p>
          <p className="text-xs text-muted-foreground">{body}</p>
        </div>
        {phase === 'done' ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Check className="size-3.5" />
            {onAgentLocal ? strings.stackAgentLocalDone : strings.stackDone}
          </span>
        ) : null}
      </div>

      {phase === 'idle' || phase === 'failed' ? (
        <div className="space-y-1.5 pl-6.5">
          {/* Same control as the site's own stack picker (SiteLocalStackControl) so the two read
              as one design — a user meets them at adjacent moments in the same flow. */}
          {stackChoices.length > 0 ? (
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              aria-label={strings.stackPickerLabel}
              value={stack ?? ''}
              disabled={busy}
              onValueChange={(next) => {
                if (next) {
                  setStack(next as SiteLocalStack)
                }
              }}
            >
              {stackChoices.map((choice) => (
                <ToggleGroupItem
                  key={choice}
                  value={choice}
                  // Shown rather than hidden: the user needs to see that Agent Local exists and
                  // learn why it cannot take this folder yet, not wonder where it went.
                  disabled={unavailableStacks.includes(choice)}
                  className="px-2.5 text-xs"
                >
                  {choice === 'agent-local' ? 'Agent Local' : 'LocalWP'}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          ) : null}
          {/* Local needs a wp-admin account to create the install, but it is a throwaway for a
              site whose real content arrives with the import — so the defaults are submitted
              silently (as ocsites does) and only the domain is worth asking about. agent-local
              adopts an install that already has its own users and ignores them entirely. */}
          <div className="flex items-center gap-1.5">
            <label className="sr-only" htmlFor="setup-local-domain">
              {strings.stackDomainLabel}
            </label>
            <Input
              id="setup-local-domain"
              className="h-8 font-mono text-xs"
              placeholder={strings.stackDomainLabel}
              value={domain}
              onChange={(event) => setDomain(event.target.value)}
            />
            <Button
              size="sm"
              variant="outline"
              className="shrink-0"
              // A blocked preview is the planner saying this cannot work. Pressing the button then
              // only reprints the same sentence as a failure, which is how the dialog ended up
              // showing one error twice.
              // No stack picked means there is nothing to run this with — the button would have to
              // guess, which is the thing the picker exists to stop.
              disabled={domain.trim().length === 0 || blocked.length > 0 || awaitingChoice}
              onClick={() => void run()}
            >
              {phase === 'failed' ? strings.stackRetry : action}
            </Button>
          </div>
          {/* Both setups delete and move real files, so the counts are shown before the button is
              pressed rather than discovered in the log afterwards. */}
          {preview && preview.blockedReason.length === 0 ? (
            <p className="text-[11px] text-muted-foreground/70">
              {onAgentLocal
                ? strings.stackAgentLocalServesInPlace
                : strings.stackMoves.replace('{{count}}', String(preview.moveCount))}
              {!onAgentLocal && preview.deleteCount > 0
                ? ` · ${strings.stackDeletes.replace('{{count}}', String(preview.deleteCount))}`
                : ''}
            </p>
          ) : null}
          {preview && preview.blockedReason.length > 0 ? (
            <p className="text-[11px] text-destructive">{preview.blockedReason}</p>
          ) : null}
        </div>
      ) : null}

      {busy ? (
        <p className="flex items-center gap-1.5 pl-6.5 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 shrink-0 animate-spin" />
          {strings.stackRunning}
        </p>
      ) : null}

      {/* ocsites printed this the moment the wait began. Local's prompt opens behind the app, so
          without it the setup reads as frozen — the single most common "nothing happened". */}
      {busy ? (
        <p className="pl-6.5 text-[11px] text-muted-foreground/70">
          {onAgentLocal ? strings.stackAgentLocalSudoHint : strings.stackOsPasswordHint}
        </p>
      ) : null}

      {lines.length > 0 ? (
        <div
          ref={logRef}
          role="log"
          aria-label={strings.stackLogLabel}
          aria-live="polite"
          className="scrollbar-sleek ml-6.5 max-h-40 overflow-y-auto rounded border border-border/60 bg-muted/40 p-2"
        >
          {lines.map((line, index) => (
            <p
              // Status lines repeat verbatim while polling, so the index is the only stable key.
              key={`${index}-${line}`}
              className="whitespace-pre-wrap break-words font-mono text-[11px] text-muted-foreground"
            >
              {line}
            </p>
          ))}
        </div>
      ) : null}

      {/* Suppressed when the preview is already saying the same thing above: a run that failed for
          the reason the planner had already printed does not need to print it a second time. */}
      {phase === 'failed' && failure !== blocked ? (
        <div className="ml-6.5 space-y-0.5">
          <p className="flex items-center gap-1.5 text-xs font-medium text-destructive">
            <TriangleAlert className="size-3.5 shrink-0" />
            {onAgentLocal ? strings.stackAgentLocalFailed : strings.stackFailed}
          </p>
          <p className="text-xs text-destructive">{failure}</p>
        </div>
      ) : null}
    </div>
  )
}

export default SiteSetupStackStage
