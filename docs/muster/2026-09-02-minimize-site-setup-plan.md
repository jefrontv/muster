# Minimize site setup and clone flows

2026-09-02. Let a running site setup, clone, or import be pushed to the status bar so the user can keep working, and bring it back from a chip that shows whether it is busy or waiting on them.

Every file reference below was read against the current tree.

## The problem, precisely

Both setup entry points open a Radix `Dialog`. `src/renderer/src/components/ui/dialog.tsx` never overrides `modal`, so Radix's default `modal={true}` applies: full-screen overlay, focus trap, the rest of the app inert. On top of that, both dialogs refuse to close while work is in flight — `SiteBindDialog.tsx:296-303` only calls `finish()` when `!setupBusy`, and `AddSiteFromGitDialog`'s `guardDismiss` blocks Escape and outside-click while cloning. A 20-minute import therefore locks the user out of Muster for 20 minutes.

The good news: **the work itself does not depend on the dialog.** `src/main/git/repos.ts:685-696` pushes clone progress with `webContents.send` whether or not anyone listens, and a site run keeps going once `siteRuns:start` returns. What breaks on unmount is only the renderer's view:

- `SiteCloneStep.tsx:22-33` subscribes `onCloneProgress`/`onCloneLog` on mount and unsubscribes on unmount.
- `SiteSetupImportStage.tsx:73-105` subscribes `siteRuns.onEvent` the same way.
- All flow state is component-local `useState` (`SiteBindDialog.tsx:83-98`, `AddSiteFromGitDialog.tsx:75-100`, `SiteSetupContinuation.tsx:64-101`).

So this is a UI-lifetime problem, not a job-durability problem. That shapes everything below.

## Approach: keep it mounted, hide it

The alternative — lift every piece of flow state into a store so the dialog can be destroyed and rebuilt — is a large rewrite of three components and their subscriptions, and it buys nothing here because the user is coming straight back to the same flow.

Instead the dialog subtree stays mounted while minimized. Radix supports this: `forceMount` on `DialogPortal` keeps children mounted while `open={false}`, and Radix only installs the overlay, focus trap, and outside-content `aria-hidden` while open. Closed plus force-mounted is inert — no trap, no overlay, app fully usable — and every `useState`, timer, and IPC subscription in the subtree survives untouched.

What the store holds is therefore small: enough for the chip to render, and nothing the dialog already owns.

```ts
type SiteSetupFlowPhase = 'running' | 'waiting' | 'error'

type MinimizedSiteSetupFlow = {
  id: string
  /** What the user is waiting on, e.g. "Cloning acme" or "Importing tradeflex". */
  label: string
  /** Names the current stage, because a bare spinner says nothing at minute nine. */
  stage: string
  phase: SiteSetupFlowPhase
  /** 0-100 while a clone or import reports it; null when the stage has no measure. */
  percent: number | null
}
```

The dialogs already distinguish busy from waiting-on-user, so `phase` is derived from state that exists rather than newly invented:

| Source | Value | Phase |
| --- | --- | --- |
| `repos:clone-progress` active | cloning | `running` |
| `SiteRunStatus` (`site-run-types.ts:8`) | `running` | `running` |
| `ImportPhase` (`SiteSetupImportStage.tsx:35`) | `starting`, `running` | `running` |
| `SiteSetupStageState` (`site-setup-flow-types.ts`) | `active`, `pending` | `waiting` |
| `SiteRunStatus` | `failed`, `blocked` | `error` |
| `SiteRunStatus` | `succeeded`, `cancelled` | `waiting` (next step available) |

## Changes

### 1. Store slice

Add to `src/renderer/src/store/slices/ui.ts`, beside the existing `updateCardCollapsed` pair (lines 901-904, 2534-2535):

- `minimizedSiteSetupFlows: Record<string, MinimizedSiteSetupFlow>`
- `minimizeSiteSetupFlow(flow)` / `updateSiteSetupFlow(id, patch)` / `restoreSiteSetupFlow(id)` / `clearSiteSetupFlow(id)`

A record rather than a single slot: a `muster://` link can arrive while a New Site clone is already minimized, and a single slot would silently overwrite the first flow's chip. Two chips is the honest rendering of two flows.

### 2. `AddSiteFromGitDialog` moves to the App root

This one is load-bearing. The dialog is currently rendered by `SitesPage.tsx:270-276`, so navigating away from the Sites page unmounts it — which is exactly what the user does after minimizing. Keeping state alive requires the dialog to outlive the page.

It moves next to `SiteBindDialog` in `App.tsx:2704` ("App-wide, not inside a view"), with its `open` state moving from `SitesPage`'s local `cloneDialogOpen` to the store so the page's button can still open it.

`SiteBindDialog` is already mounted at the App root and needs no move.

### 3. Minimize control on both dialogs

A `Minus` icon button in the header of `SiteBindDialog` and `AddSiteFromGitDialog`, matching `UpdateCard.tsx:13`'s collapse affordance.

Critically, **minimize must not abort.** `AddSiteFromGitDialog`'s close X calls `window.api.repos.cloneAbort()` (the one deliberate exit). Minimize is the opposite intent and must leave the clone running. The existing X keeps its abort behaviour; these are two different buttons with two different meanings.

While minimized the dialog reports into the store on each change it already tracks, so the chip follows the flow without a second source of truth.

### 4. Status-bar chip

New `src/renderer/src/components/status-bar/SiteSetupStatusSegment.tsx`, dropped into the right-hand group of `StatusBar.tsx:2354` beside `UpdateStatusSegment`.

Following `UpdateStatusSegment.tsx:7-8`'s reasoning, it is **not** behind a user status-bar toggle: it is the only route back to a minimized flow, and a hidden chip would strand the work.

- `running` → `<Loader2 className="size-4 animate-spin motion-reduce:animate-none" />` plus the stage label and percent when known. Per STYLEGUIDE.md, 3s+ multi-step work gets a stage label rather than a bare spinner, and the numeric label uses `tabular-nums` with reserved width so the chip does not resize as digits change.
- `waiting` → amber pulsing dot. Amber is this file's own "needs attention" convention (`StatusBar.tsx:2379`).
- `error` → `AlertCircle` with `text-yellow-500`, matching its immediate sibling `UpdateStatusSegment.tsx:62` rather than introducing red into the status bar.
- Click restores the dialog. Icon-only or abbreviated rendering gets a `Tooltip`, per the styleguide rule for compact chips.

### 5. Attention pulse animation

`main.css:2294-2312` has `native-chat-status-pulse`, but it means "agent still working" and is used for exactly that in `NativeChatWorkingRow.tsx`. Reusing it for "waiting on you" would overload one class with two meanings.

Add a sibling `attention-pulse` keyframe with the same motion character and a `prefers-reduced-motion` fallback, matching `main.css:2314-2318`. The repo asserts `motion-reduce:animate-none` in tests (`AgentStateDot.test.ts:31-33`), so this is a convention, not an aspiration.

## Deliberate deviation: no auto-restore

`ui.ts:2509` force-reopens the update card on every phase transition, so a collapsed "downloading" cannot bury "downloaded". I am **not** copying that here.

The user minimized this flow specifically to stop it interrupting them. Throwing a modal back over their work the moment a clone finishes recreates the lockout the feature exists to remove. The pulsing chip is the signal; restoring stays their decision.

## Verification

- Start a clone, minimize it, navigate to another page, confirm the chip shows a spinner and advancing percent, and that the clone completes.
- Confirm the app is genuinely interactive while minimized: no overlay, no focus trap, keyboard reaches other views.
- Let the clone reach a waiting-on-user stage and confirm the chip switches to the amber pulse.
- Restore and confirm the flow resumes on the same stage with its log intact, not reset to step one.
- Confirm minimize does not abort, and that the X still does.
- Two concurrent flows produce two chips, each restoring its own.

## Not doing

Persisting a minimized flow across an app restart (the renderer state is gone; resuming would need the plan rebuilt from main), cancel-from-chip, and a general job-tray abstraction for unrelated background work.
