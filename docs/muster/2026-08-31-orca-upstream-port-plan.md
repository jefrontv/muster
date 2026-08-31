# Porting upstream Orca changes into Muster — fact-checked plan

2026-08-31. Candidates drawn from `stablyai/orca` commits landed 16–30 Aug 2026. Every claim below was
checked against real code in both trees; file:line references are to Muster's current `HEAD` unless
marked upstream.

## Method and what it revealed

- Fork point (`git merge-base HEAD upstream/main`): **`d8e0f112c`, 2026-07-25**.
- Since then: **473 Muster commits**, **2,321 upstream commits**, **2,857 files changed here**.
- In the 16–30 Aug window: **791 upstream commits, 26 authors**. Of those, **711 touch files that do
  not exist in Muster at all**.

Two consequences worth stating before any wiring.

**A two-week-old commit can depend on a five-week-old ancestor we never took.** File-level divergence
checks miss this. `e25878588` is the example: `runtime-terminal-inspection.ts` has *not* diverged from
the fork point, yet it differs from that commit's own parent, because upstream changed the file in
between and we never inherited it.

**`git apply --3way` succeeds on all twelve shortlisted commits, and that is a trap, not a green
light.** Two of them would actively damage us:

- `2f5f5ce23` "restore the light-mode dropdown shadow" fixes a malformed Tailwind class
  (`shadow-[...0.22)],inset...]` — stray bracket) that **does not exist here**. Muster's
  `dropdown-menu.tsx:35` already has a well-formed two-layer shadow with *stronger* values
  (`0_16px_36px_rgba(0,0,0,0.24)` vs upstream's `0_12px_28px_rgba(0,0,0,0.22)`). Applying it is a
  visual downgrade.
- `871601b6f` prunes upstream's `max-lines` baseline. Ours is a different file listing different
  entries. Applying it overwrites our baseline with theirs.

So mechanical application was necessary but not sufficient; each item below carries a semantic verdict.

---

## Tier 0 — the 208-child storm, fixed by not spawning at all

**Not an upstream port. A reuse of code we already have, found while fact-checking Tier 1.**

`readSiteBranch` (`src/main/sites/site-summary.ts:21-33`) spawns `git rev-parse --abbrev-ref HEAD`
per site to learn the checked-out branch. `buildSiteSummaries` (`:75-77`) runs all of them under one
unbounded `Promise.all`. That is the 208-child storm.

`probeRepoHeadBranches` (`src/main/sites/repo-head-branch-probe.ts:38-50`) already computes exactly
the same value by reading `.git/HEAD` off disk, and it is the better implementation on every axis:

- **Batch by design**: `(paths: readonly string[], options?) => Promise<Record<string, string>>` —
  the shape `buildSiteSummaries` needs.
- **Bounded**: sweeps through `sweepProjectPaths` at 16-way concurrency
  (`project-git-dir-probe.ts:22`) so a few hundred folders never hold a few hundred descriptors.
- **Handles the awkward cases already**: the `.git` directory form *and* the `gitdir:` pointer form
  used by worktrees and submodules (`project-git-dir-probe.ts:25,34-60`), plus LocalWP's
  `app/public` relocation via `localWpWordPressRoot`.
- **Matching semantics**: its `HEAD_BRANCH_PATTERN` (`repo-head-branch-probe.ts:21`) is anchored so a
  detached HEAD misses and the path is simply absent — the same `null` that `readSiteBranch:29`
  returns for `'HEAD'`.
- **Zero subprocesses.** Its sibling module states the rationale outright: *"spawning per folder
  would mean hundreds of processes for values that are one file read away."*

**Wiring:** in `buildSiteSummaries`, call `probeRepoHeadBranches(sites.map(resolveSiteCheckoutDir))`
once, then pass each branch into `buildSiteSummary` as a parameter instead of having it call
`readSiteBranch`. Keep `readSiteBranch` for any single-site caller that still wants the subprocess
truth, or delete it if the probe covers every caller.

**Effect: 208 git children → 0.** This is a bigger win than the scheduler on this path, and cheaper.

**Verification:** the existing `site-summary.test.ts` branch-detection suite (five cases, real git
repos on disk) must pass unchanged — it asserts branch reads for plain checkouts, LocalWP relocation,
missing recorded roots, non-checkouts and absent folders, which is exactly the behaviour being
swapped. Then count spawned children during a sidebar refresh.

**Caveat worth testing:** the probe reads `.git/HEAD` text, while `rev-parse` resolves through git's
own rules. For a normal branch checkout these agree. Confirm parity on a worktree and on a LocalWP
site before deleting `readSiteBranch`.

---

## Tier 1 — the one with a measured payoff

### `b5a85890a` perf(git): atomic admission scheduler for git subprocesses

**Verdict: guided reimplementation, not a port.**

Upstream's field numbers: unbounded concurrent git children caused freeze storms — 12+ at once,
50–65 second status convoys lasting 25 minutes. After: max concurrent children **65 → 6**,
interactive p95 **791ms → 88ms**, output byte-identical with admission on vs off.

**We have the same disease, worse.** `buildSiteSummaries` at `src/main/sites/site-summary.ts:75-77`
does `Promise.all(sites.map(buildSiteSummary))`, and each summary calls
`commandExecFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], …)` via `readSiteBranch`
(`site-summary.ts:20-31`). With 208 configured sites, **one sidebar refresh spawns up to 208
concurrent `git rev-parse` children**. Upstream's storms began at 65.

`src/main/git/runner.ts` is 1,629 lines and has **zero** concurrency control — verified across every
exported entry point: `gitExecFileAsync` (L835), `commandExecFileAsync` (L877),
`gitExecFileAsyncBuffer` (L920), `gitStreamStdout` (L960), `gitExecFileSync` (L1087), `gitSpawn`
(L1116), `ghExecFileAsync` (L1414), `glabExecFileAsync` (L1523), `wslAwareSpawn` (L1587). Each is one
call in, one child spawned immediately.

`GitCapabilityCache` is **not** a throttle and must not be mistaken for one — its own comment at
`src/shared/git-capability-cache.ts:44` says it deliberately lets "sibling repo/SSH calls retain their
intended concurrency". It is feature detection with in-flight dedup, an orthogonal concern.

**Why the upstream code cannot be lifted verbatim.** Neither `src/main/git/command-runner/` nor
`src/shared/child-process/` exists here, and every non-stdlib import in the five new modules is absent:

| Upstream import | Provides | Present in Muster |
|---|---|---|
| `../wsl-direct-git-read-commands` | `classifyGitCommand` (general vs network) | No |
| `../../providers/working-directory-validation` | `uncRouteKey` (per-route bucketing) | No |
| `./abort-error` | `createAbortError` | No |
| `./git-exec-options` | `GitAdmissionTier` type | No |
| `./windows-command-line`, `./process-tree-termination`, `./bounded-output-sink`, `./child-termination-reporter` | needed by `run-process.ts` | No |

**What is portable is the design**, and it is small:

```
acquireGitAdmission(request): Promise<{ queueWaitMs, release: () => void }>
  request = { args, cwd, wslDistro?, tier?: 'interactive' | 'status' | 'background', signal? }
```

- Budgets keyed by class (`general` | `network`) plus optional `route:<class>:<key>`.
- Caps: `GENERAL_CAP = max(2, min(4, availableParallelism() - 4))`, `NETWORK_CAP = 3`,
  headroom `2` / `1`, `ROUTE_CAP = 2` + `1`, giving `MAX_GIT_CHILDREN = 10`.
- Headroom slots are reserved **exclusively** for `interactive`; aging (15s buckets) reorders
  selection only and never unlocks headroom for lower tiers.
- `release()` is idempotent via a closure flag; releasing re-drains the queue.
- Killswitch checked first: `ORCA_GIT_ADMISSION_DISABLED=1` returns a no-op grant and never touches
  the scheduler.
- Telemetry is an optional callback wrapped in try/catch — no backend is hard-wired.

**Wiring:**

1. New `src/main/git/admission/` module implementing the above (state, waiter queue, candidate heap,
   acquire/release). Skip upstream's `run-process.ts` refactor entirely — it is orthogonal plumbing.
2. Shim the four missing helpers locally: `classifyGitCommand` can start as a small allowlist of
   network verbs (`fetch`, `pull`, `push`, `clone`, `ls-remote`); `uncRouteKey` can start as the
   resolved cwd root; `createAbortError` is three lines; the tier type is ours to define.
3. Acquire inside `runner.ts` around the four async spawn paths: `gitExecFileAsync`,
   `commandExecFileAsync`, `gitExecFileAsyncBuffer`, `gitSpawn`. Release on child close. Leave
   `gitExecFileSync` alone — it is synchronous and rare.
4. Default tier `status`; tag the sidebar sweep `background` and anything user-initiated
   `interactive` so a click never queues behind 208 rev-parses.
5. Fix the one genuine bypass: `src/main/chat-mode/chat-greeting-name.ts:19` calls Node's `execFile`
   on git directly. Low blast radius (one memoised global-config read) but it should route through
   the runner.
6. Align with the existing precedent: `src/main/sites/project-git-dir-probe.ts` already runs its own
   16-way limited sweep and spawns **no** git at all (it reads `.git` pointer files off disk). Do not
   double-limit it; it is evidence the codebase already wanted this.

**Verification:** with Tier 0 already landed the sidebar is no longer the load generator, so measure
what remains: concurrent children during a multi-worktree operation, and p95 of a user-initiated git
action while a `gh` sync runs. Upstream's output-parity idea is worth copying — assert identical
stdout for a battery of commands with admission on vs off.

**Risk:** deadlock if a permit is held across another acquire. Mitigate by acquiring at exactly one
layer (the runner) and never inside a helper that the runner itself calls.

---

## Tier 2 — clean ports, verified semantically

| Commit | Target | Change |
|---|---|---|
| `cb8e08834` | `src/renderer/src/lib/text-control-paste-ownership.ts:27-38` | `findOwnedTextControlPasteTarget` lacks the `.xterm-helper-textarea` guard that its own sibling `findOwnedPasteEventTextControlTarget` already has at `:50`. Byte-identical to upstream's parent. Sole caller `src/renderer/src/lib/app-menu-paste.ts:44`. |
| `5e3c4f391` | `src/renderer/src/components/terminal-pane/terminal-startup-grid-settle.ts` | `waitForStableStartupGrid` waits unboundedly on `isReadyToSettle`; the fix bounds it. Byte-identical to upstream's parent. Caller `pty-connection.ts:4186-4189`. |
| `e2cb79750` | `src/renderer/src/lib/agent-hibernation-planner.ts` | **Highest value of the small set.** A one-line bug: the skip guard tests `worktreeId === snapshot.activeWorktreeId`, so idle agents in the worktree you are actually working in get parked. Both replacement guards (`foregroundTerminalTabIds`, `foregroundTerminalLastSeenAtByTabId`) already exist and work. The commit also fixes a *vacuous* regression test — port that too. |
| `df7460af4` | `src/renderer/src/components/ui/dialog.tsx` | Two Tailwind edits, no JS: add `grid-cols-[minmax(0,1fr)]` to the `DialogContent` grid, and change `DialogTitle` (`:129`) from `text-lg leading-none font-semibold` to `text-lg leading-snug font-semibold break-words`. Without it a long unbreakable title (a file path) pushes the justify-end footer buttons off the panel. |
| `a3edabcd7` | `config/electron-builder.config.cjs` | One negation pattern: `'!out/electron-dev{,/**/*}'`. **Measured here: `out/electron-dev` is 275MB of 402MB total `out/`.** Created by `config/scripts/run-electron-vite-dev.mjs:216`; our config has no exclusion, so any *local* `dist:*` build packs it into app.asar. CI never creates the directory, so published releases were never affected — this is a local-build fix. Note our config diverged heavily (98+/113− vs fork), so hand-apply the one line rather than the patch; port the accompanying `FileMatcher` test from `config/scripts/electron-builder-config.test.mjs`. |

---

## Tier 3 — port the core, drop the rest

| Commit | Take | Leave |
|---|---|---|
| `79aea8117` | Replace the O(n) `Object.keys` scan in `hasUnreadAgentCompletionForTerminalTab` (`src/renderer/src/components/tab-bar/terminal-tab-activity-status.ts:153-166`) with the WeakMap-cached `Set<tabId>` index. | Upstream's `!unread` skip-on-false guard. Our map is typed `Record<string, true>`, theirs `Record<string, boolean \| undefined>` — ours is already narrower, so the guard is dead code here. The surrounding file has diverged (174 lines vs upstream's 284; we lack `monitoring`/`interrupted` states) but not this function. |
| `be68aa271` | The actual leak: hoist `const originBarWebContents = originBarView.webContents`, use it at both the `did-finish-load` and `loadURL` sites, and close it inside the existing `window.once('closed', …)` handler after the `contentWebContents.close()` branch (`src/main/browser/popup-origin-bar-window.ts`). Today every popup leaks one destroyed-but-unclosed `WebContentsView`'s contents — renderer process plus GPU surface — for the app's lifetime. | The `closeUnpreparedPopup` half. That function and `openPopupWithOriginBar`'s `prepareContent` third parameter **do not exist here** — a 37-line upstream-only block landed after our fork. Not applicable. |
| `e25878588` | The index replacing the O(tabs × leaves) scan in `recordRuntimeTerminalInputForPtyId` (`src/renderer/src/runtime/runtime-terminal-inspection.ts:49-64`), hit on every accepted terminal input. Required imports `makePaneKey` / `PaneKey` from `src/shared/stable-pane-id.ts` (`:22`, `:12`) are present and correctly typed. | Anything touching `confirmRuntimeTerminalForegroundProcess` — upstream has it, we never inherited it. Review after merge rather than trusting the 3-way result. |

---

## Dropped, with reasons

- **`2f5f5ce23` dropdown shadow** — the malformed-class bug does not exist here and our values are
  stronger. Applying it is a downgrade. Verified at `dropdown-menu.tsx:35`.
- **`e7b047f53` codex false restart notices** — our `codex-session-restart.ts` predates the
  multi-account / lane-scoping machinery the bug lives in. Nothing to fix.
- **Ten README download-badge bumps, three Korean i18n commits, five Android download-link commits
  and their reverts, mobile `app.json` bumps, one Spanish locale string** — noise.
- **WSL/Windows cluster** (`92315c417`, `c3a1694b1`, `04e7f5c80`, `4a57cfac9`) — real fixes, no
  bearing on macOS use. Revisit only if Windows becomes a shipping target.

## Blocked on a prerequisite

- **`7e7f241ec` React correctness lints** — **not clean, deferred.** We pin `oxlint@1.71.0`; upstream
  moved to `^1.80.0`, and the six rules the commit enables do not exist in 1.71.0, so the config
  change cannot fire at all. Measured what the upgrade alone would cost: running `oxlint@1.80.0`
  against `src` with **our current config, unchanged**, produces **985 new errors**:

  | Rule | Count |
  |---|---|
  | `react(refs)` | 546 |
  | `react(set-state-in-effect)` | 229 |
  | `react(preserve-manual-memoization)` | 97 |
  | `react(globals)` | 50 |
  | `react(purity)` | 31 |
  | `react(immutability)` | 13 |
  | `react(static-components)` | 10 |
  | `react(incompatible-library)` | 9 |

  These are mostly real correctness classes, not style — `react(refs)` is ref access during render,
  `set-state-in-effect` is the classic render-loop shape. So there is genuine value here, but 985
  findings is a project with its own scope and risk, not a chore to attach to a port. Taking it now
  would mean either weeks of fixes or a large suppression list, and a bulk suppression list is
  exactly what this repo's ratchet culture exists to prevent. **Recommendation: defer, and treat
  "upgrade oxlint and burn down the React findings" as a separate initiative.**
- **`871601b6f` prune max-lines suppressions** — the mechanism is already live here:
  `config/scripts/check-max-lines-ratchet.mjs` has a `--prune` flag wired through
  `pnpm check:max-lines-ratchet`. It is blocked on the files themselves: `src/relay/workspace-space-scan.ts`
  is 375 lines (over the 300 default) and `mobile/src/components/NewWorktreeModal.tsx` is 1,313, both
  byte-identical to the fork point. We never received upstream's splits, so pruning today fails the
  ratchet. Technique to re-apply after splitting, not a diff to take.

## Suggested order

1. **Tier 0** — reuse `probeRepoHeadBranches` in `buildSiteSummaries`. Biggest win, no new code,
   208 git children → 0.
2. `a3edabcd7` — one line, 275MB out of local builds.
3. `e2cb79750`, `cb8e08834`, `5e3c4f391`, `df7460af4` — four small clean fixes, one commit.
4. `79aea8117`, `be68aa271`, `e25878588` — core-only ports, one commit, each needing the noted trim.
5. `b5a85890a` — the scheduler, on its own, as the safety net for what Tier 0 does not cover.

## Decisions

Three questions were raised for review and answered "your recommendation". Here they are, with the
reasoning.

1. **Scheduler caps: keep upstream's, add no special background budget.** Once Tier 0 lands, the
   sidebar stops being a git consumer entirely, so the premise of a larger background budget
   disappears. Beyond that, granting the dominant consumer a bigger allowance defeats the purpose of
   a total bound. Tag the remaining sweeps `background`, leave `GENERAL_CAP`/`NETWORK_CAP` at
   upstream's values, and keep headroom reserved for `interactive` so a click never queues behind
   bulk work. On an M3, `availableParallelism() - 4` gives `GENERAL_CAP = 4`, which is sane. Revisit
   only if a measurement says otherwise.

2. **Sidebar sweep: fix it properly, and do it first.** Bounding 208 subprocesses is treating the
   symptom; the values are one file read away and we already have the reader. Tier 0 above replaces
   `readSiteBranch` with the existing, tested `probeRepoHeadBranches`. That is 208 children → 0,
   reusing code rather than adding any. The scheduler is still worth building afterwards as the
   safety net for worktree operations, `gh` calls and any future caller — but it is no longer the
   fix for this particular storm.

3. **oxlint upgrade: no, not now.** The condition was "if it can be done cleanly". It cannot — 985
   new errors, measured. See the entry under *Blocked on a prerequisite* for the breakdown. Worth
   doing as its own initiative; not worth smuggling into this work.
