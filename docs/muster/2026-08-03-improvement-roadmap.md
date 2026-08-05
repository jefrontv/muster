# Muster Improvement Roadmap — 2026-08-03

Evidence-based plan for the next round of fundamental improvements: performance, UI, opt-in agent capabilities ("harness tools"), customization, and new features. Every item cites current code. Ratings: Impact/Effort = S/M/L.

---

## 1. Performance & Reliability

The repo already has the measurement infra (`bench:startup`, `bench:main-thread-jank`, `bench:idle-cpu`, terminal perf suites, `config/reliability-gates.jsonc`). These items convert known hotspots into fixes, each provable by an existing bench.

### P1. Eliminate non-shutdown sync `flush()` (Impact L / Effort M)
`src/main/persistence.ts:3770` documents the sync write path as "only for flush() at shutdown" — but `flush()` has ~15 live callsites: every automation create/update/run (`:4876`, `:4948`, `:4957`, `:5005`, `:5054`, `:5072`, `:5098`), Claude live-PTY session seed (`:6384`), and six SSH PTY lease paths (`:6582`–`:6672`). Each one synchronously `JSON.stringify`s the entire multi-MB state on the main thread.
- Fix: per-domain durability journal (tiny append-only sidecar) for the crash-race cases (#217 SIGKILL race), async debounced write for the rest. Keep sync flush only at `before-quit`.
- Prove: `bench:main-thread-jank`, `bench:multi-workspace-typing`.

### P2. Partition `orca-data.json` (Impact L / Effort M)
One JSON blob holds settings + repos + worktreeMeta + workspaceSessionsByHostId + automations + onboarding + UI state (`persistence.ts`, 6,815 ln). Two prior patches confirm the pattern hurts: githubCache was exiled to a sidecar because polling "rewrote the whole multi-MB state file", and worktreeMeta GC was added after 63% dead entries.
- Fix: split `workspaceSessionsByHostId`, `automations`(+runs), `worktreeMeta` into separate files with independent dirty tracking + per-file backup rotation. Migration on first load, one-way.
- Bonus: compute the dirty-domain bitmap *before* stringify (today the sha1 no-op check runs after full serialization).
- Prove: `bench:startup`, write-bytes logging already present (`workspaceSessionBytes`).

### P3. Move per-chunk terminal tail parsing off the main process (Impact L / Effort L)
`src/main/runtime/orca-runtime.ts` (32,833 ln) runs 256KiB tail scans "hundreds/sec" per terminal chunk (`buildPreview` / `computeTerminalTailWaitState`) on the main process — the direct target of jank issue #7576 and `bench:main-thread-jank`. The PTY daemon already hosts a server-side xterm (`src/main/daemon/headless-emulator.ts`) with fidelity fuzz tests.
- Fix: daemon emits parsed facts (status transitions, preview text, wait-state) instead of the main process re-scanning bytes.
- Sequenced after P4 (needs the state-owner seams).

### P4. Extract `OrcaRuntimeService` state owners (Impact M / Effort M)
The 1.2MB god-object mixes PTY graph, agent-status OSC parsing, mobile layout state machine, presence lock, Linear/Jira/ActiveCollab bridges, browser automation, and worktree scan caching. Its own header admits "state-owner extraction before enforcing max-lines". Mechanical, section-markers already exist. Enables P3 and shrinks startup parse cost.

### P5. Split `useIpcEvents` + granular store updates (Impact M / Effort S)
`src/renderer/src/hooks/useIpcEvents.ts` registers ~93 listeners in one `useEffect`; high-frequency events (agent status, terminal presentation) write into the single ~45-slice zustand store. Split into per-domain registration modules under one bridge (keeps the single-contract goal, restores testability), audit selectors on hot slices (agent-status, usage×3, rate-limits).
- Prove: terminal-perf-bench p95 tab/workspace switch.

### P6. Startup: lazy host-partition hydration (Impact M / Effort M)
Load path runs full migration + zod normalization for every host partition on boot. Hydrate non-active hosts on first access. Prove with `bench:startup` (aged-profile scenario already simulated).

### P7. Reliability-gate coverage lift (Impact M / Effort S)
Watcher-crash class (#7547: `@parcel/watcher` native crash on unsubscribe race) is fixed via forked process + respawn, but the git index-only refresh-fanout gate is "partial, macOS-only". Promote watcher + fanout gates to Linux/Windows; add a CI-safe subset of `tools/repro-watcher-crash-7547/`.

---

## 2. UI Improvements

Design language stays per `docs/STYLEGUIDE.md` (quiet monochrome, shadcn/Radix in `components/ui/`).

### Quick wins
| # | Item | Evidence | Impact/Effort |
|---|------|----------|----------------|
| U1 | **Global action palette** — searchable "run any command / open any setting" surface. Cmd+J palette (`WorktreeJumpPalette`) and `QuickOpen` exist, cmdk primitive exists, keybindings slice is a ready action registry; no action palette today. | `components/ui/command.tsx`, keybindings slice | L / S |
| U2 | **Type `modalData`** — 20-modal union currently carries `Record<string, unknown>` payloads. Discriminated union kills a runtime-only contract. | `store/slices/ui.ts:802` | M / S |
| U3 | **Real nav history** — replace 3 bespoke `previousViewBefore{Skills,Sites,Mobile}` fields with one back-stack; adding a view currently touches every union. | `store/slices/ui.ts:650-678` | M / S |
| U4 | **Auto-derived settings search index** — N hand-written `*-search.ts` keyword files drift; derive from `SearchableSetting` usage + pane metadata (`useSettingsNavigationMetadata.ts`), keep the enforcement test. | `components/settings/*-search.ts` | M / S |
| U5 | **One education scheduler** — onboarding flow, setup-guide, feature-wall, feature-tips, contextual tours = 5 parallel teaching systems with ~50 gating fields (`ui.ts:806-833`). Single scheduler + global frequency cap. | `components/{onboarding,feature-tips}/` | M / M |
| U6 | **Resolve `ActivityPrototypePage`** — named prototype shipped in main nav; promote behind its `experimentalActivity` flag properly or cut. | `App.tsx` lazy routes | S / S |

### Structural
| # | Item | Evidence | Impact/Effort |
|---|------|----------|----------------|
| U7 | **Split `TaskPage.tsx` (12,403 ln) by provider** — GitHub/GitLab/Linear/Jira UIs inline; ActiveCollab was already extracted to ~50 sibling files, proving the pattern. Enables per-provider lazy loading. | `components/TaskPage.tsx`, `task-page-activecollab-*` | L / M |
| U8 | **Shared task-list model** — grouping/sorting/display-props exist for Linear only; a provider-agnostic list model brings them to GitHub/Jira/GitLab/AC. Depends on U7. | TaskPage internals | L / M |
| U9 | **Decompose `useComposerState` (4,307 ln)** into sub-hooks (naming, smart-github, run-target, sparse presets) — currently gates all composer feature velocity. | `hooks/useComposerState.ts` | M / M |
| U10 | **Unify PR surfaces** — `GitHubItemDialog.tsx` (7,809) vs `PullRequestPage.tsx` (7,348) overlap heavily. | both files | M / L |
| U11 | **Sites in left sidebar (opt-in)** — declined in ocsites v1 but fully scoped (FolderWorkspaceRow template, ~26-site union change). Pairs with D-pillar toggle. | `docs/muster/OCSITES_INTEGRATION_PLAN.md` §11 | M / M |

---

## 3. Opt-in Agent Capabilities (harness tools)

Today the model is install-all: `default-skill-install.ts` lays all 7 bundled skills at startup; the 24-tool muster-sites MCP auto-registers. There is **no "Agent Capabilities" settings surface**. The settings toggle pattern is fully established (exemplar: `markdownReviewToolsEnabled` — `types.ts:2683`, `constants.ts:209`, pane + search file).

### C0. "Agent Capabilities" settings pane (prerequisite, Effort S)
New pane listing every agent-facing capability with per-capability toggles (and per-agent scoping where cheap). Skill installs already fingerprint, so toggling off can cleanly remove. Everything below lands behind this pane, default-off unless noted.

### New capabilities, ranked
1. **Usage/statusline feed for codex + opencode + grok** — infra ~80% built: usage scanner dirs exist (`codex-usage/`, `opencode-usage/`), statusline ingest is claude-only by a pathname check (`agent-hooks/server.ts:1532`). Impact L / Effort M.
2. **Session-resume registry for all harnesses** — pi/omp already publish `session_id`/`session_file` (`pi/agent-status-extension-source.ts`); generalize so every pane offers "resume this agent" + crash recovery. Impact L / Effort M.
3. **`orca memory`** — per-worktree keyed KV scratchpad agents read/write for cross-agent handoffs (worktree comments back-channel already exists; extend). Impact L / Effort M.
4. **`orca review` / `orca diff`** — expose source-control state via CLI so agents self-review before handoff (`src/main/source-control/` exists). Impact M / Effort S.
5. **"Agent waiting on you" detection beyond Claude** — permission/question heuristics are claude-only in `agent-hooks/server.ts`; add codex/gemini/grok extractors → per-harness attention notifications (ties into `experimentalTerminalAttention`). Impact M / Effort M.
6. **`orca ports`** — declare/claim dev-server ports per worktree to stop parallel-agent collisions (`src/main/ports/` scanner + advertised-url watcher exist). Impact M / Effort S.
7. **Tracker skill parity** — only Linear has CLI + skill; Jira/GitHub/GitLab main-process clients exist (`src/main/{jira,github,gitlab}/`). Add `orca jira|github|gitlab` read/attach surfaces + skills. Impact M / Effort M.
8. **muster-sites MCP per-agent toggle** — 24 tools currently always-on; move under C0 with per-agent opt-in. Impact M / Effort S.
9. **`orca notify`** — agent-triggered attention ping via tray/notification/speech (`src/main/{tray,speech}/` exist), rate-limited, opt-in. Impact S / Effort S.
10. **Scoped secrets via ai-vault** — per-repo opt-in read surface for agents (`src/main/ai-vault/`); needs a careful consent UX, keep last. Impact M / Effort L.
11. **Per-account hook installs for claude/grok** mirroring codex's per-`CODEX_HOME` pattern; **generalize WSL hook reconciliation** beyond codex (relay is agent-agnostic). Impact S / Effort M.

---

## 4. Options & Customization

| # | Item | Evidence | Effort |
|---|------|----------|--------|
| D1 | Un-hide fork-hidden panes behind an Advanced toggle — orchestration/mobile are a hard `Set` today. | `useSettingsNavigationMetadata.ts:124,607` | S |
| D2 | Configurable ActiveCollab polling (interval/backoff/pages) — hardcoded 60s/15s/15min/10. | `activecollab/task-notification-poller.ts:46-51` | S |
| D3 | Settings export/import UI — single JSON store + 5 rolling backups already exist (`persistence.ts:482`); expose restore/export. | persistence backups | S |
| D4 | Per-repo setting overrides — `hostSettingOverrides` pattern exists per ExecutionHost (`types.ts:2648`); extend grain to repo (agent defaults, terminal, notifications). | shared/types.ts | M |
| D5 | Notification quiet hours + per-source cooldowns — dispatch has a `cooldown` reason, values hardcoded. | notifications pipeline | S |
| D6 | Keybinding presets + conflict detection — file-backed `~/.orca/keybindings.json` exists, no in-app conflict UI. | settings/shortcuts | M |
| D7 | App-wide accent/theme — only `leftSidebarTint*` + terminal themes today (Ghostty/Warp import already shipped). Add app accent + custom theme within STYLEGUIDE constraints. | Appearance panes | M |
| D8 | Agent launch profiles — `agentCmdOverrides`/`agentDefaultArgs`/`agentDefaultEnv` exist with a thin editing surface; add named presets (e.g. safe/yolo), formalizing `agentYoloDefaultsMigrated`. | AgentsPane | M |
| D9 | Retention knobs under Advanced — backups (5/1h), worktreeMeta GC (30d), scrollback caps. | `persistence.ts:362,482` | S |
| D10 | "Confirmations" section — 5 scattered `skip*Confirm` flags in one reset-able list. | GlobalSettings | S |

---

## 5. New Features & Integrations

1. **Finish ActiveCollab Phases 2–5** — plan table shows P2 renderer, P3 writes (comment/complete/labels/due/assignee), P4 project→sidebar binding, P5 one-click MCP install incomplete (header says "shipped" — reconcile against code first). `docs/muster/ACTIVECOLLAB_INTEGRATION_PLAN.md`.
2. **AC project → site binding** — approved design + 857-line TDD plan, all checkboxes unchecked: bind AC project→Site, "start work" opens New Workspace composer with linked work item + agent context block. `docs/muster/2026-07-29-activecollab-project-site-binding-plan.md`.
3. **SSH known-hosts TOFU pinning** — documented, deferred security gap: host keys accepted blind while stored passwords are sent (ocsites plan §11). App-wide win, do early.
4. **AC 429 Retry-After handling** — flagged as gap in both AC references; cap exists (`activecollab/http.ts:83`) but honor-server-value path incomplete.
5. **Muster rebrand copy pass (ocsites Phase 11)** — ~900 'Orca' UI strings × 5 locale catalogs; localization gates make this mechanical but wide.
6. **Mobile companion growth** — today worktrees/terminals only. Add: deploy/run status streaming (seam identified: `runtime/rpc/core.ts:122` `defineStreamingMethod`), AC task notifications push (snapshot-diff detector already built).
7. **Browser extension growth** — `wordpress-login-autofill` is the only extension (~2KB); add deploy-status badge and `muster://` bind-URL generator (`generate_bind_url` tool exists).
8. **Cloud ActiveCollab** (app.activecollab.com token intent) — unlocks non-self-hosted instances; keys already instance-qualified (`<instanceUrl>::<projectId>`).

---

## 6. Sequencing

**Wave 1 — DELIVERED 2026-08-03** (9 of 10; verified against a pristine-HEAD baseline):

| Item | Status | Evidence |
|------|--------|----------|
| P1 durability journal | done | `persistence-durability-journal.ts`; 15 non-shutdown full-state sync writes → 0. Per-spawn durable write **220,966 B → 200 B (1105x)**, locked by `persistence-pty-spawn-write-cost.test.ts`. Only intentional barriers remain (Codex credit ledger, journal overflow, shutdown). |
| P5 IPC bridge split | **deferred → Wave 2** | Attempt produced 20 extracted modules but never rewired `useIpcEvents.ts` (0 imports). Orphan output discarded rather than shipped as dead code. |
| U1 action palette | done | `Mod+Shift+P`; entries derive from KEYBINDING_DEFINITIONS + Cmd+J quick actions + settings nav — no duplicated list. |
| U2 typed modal payloads | done | `modal-payloads.ts` discriminated union, 19 ids, 59 callsites. Found + fixed a latent bug the untyped record hid (invalid `telemetrySource: 'settings'`). |
| U3, U4, U6 | not started | Deferred with P5; U3/U4 contend with files edited this wave. |
| C0 + C8 capabilities pane | done | New `agent-capabilities` section; per-skill + sites-MCP opt-out. Defaults preserve today's behavior (see note below). |
| D1 un-hide panes | done | `showHiddenSettingsSections` gates the hardcoded hidden set. |
| D2 AC poll cadence | done | Live re-arm, clamped 15s–900s via shared `activecollab-poll-interval.ts`. |
| D3 settings export/import | done | Secrets + machine-local keys excluded; import *rejects* files carrying them. |
| D10 confirmations | done | Single section; duplicate pinned-tab toggle removed (clean cutover). |
| #3 SSH TOFU | done | Replaced `hostVerifier = () => true`. Single ssh2 chokepoint; refuses changed keys naming both fingerprints; honors `~/.ssh/known_hosts` read-only. |
| #4 AC 429 Retry-After | done | Delta-seconds + HTTP-date, per-request budget. Non-idempotent writes deliberately not retried. |

Default-preservation note: `agentCapabilitySitesMcp` and `agentCapabilityBundledSkills` read as **enabled** when unset, so upgrading users lose no agent capability and the rendered toggle always matches runtime behavior. Turning them off is the opt-out; flipping the default off later is a separate, announced change.

Test baseline: pristine HEAD = 169 failures / 56 files. After this wave = parity within run-to-run flake (168–170), **zero new failing files**. The repo has pre-existing red on `main` unrelated to this work: an `isGitRepo` mock gap cascading through `git/`+`runtime/` suites, a 649-line oxlint `max-lines` error in `config/scripts/package-electron-runtime-contract.test.mjs`, and unlocalized strings in the in-flight browser-extension work.

**Wave 2 — structural:**
P5 (carried over), P2, P4, U3, U4, U6, U7→U8, U9, C1 (usage feeds), C2 (resume registry), C4, C6, feature #1 (AC phases).

**Wave 3 — deep:**
P3 (tail parsing → daemon), P6, U10, C3, C5, C7, D4, features #2, #5, #6.

Rationale: Wave 1 items are independent and provable with existing benches/tests; P4 must precede P3; U7 precedes U8; C0 precedes all C-items.

## 7. Guardrails (apply to every item)
- max-lines ratchet (300 ts / 400 tsx, shrink-only) — splits must land files under budget, no disables.
- Localization: 5-locale key parity gate; every new UI string through the catalog.
- Cross-platform: macOS/Linux/Windows + SSH + folder-workspace assumptions per AGENTS.md; Git 2.25 baseline.
- IPC: removeHandler-before-handle; redact-before-bridge.
- Settings additions follow the 7-step toggle pattern (types → defaults → pane → search file → consumer → nav → fixtures).
- Perf claims require a before/after bench artifact (`bench:compare` exists).
