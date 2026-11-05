# Muster performance plan (measure + plan round)

Date: 2026-11-05. Base commit: `3856bdd4bc`. No product code changed in this round.

## TL;DR

Three problems account for most of the slowness users feel:

1. **Every launch starts about 2,350 git processes in the first 60 seconds.** About 1,900 of them come from background git-username probing, which runs about 9 git commands per repo, one repo after another. About 410 are `git worktree list`, which runs twice per repo. On top of that, one sweep spawns about 190 git processes at the same instant. The sidebar's per-repo worktree data lands 12 to 30 s after launch (p95). The same 215-repo sweep takes 0.7 s when nothing else competes with it.
2. **`store.getRepos()` costs 23 ms of main-thread time per call** because every call re-decodes and re-validates 82 inline base64 repo icons. 82 call sites use it. They include every `git:status` request (26 ms each before git even starts) and a folder poller that runs every 2 s.
3. **Repo icons are 2.2 MB of the 3.2 MB `orca-data.json`.** Each icon is stored twice, in `repos` and in `projects`. Every debounced save serializes and hashes that on the main thread: 21.7 ms per full write, against 6.4 ms without icons.

The fixes are mostly small, local changes. The combination in "Reaching 2x" brings the main-thread and git-process metrics down 3x to 100x. Measured numbers are marked **(measured)**. Projections are marked **(estimated)**.

## How I measured

Constraints: I did not launch Electron or the dev app. Everything below comes from five sources:

| Source | What it gives | Caveat |
|---|---|---|
| Production trace log `~/Library/Application Support/muster/logs/main.trace.ndjson*` (10 files, 2026-10-10 to 2026-11-04, 174,899 `git.exec` spans, 7 launches, 169.8 active hours) | Real git spawn counts, durations, concurrency, startup timeline | Fast successful spans (<250 ms) are sampled at 60 per (subcommand, cwd) per minute (`src/main/observability/instrumentation.ts:26-28`), so fast-call counts are a lower bound. Slow or failed calls are complete. "Active hours" excludes gaps over 10 min. |
| Real profile `orca-data.json` (read-only copy) | 248 repos (225 git, 23 folder), 368 worktree meta rows, 82 image icons averaging 13.4 KB | Single user, but a heavy one |
| Node benchmark against the 215 local git repos on disk (read-only commands, `GIT_OPTIONAL_LOCKS=0`), with and without 350 MB heap ballast | Isolated cost of each spawn pattern, plus event-loop lag | Plain Node, not Electron main. Spawn cost is about 0.9 ms per `execFile()` call either way |
| Temporary vitest benchmark (`src/main/zz-perf-scratch-store.test.ts`, deleted after the run) running the real `Store` class on a copy of the real profile | Store hydration, `getRepos()`, full-write cost, `git:status` lookup cost | Electron's `safeStorage` mocked as unavailable |
| Packaged app `/Applications/Muster.app` (v1.15.9) asar | Bundle sizes, V8 compile cost | Compile only, not execution |

Scratch scripts are in the session scratchpad (`trace-agg*.js`, `bench-git.js`, `bench-persist.js`, `bench-compile.js`). None were added to the repo.

## Baseline numbers

### Startup (from the production trace, process start to event)

| Launch | Kind | Renderer bootstrap | Repos with first worktree list done, p50 / p95 / last | Git spawns by +10 s / +30 s / +60 s |
|---|---|---|---|---|
| 10-12 | post-update | 6.8 s | 13.2 / 21.3 / 25.7 s | 26 / 486 / 2,308 |
| 10-15 | post-update | 4.6 s | 9.2 / 13.4 / 18.6 s | 316 / 2,305 / 2,312 |
| 10-20 | post-update | 6.8 s | 11.9 / 15.5 / 19.5 s | 50 / 1,641 / 2,321 |
| 10-22 | post-update | 7.0 s | 11.9 / 13.5 / 17.0 s | 52 / 2,380 / 2,387 |
| 10-23 | post-update | 6.8 s | 11.4 / 14.5 / 18.1 s | 52 / 2,395 / 2,401 |
| 10-23 | warm relaunch | 1.4 s | 7.6 / 12.1 / 17.9 s | 307 / 2,385 / 2,402 |
| 10-30 | after reboot | 6.9 s | 22.0 / 30.2 / 37.6 s | 46 / 333 / 1,834 |

Startup git mix, averaged per launch: `config` 800, `worktree list` 410, `rev-parse` 270, `remote` (all forms) 460, `symbolic-ref` 200, `branch --show-current` 200. Peak concurrency was 184 to 193 live git processes, almost all `git worktree list`, each in a different repo, all started within about 250 ms. `git worktree list` p50 is 268 ms during startup and 13 ms in isolation, so contention makes it about 20x slower.

### Isolated benchmark, 215 real repos (measured)

| Pattern | Wall | Max event-loop stall |
|---|---|---|
| `worktree list` sequential | 2.8 s | 2-4 ms |
| `worktree list` concurrency 8 | 0.70 s | 13 ms |
| `worktree list` concurrency 4 | 0.78-0.84 s | 2 ms |
| `worktree list` unbounded (`Promise.all`) | 0.67-0.72 s | **651-695 ms** |
| Username probe chain, serial (current) | 24-31 s, 1,906 spawns | 24-50 ms, 2.2-3.9 s total lag |
| One `git config --get-regexp` per repo, serial | 2.6-3.0 s, 215 spawns | 2-5 ms |

Unbounded fan-out is no faster than a cap of 8, and it freezes the event loop for about 0.7 s.

### Steady state (production trace, per active hour)

About 1,030 git spawns per hour in total. The top costs:

| Subcommand | Calls/h | Git-seconds/h | Source |
|---|---|---|---|
| `worktree list` | 175 | 45.3 | Runtime and IPC sweeps. 130 full sweeps (150+ repos each), wall p50 2.2 s, p95 22.4 s |
| `remote get-url` / `remote -v` | 630 | 23.0 | 30 s positive cache for owner/repo, 5 min retry for repos with no remote identity |
| `status` | 63 | 4.9 | About every 13 s per visible worktree. Cheap, fine |
| `diff` | 32 | 2.6 | Line stats |

### Main process, real profile, vitest (measured)

| Operation | With icons (today) | Icons removed |
|---|---|---|
| `new Store()` (load + migrate) | 19 ms p50, 37 ms first | 9 ms |
| `store.getRepos()` | **23.3 ms** | 0.22 ms |
| `getLocalRepoForRegisteredWorktree` (runs on every `git:status`) | **25.9 ms** | 2.0 ms |
| `store.flush()` full write | 21.7 ms | 6.4 ms |
| Save serialize + sha1 (plain Node) | 15.6 ms p50 | 4.2 ms |
| `orca-data.json` size | 3.24 MB (plus 5 backups of 3.1 MB) | 1.04 MB |

### Bundles (measured)

- Main: one 8.0 MB `out/main/index.js`. Cold V8 compile takes 71 ms, or 0.6 ms with a code cache. Nothing in `src/` enables a compile cache.
- Renderer: 9 eager chunks totaling 4.18 MB (`index` 2.0 MB, `I18nProvider` 2.0 MB). 387 JS files in total, 31.9 MB.
- Renderer heap from the trace breadcrumbs: p50 273 MB, p90 441 MB, max 853 MB.

## Bottlenecks ranked by user-felt impact

### 1. Git-username enrichment runs about 1,900 git processes at every launch

- Where: `src/main/ipc/repos.ts:1207` (fired by `repos:list`) calls `src/main/repo-git-username-enrichment.ts:37`, a serial loop over every git repo, which calls `resolveLocalGitUsernameDetailed` in `src/main/git/git-username.ts:264`. That probe chain (`:224-262`) runs 2 `config --get`, `remote`, `symbolic-ref`, `rev-parse --verify`, `branch --show-current`, 2 `config --get branch.X.remote`, and 1 or 2 `remote get-url`. The `attemptedLocations` set (`:16`) only lives for one process, so this repeats on every launch.
- Evidence: the trace's startup `config/3` (800), `remote/1` (200), `symbolic-ref/3` (200), `branch/2` (200) and `rev-parse/4` (270) counts match the chain one-for-one. The benchmark reproduces it: 1,906 spawns, 24-31 s wall, 2.2-3.9 s total event-loop lag.
- Change: stop doing this at launch.
  - (a) Resolve lazily: the username only feeds the branch-prefix default when you create a worktree. Resolve it the first time that dialog or path needs it, and show the persisted `gitUsername` until then.
  - (b) Also replace the chain with one `git config --get-regexp '^(github\.user|user\.username|branch\..*\.remote|remote\..*\.url)$'` plus a file read of `refs/remotes/origin/HEAD`, and cache the result by `readLocalGitConfigSignature` (`src/main/github/local-git-config-signature.ts`). That signature already exists and is skipped for SSH and WSL.
- Expected gain: about 1,900 fewer startup spawns, 0 with (a) **(measured spawn count)**. Background git time drops from 24-31 s to 0 s, or to 2.6-3.0 s with (b) alone **(measured)**.
- Risk: low to medium. Branch-prefix defaults must still be right on first use. SSH keeps its own `getSshGitUsername` path, so it is unaffected. `--get-regexp` works on Git 2.25.
- Effort: 4-6 h for (a) plus tests, and 2-3 h more for (b).

### 2. Unbounded `git worktree list` fan-out in the runtime, and a second list per repo

- Where:
  - `src/main/runtime/orca-runtime.ts:25162`: `computeResolvedWorktrees` runs `Promise.all(repos.map(...))` over all repos with no cap. The result is cached for 1 s (`:30851`) and each repo's scan for 30 s (`:30852`), so any runtime caller (mobile and session loading, CLI `worktree ps`, MCP, pty record refresh at `:5649`) re-sweeps every repo at once after 30 s.
  - Independently, `src/main/ipc/filesystem-auth.ts:178` (`rebuildAuthorizedRootsCache`), `src/main/ipc/worktrees.ts:543` (`listDetectedGitWorktrees`, 5 s cache at `:483`) and the runtime cache each list worktrees for every repo. `src/main/git/worktree.ts:778` `listWorktrees` only dedupes calls that are in flight at the same moment, so a launch lists every repo about twice (410 lists for 205-220 repos).
- Evidence: 184 to 193 concurrent `git worktree list` processes at +8 to +12 s on every launch (trace). An unbounded sweep stalls the event loop for 651-695 ms with no wall-time gain (benchmark). Steady-state full sweeps have a wall p95 of 22.4 s.
- Change:
  - Run the runtime sweep through a bounded mapper (8, the value the IPC paths already use, `worktrees.ts:209`).
  - Move result caching into `listWorktrees` itself, keyed by `(repoPath, wslDistro)`, with a short TTL (5 s) and the existing `bumpWorktreeScanGeneration` invalidation (`git/worktree.ts:743`), so the auth rebuild, IPC listing and runtime share one result.
  - Let `rebuildAuthorizedRootsCache` reuse roots that `rememberLocalWorktreeRoots` already registered instead of re-listing.
- Expected gain: startup worktree lists drop from about 410 to about 215 **(measured count, estimated after)**. Removes a 0.65-0.7 s main-thread stall per sweep **(measured)**. Worktree list p50 should fall back toward the 13-24 ms isolated figure instead of 157-268 ms **(estimated)**.
- Risk: medium. External `git worktree add/remove` must still show up. The git-common watcher and base-directory poller already call the notify and invalidate paths, so keep the TTL at or below the current 5 s and invalidate on those events. SSH goes through `provider.listWorktrees` and shares the cap.
- Effort: 1 h for the cap, 4-6 h for the shared cache and auth-rebuild reuse, plus tests covering host isolation (native, WSL, SSH).

### 3. `getRepos()` re-validates every icon on every call (23 ms)

- Where: `src/main/persistence.ts:3942` maps every repo through `hydrateRepo` (`:4770`), which calls `sanitizeRepoIcon` (`src/shared/repo-icon.ts:111`). For image icons that runs a regex over the whole data URI plus `validateRasterImageDataUri` (`repo-icon.ts:83,90`), which decodes and checks the image bytes. `getRepo(id)` (`:4064`) does the same for one repo. There are 82 `getRepos()` call sites in `src/main`. Hot ones:
  - `git:status`: `src/main/ipc/filesystem.ts:1135` calls `getLocalRepoForRegisteredWorktree` (`src/main/ipc/local-worktree-runtime-options.ts:38`), and `resolveRegisteredWorktreePath` calls `isRepoRoot(store.getRepos())` at `src/main/ipc/filesystem-auth.ts:416`. That is up to 2 full hydrations per status poll.
  - Folder-to-git upgrade poller: `src/main/ipc/folder-repo-git-upgrade.ts:155` runs every 2 s while the window is visible and 23 folder repos exist.
  - `repos:list`, `worktrees:listAll` (via `migrateAllLocalWpRepoPathsIfNeeded`), `rebuildAuthorizedRootsCache`, the runtime sweep, and 20 sites in `orca-runtime.ts`.
- Evidence: 23.3 ms vs 0.22 ms without icons; 25.9 ms vs 2.0 ms on the `git:status` lookup (measured).
- Change: sanitize icons once, when the repo is loaded or written (`addRepo`/`updateRepo`/migration), and memoize the hydrated `Repo` per stored object, invalidated by the same mutations that call `scheduleSave`. Also index worktree meta by repo id so `hasRegisteredWorktreeMetaForRepo` (`local-worktree-runtime-options.ts:22`) stops scanning all 368 rows for each of 248 repos.
- Expected gain: `getRepos()` drops from 23.3 to about 0.2 ms (about 100x), and the `git:status` main-thread prelude from 25.9 to 2.0 ms or less (13x) **(measured with icons removed, which is the cost the memo removes)**. The folder poller drops from about 1.2% of main-thread time to about 0 **(estimated from 23 ms per 2 s)**.
- Risk: low. Callers that mutate the returned object would now mutate the cache, so return frozen objects or shallow copies; the shallow copy is cheap once validation is gone.
- Effort: 3-4 h plus tests.

### 4. Icons inflate every save and every backup

- Where: `repoIcon` is stored on both `repos[]` and `projects[]` (2.2 MB of 3.24 MB). Every debounced save (`persistence.ts:3662`, 1 s trailing, 5 s max wait) runs `buildStateToSave` (`:3702`): one full `JSON.stringify` plus sha1 of everything. Backups copy the full file (5 x 3.1 MB on disk).
- Evidence: full write 21.7 ms vs 6.4 ms, serialize+hash 15.6 ms vs 4.2 ms, load 19 ms vs 9 ms (measured).
- Change: store image bytes once, outside `orca-data.json`, in an `icons/<sha256>.png` sidecar next to the profile. Keep `{ type: 'image', source, hash }` in state. Serve the image to the renderer from a cached data URI or a `muster-icon://` protocol. At minimum, keep icons on `repos` only and drop the `projects` duplicate.
- Expected gain: 3.4x cheaper full writes and 2.1x faster store load, file 3.2 MB to 1.0 MB **(measured)**.
- Risk: medium. Needs a migration, and an older build opened on a migrated profile would show default icons (acceptable, nothing is lost if the sidecar stays). Every platform shares one profile path, so there are no OS-specific paths beyond `path.join`.
- Effort: 6-10 h for the sidecar, or 2-3 h for the dedupe-only version.

### 5. Remote-identity probes every 30 s per repo

- Where: `src/main/github/github-repository-identity.ts:53`. Positive owner/repo cache entries expire after 30 s and re-spawn `git remote get-url` (usually `upstream` and then `origin`). `src/main/repo-git-remote-identity-enrichment.ts:3` retries `git remote -v` every 5 min for the 23 repos with no parseable remote, and is triggered on every `repos:list` and `projects:list` (`src/main/ipc/repos.ts:1203,1214,1230`).
- Evidence: 630 `remote` calls per active hour, 61% of all git spawns (trace). The per-repo gap p50 is 29.2 s, which matches the 30 s TTL.
- Change: revalidate positive entries by `readLocalGitConfigSignature` (a stat of `.git/config`) instead of the 30 s TTL, as negative entries already do. Do the same for the no-identity retry. SSH and WSL keep the TTL, since the signature returns `undefined` there.
- Expected gain: about 600 fewer spawns per hour, so steady-state spawns fall from about 1,030/h to about 400/h **(estimated from trace counts)**.
- Risk: low. A remote changed with `git remote set-url` touches `.git/config`, so the signature catches it.
- Effort: 2-3 h.

### 6. Renderer findings

Everything in this section comes from reading the code. None of it was profiled. Paths are under `src/renderer/src/`.

Counts: 2,435 `useAppStore(` call sites in 401 files and 76 `useShallow(` uses. There is one store (`store/index.ts:57`, 47 slices), so every `set` re-runs every mounted selector. No selector was found that returns a fresh array or object each call, because shared derived hooks are WeakMap-cached (`store/selectors.ts:170-181`). The real issue is whole-map subscriptions: `repos` 35, `worktreesByRepo` 14, `tabsByWorktree` 8, `settings` 113.

| # | Finding | Where | Change | Effort |
|---|---|---|---|---|
| 6a | Startup is serial before `workspaceSessionReady`. The chain is settings, UI, repos, catalog, session and worktrees, keybindings, browser profiles, onboarding, SSH targets, SSH reconnect (up to 15 s per target), serial `ssh.getState` per target, `awaitFirstWindowStartupServices`, then `reconnectPersistedTerminals`, which is the step that sets ready. | `App.tsx:852-1062`; `store/slices/terminals.ts:3357,3461` | Mount the workspace right after the session stores hydrate. Move SSH reconnect, browser profiles and terminal reconnect off the gate. Use `Promise.all` for the `getState` loop. | 4-8 h |
| 6b | Every mounted worktree card runs its own 60 s hosted-review poll, which fires immediately on mount (so it fires while scrolling) and on each deps change. Issues use the same pattern at 5 min. Together with the 30 s main-process TTL (item 5), this drives the `remote get-url` cadence. | `components/sidebar/WorktreeCard.tsx:709-712,794-797`; `lib/window-visibility-interval.ts:41`; renderer TTL 120 s at `store/slices/hosted-review.ts:39` | Use one list-level scheduler that batches visible cards per repo into one IPC, and skip the immediate run when the cache is fresh. | 4-6 h |
| 6c | `Terminal.tsx`, the root workspace surface with 49 subscriptions, subscribes to the whole `tabsByWorktree`, `openFiles` and `groupsByWorktree` maps. Any tab or file change in any worktree re-renders it. | `components/Terminal.tsx:265,286,310` | Select only the active worktree's slices, or use `useShallow` over rendered ids. | 3 h |
| 6d | `SourceControl.tsx` subscribes to whole per-worktree maps (`:880`, `:971`, `:972`) and renders file rows with a plain `.map`, not virtualized (`:6501`, `:6563`). `submoduleExpansion` builds a new object every render (`:6492`), which defeats `React.memo` on the rows. | `components/right-sidebar/SourceControl.tsx` | Use per-id selectors, virtualize above about 200 rows, and memoize the row handlers. | 3-5 h |
| 6e | The `App` root re-renders on every agent acknowledgement, because `acknowledgedAgentsByPaneKey` is only used to persist UI state. Every worktree card also subscribes to that whole map and to all of `settings`. | `App.tsx:675`; `components/sidebar/WorktreeCardAgents.tsx:104`; `WorktreeCard.tsx:254` | Persist through `useAppStore.subscribe` outside React. Cards select only their own pane keys and the individual settings fields they use. | 3 h |
| 6f | Icons in the renderer: every `repos:list` structured-clones about 1.1 MB of data URIs, and `maskedIconStyle` builds two 13 KB mask strings on every render of a tinted icon. | `hooks/useIpcEvents.ts:1140-1147`; `components/repo/repo-icon.tsx:141-143` | Covered by item 4's sidecar. Memoize the style per src and tint. | 1 h after item 4 |
| 6g | Three task pollers use a raw `setInterval` and keep polling while the window is hidden. | `use-tasks-panel-tasks.ts:21` (45 s), `use-site-pipelines.ts:14` (60 s), `use-active-collab-assigned-tasks.ts:13` (5 min) | Switch to `installWindowVisibilityInterval`. | 0.5 h |

Already in good shape: the sidebar worktree list is virtualized (`WorktreeList.tsx:2031`, overscan 10). `WorktreeCard` and `WorktreeList` are `React.memo`. `git:status` polling is a 60 s safety interval on the active worktree only and pauses while hidden (`components/right-sidebar/useGitStatusPolling.ts:23,204`). The roughly 13 s cadence in the trace comes from file-watch and push-driven refreshes, with a 3 s floor (`:27`).

### Checked and not worth doing now

- LocalWP migration (`src/main/sites/localwp-repo-path.ts:157`): it is already process-cached. One pass over 248 repos costs 0.19 ms (measured), so it is not a bottleneck.
- `git:status` polling itself: 63 per hour, 24 ms p50, 4.9 git-seconds per hour. The expensive part is the lookup before git starts (item 3), not git.
- Worktree base-directory poller (`src/main/ipc/worktree-base-directory-poller.ts`): already stat-gated, with a backstop every 15 ticks. Cheap.
- Persistence debounce and journal: already async, coalesced (1 s / 5 s) and hash-guarded. Only the payload size matters (item 4).
- Main bundle code cache: saves about 70 ms of compile per launch (measured in Node). It is worth a spike (`module.enableCompileCache()` under asar is unverified), but it is small next to the items above.

## Reaching 2x

| Metric | Baseline | After | Fixes | Basis |
|---|---|---|---|---|
| Git processes in the first 60 s of a launch | 2,308-2,402 | about 250 (9x fewer) | 1 + 2 | Measured counts; "after" is arithmetic on them |
| Worst main-thread stall from git fan-out | 651-695 ms | 13 ms or less | 2 (cap) | Measured in benchmark |
| Background git work after launch (serial username chain) | 24-31 s | 0 s | 1(a) | Measured in benchmark |
| Sidebar data settled (p95 repos listed), warm relaunch | 12.1 s | 4-6 s (2x+) | 1 + 2 | Estimated: an isolated sweep is 0.7 s; the remaining time is renderer boot (1.4 s) plus the request delay |
| Main-thread time per `git:status` request (before git) | 25.9 ms | 2.0 ms (13x) | 3 | Measured |
| `store.getRepos()` | 23.3 ms | 0.22 ms (100x) | 3 | Measured |
| Full-state save | 21.7 ms, 3.2 MB | 6.4 ms, 1.0 MB (3.4x) | 4 | Measured |
| Steady-state git spawns per active hour | about 1,030 | about 400 (2.5x) | 2 + 5 | Estimated from trace counts |

Items 1, 2 and 3 together (about 13-19 h) clear 2x on every startup and main-process metric above. Items 4 and 5 (about 5-13 h) are cheap follow-ups. For time to interactive, 6a is the lever: today the UI waits on SSH reconnect and terminal reconnect. It cannot be quantified until the renderer startup steps are captured. `timeRendererStartupStep` in `App.tsx` already times each step, so one logged run gives the baseline. 6b-6e reduce re-render and polling churn during use. They need a React Profiler session before anyone claims a number.

## What I could not measure, and how to close it

- **Renderer first paint to interactive, and store hydration in the renderer**: needs the app running. The trace only has `renderer_bootstrap_started/rendered`, with nothing for "sidebar interactive". Next step: one run of the user's installed app with `ORCA_STARTUP_DIAGNOSTICS=1` (milestones and event-loop stall probe already exist in `src/main/startup/`), plus a renderer `performance.mark` when the first `fetchAllWorktrees` settles. Add a "first full worktree sweep done" milestone (1 h).
- **Main-process event-loop stalls in production**: `ORCA_MAIN_THREAD_DIAGNOSTICS=1` (`src/main/diagnostics/main-thread-churn-probe.ts`) has never been captured on this machine. The 23 ms `getRepos` and 0.7 s fan-out numbers come from Node benchmarks, not Electron.
- **Post-update launch time (4.6-7.0 s to renderer vs 1.4 s warm)**: most of the gap is likely macOS first-launch verification of the new 90 MB asar and a cold V8 code cache, which the app cannot control. Confirm by timing two consecutive launches after an update.
- **Which runtime caller triggers the startup sweep**: the fan-out site is certain (`orca-runtime.ts:25162`, 184-193 concurrent lists across distinct repos). The specific caller is not, since spans carry no caller attribute. Adding a `caller` attribute to `withGitSpan` would settle it (1 h).
- **Trace sampling**: fast successful git spans are capped at 60 per (subcommand, cwd) per minute, so the counts above are lower bounds. For startup and the 30 s remote cadence the cap is not reached, so those counts are effectively exact.

## Suggested order

1. Cap the runtime fan-out (1 h, low risk, removes a 0.7 s stall).
2. Memoize `hydrateRepo` and sanitize icons on write (3-4 h, 100x on `getRepos`).
3. Make username resolution lazy (4-6 h, about 1,900 fewer spawns per launch).
4. Share one worktree-list cache across auth, IPC and runtime (4-6 h).
5. Signature-keyed remote caches (2-3 h).
6. Icon sidecar or dedupe (2-10 h).
7. Capture one launch with `ORCA_STARTUP_DIAGNOSTICS=1` and the `timeRendererStartupStep` output, then do 6a (unblock the UI from SSH and terminal reconnect).
8. Renderer subscription fixes 6b-6e, each checked with React Profiler before and after.
9. Re-run the trace analysis scripts on a week of new logs and compare against the tables above.
