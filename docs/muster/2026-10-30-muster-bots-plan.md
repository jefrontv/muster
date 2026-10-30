# Muster Bots

Port OpenMausBot v0.1.133 (`milind-soni/OpenMausBot`, commit `d280d4433e`) into Muster as an
experimental **Bots** tab beside Chat and Code. Muster Bots keeps every OpenMausBot feature that can run
without OpenMausBot's own cloud, rebranded to Muster, including the Composio connected-apps suite.

Research notes behind this plan are in `docs/muster/research/muster-bots/`:
`architecture.md`, `features.md`, `composio.md`, `muster-seams.md`.

## Decisions needed in review

1. **Composio key model.** (a) Each user pastes their own Composio project key. No infrastructure, but
   no app-event triggers. (b) efront runs its own Composio broker (Cloudflare Worker + D1, ported from
   OpenMausBot's Apache-licensed `cloudflare/composio-broker/`) holding one efront Composio key. Users
   connect apps with no key, and app-event triggers work. efront pays Composio.
   **Recommendation:** ship (a) first in Phase 3, then build (b) in Phase 3b.
2. **Where the fork lives.** A separate repo `jefrontv/muster-bots`, a fork that tracks upstream, whose
   CI builds a versioned artifact that Muster's build downloads and pins. **Recommendation:** separate
   repo. The alternative, vendoring 700K lines into `muster-ui`, makes upstream merges and Muster's lint
   gates (max-lines, i18n coverage) unworkable.
3. **Platforms for the first release.** **Recommendation:** macOS first (Apple silicon and Intel), Linux
   next. Windows stays off, as chat mode is today.
4. **UI approach.** **Recommendation:** embed the existing OpenMausBot UI, served by the sidecar, inside
   the Bots tab, restyled with a new Muster skin. Replacing panels with native Muster components is a
   later, optional phase (Phase 6).

## Licensing

- Everything outside `enterprise/` is Apache 2.0. Muster may copy, modify and ship it, and must:
  keep `LICENSE` and `NOTICE`, add OpenMausBot and its third-party notices (T3 Code, Cache Tax, hpke-js,
  WebRTC, Simple Icons, Lobe Icons, models.dev, OpenCode and the rest of `NOTICE` and `third_party/`)
  to Muster's third-party notices, and mark modified files as changed (Apache section 4b; a header
  line in each changed file plus a fork-level `CHANGES.md`).
- `enterprise/` is source-available under its own licence and needs a key for production. It is
  deleted from the fork. The server builds and runs without it (`server/enterprise.ts:119-140`). Lost:
  spend caps, billing sell prices, white-label `brand.json`, SSO, Workspaces/Installations, hosted
  workspace sign-in, hosted Slack bots.
- The OpenMausBot and MausBot names and the mascot are trademarks and are not licensed. Every
  user-visible name, logo, mascot, domain and icon is replaced. The rebrand edits the Apache code
  directly (default brand, strings, assets). It does not lift the enterprise `whitelabel` entitlement
  gate in `server/brand.ts`, since `LICENSING.md` reserves white-labelling for partners.
- Not legal advice. A short check of this section by whoever signs off efront licensing is worth doing
  before the first release.

## How OpenMausBot works (summary)

- **Server:** a Node 24 HTTP server (`server/openmausbot.ts`, built by esbuild into `dist-server`). It
  binds `127.0.0.1`, serves the built React 19 UI, a REST API under `/api/*`, one SSE stream
  (`/api/events`) and WebSockets for browser streams and the noVNC desktop viewer. State lives in a data
  directory: JSON registries plus SQLite via `node:sqlite`.
- **Bots:** each bot thread is a long-lived agent CLI process. Claude runs as `claude` stream-json with
  `--resume` and `--mcp-config`; Codex runs as `codex app-server`. 22 more engines run through ACP or
  HTTP drivers. The CLIs are not bundled.
- **Desktop shell:** a 46K-line Electron layer forks the server with `utilityProcess`, hands it an owner
  token and secrets over `parentPort`, stamps an owner header on requests from its window, stores
  credentials with `safeStorage`, and hosts native helpers (cua-driver for computer control, speech
  helpers, the phone companion, cloudflared).
- **Composio:** the server talks raw REST to Composio's Tool Router (API v3.1). Each agent run gets a
  local stdio MCP bridge (`server/connector-proxy.ts`) that relays to the server, which applies the
  permission gates and forwards to the Composio session MCP URL. OAuth runs on Composio's hosted pages.

## Architecture in Muster

```
Muster main process
 ├─ bots-sidecar (new): utilityProcess.fork(muster-bots/server/desktop-entry.mjs)
 │    env: OMB_DATA_DIR=<userData>/bots, OMB_PORT, OMB_STATIC_DIR, OMB_DESKTOP_PARENT=1,
 │         credentials, Muster's prepared Claude/Codex account env
 │    parentPort: owner token, secrets, local-computer grant
 ├─ session partition "persist:muster-bots": owner header stamped on requests to the sidecar port only
 └─ will-quit: stop sidecar and its children
Muster renderer
 └─ Bots tab (activeView 'bots') → <webview partition="persist:muster-bots" src="http://127.0.0.1:<port>">
      with a bots preload that exposes the `ogb` bridge subset the UI needs
```

- **Sidecar, not a merge.** Muster forks the built `dist-server` with `utilityProcess`, the same way
  OpenMausBot's own shell does. Merging into Muster's main process is ruled out by import-time globals,
  top-level await, the 15.8K-line `server/index.ts`, and the `parentPort` coupling.
- **Data directory:** `<Muster userData>/bots/`, so it is separate per Muster profile and never touches
  an existing `~/.openmausbot`. An "Import from OpenMausBot" action can copy that folder later.
- **Security:** `OMB_DESKTOP_PARENT=1` and the owner-token contract are mandatory. Without them, any
  local process gets owner access on loopback (`server/request-auth.ts`). Port probing starts at 8799
  and moves on if the port is taken. The owner header is added only on the `persist:muster-bots`
  partition, never on Muster's default session.
- **Embedding:** Muster's `will-attach-webview` handler (`src/main/window/createMainWindow.ts:454-480`)
  currently denies unknown partitions and strips preloads. It gets one narrow exception: the
  `persist:muster-bots` partition with Muster's own bots preload. The preload exposes only the `ogb`
  calls that the kept features need (about 206 exist; cloud, org and companion-account calls are
  dropped). `WebContentsView` is the fallback if `<webview>` has problems with focus or keyboard
  shortcuts.
- **Agent accounts:** before forking, main runs `ClaudeRuntimeAuthService.prepareForClaudeLaunch` and
  `prepareForCodexLaunch` and passes the resulting environment, so bots use the same managed Claude and
  Codex accounts as Muster's terminals and chat, with API-key variables stripped the same way.
- **Workspaces:** bots are local-only in this release. A bot's working folder can be any folder, git or
  not. SSH-hosted bots (running the sidecar on the remote host) are out of scope and listed under Later.

## Feature scope

Full list with file paths: `docs/muster/research/muster-bots/features.md`.

**Ported as is (runs locally):**
- Bots and contacts: profiles, SOUL.md, threads and folders, Departments, Chief of Staff delegation,
  group chats with `/goal`, the Team map, templates and presets, team package import/export, Grok import.
- Chat: composer (attachments, mentions, slash commands, queue, steer), streaming tool activity,
  markdown with KaTeX and Mermaid, citations, question cards, approval cards and approval levels,
  widgets and HTML apps, reactions, message actions, per-turn checkpoints and undo, message search,
  usage chip, error recovery, pinned web panels, Today brief.
- Engines: all 24 drivers, engine setup, model picker, limit failover, Claude cache keep-warm, tool
  selection, helper model.
- Computers: built-in automation browser, saved logins with TOTP, local VM (Docker/Podman), control of
  this Mac via cua-driver, BYO VPS over SSH, noVNC desktop viewer, USB Android control.
- Routines (once, interval, cron), calendar and run log, webhook triggers, bot-managed triggers,
  automation reports, memory and About me, team memory, skills (including `/learn` and imports from
  Claude Code, Cursor, Codex and Gemini), custom MCP servers with OAuth, usage page, backups, audit log,
  sentinel, the 18 bundled locales, notifications, data tools (DuckDB SQL, AG Grid, Vega), command
  palette and shortcuts, headless CLI.
- Voice: macOS voices, local Chatterbox, take-turns calls and dictation (macOS).

**Kept, but needs the user's own third-party key:** Composio (Phase 3), Boat cloud computers,
ElevenLabs/Fish/xAI voices, OpenAI live calls, decision model providers (Jev, OpenRouter, Workers AI),
1Password, HighLevel, Postiz, X research (treg), AI avatar images.

**Cut, because it depends on OpenMausBot's cloud:** Cloud plans and billing, My Cloud and Team Cloud
(people, inbox, reports-to, shared and lent computers), Files sync, the managed tunnel, organization and
admin portal, org library, published pages, `@devs` bug reports, MausBot news feed, PostHog analytics,
OpenMausBot's update checker, Cloud welcome flow, the cloud-home `connector/`. Each one is hidden in the
UI and its server routes return "not available in Muster". Tailscale and custom-domain remote access
stay, since they don't use OpenMausBot's servers.

**Cut, enterprise licence:** see Licensing.

**Phone companion:** the pairing sidecar and the phone web app (PWA) are ported. The native iOS and
Android apps are not in the repo, so native phone pairing is unavailable unless efront builds its own
apps (Later).

## Rebrand

Footprint: about 2,400 strings across 18 locale files, about 500 in UI code, 1,250 in the server, 300
`OMB_*` environment variables, 420 `.openmausbot` path references, 170 `openmausbot://` deep links, the
mascot components and `appId com.openmausbot.app`. Full counts: `architecture.md`.

- **Changed (user-visible):** product name to "Muster Bots", the default bot from "MausBot" to "Muster"
  (name open to change in review), every UI string and locale, the mascot (removed; bots use avatars and
  initials), icons, about and help text, deep links to `muster-bots://` (with `openmausbot://` accepted
  for saved pages), user-agent strings, and URLs (removed or pointed at Muster's site).
- **Unchanged (internal):** `OMB_*` environment variable names, the `window.ogb` bridge name, internal
  module and type names, and the `window.mausbot` page API that saved agent-made pages call, kept as an
  alias beside a new `window.musterBots`. Keeping these internal names makes upstream merges far
  smaller, and users never see them.
- **How:** a re-runnable rebrand script in the fork (`scripts/muster-rebrand.mjs`) does the string,
  locale and asset replacements, plus a CI check that fails if a user-visible "OpenMausBot", "MausBot" or
  "Maus" string comes back after an upstream merge.
- **Look:** a new `muster` skin in `src/lib/skins.ts` that maps OpenMausBot's skin variables to Muster's
  tokens from `src/renderer/src/assets/main.css`: Geist, the monochrome neutral palette, 10px base radius
  and the three elevation levels in `docs/STYLEGUIDE.md`. It follows Muster's light/dark mode and is the
  only skin offered. The Bots tab keeps the existing OpenMausBot layout (sidebar, chat, right panels)
  inside Muster's window frame.

## Composio and the plugin suite

What exists (detail in `composio.md`): raw REST to `https://backend.composio.dev/api/v3.1`, Tool Router
sessions per Composio user, a live toolkit catalog with a curated fallback of 24 apps, up to 5 accounts
per app, per-bot grants (on/off, tool lists, read/write scopes, outbound approvals with a daily cap),
seven permission gates in `server/index.ts:14607-14760`, connect cards in chat, and hosted OAuth with
no callback URL to host.

**Phase 3, bring your own key (decision 1a):**
- Accounts: each user creates a Composio project and a project API key (`ak_…`) with Sessions
  read/write, Toolkits read, and Connected accounts read/write.
- Muster: a "Composio API key" field in Bots settings, stored with Electron `safeStorage` in Muster's
  main process and passed to the sidecar as `COMPOSIO_API_KEY`, matching OpenMausBot's shell
  (`electron/main.mjs:397-419`, `1152-1153`). The server validates it by opening a session.
- The default managed broker URL (`openmausbot-composio.milindsoni201.workers.dev`,
  `electron/managed-composio.mjs:4`) is removed from the fork so no build can send traffic there.
- Code ported unchanged: `server/composio*.ts`, `connector-*.ts`, `outbound-hold.ts`,
  `shared/connector-*.ts`, `shared/outbound.ts`, `PluginsPanel.tsx`, `ConnectorCard.tsx`,
  `ApprovalCard.tsx`, `src/lib/connector-*.ts`. Claude and Codex runs get the stdio bridge as an MCP
  server exactly as upstream does.
- Not available in this mode: app-event triggers (upstream refuses them without a broker).

**Phase 3b, efront broker (decision 1b):**
- Accounts: an efront Composio project and key, a Cloudflare account with one Worker, a D1 database
  and three rate-limit namespaces; Worker secrets `COMPOSIO_API_KEY` and `COMPOSIO_WEBHOOK_SECRET`.
- Hosting: the broker origin (for example `bots-connect.<efront domain>`) and its
  `/v1/composio/webhook` endpoint, registered once with Composio `webhook_subscriptions`.
- Code: port `cloudflare/composio-broker/` and `electron/managed-composio.mjs` with the broker URL
  pointing at efront's Worker; Muster stores the installation token with `safeStorage`.
- Gains: no per-user key, app-event triggers ("when an email arrives…"), shared billing.
- Optional: efront's own OAuth apps and Composio auth configs for branded consent screens.

**Before Phase 3 starts:** check the Tool Router v3.1 session `PATCH` behaviour against Composio's
current API docs (the upstream code notes behaviour dated October 2026), and run
`docs/verification/connected-apps-oauth.md` from the fork against a test project.

Composio is not added to Muster's Extension Hub. The hub's MCP entries can't carry secrets for `http`
transports, and Composio is wired into the bots' own permission gates, so it stays inside Muster Bots.

## Muster changes

| Area | Change | Files |
|---|---|---|
| Flag | `experimentalBots` setting, default off; settings row and search entry in the Experimental pane | `src/shared/types.ts`, `src/shared/constants.ts`, `settings/BotsExperimentalSetting.tsx`, `ExperimentalPane.tsx`, `experimental-search.ts` |
| View | `'bots'` added to `TopLevelView`; `openBotsPage`/`closeBotsPage`; hydrate falls back to `'terminal'` when the flag is off or the platform is unsupported | `src/shared/types.ts:3400`, `src/shared/top-level-view.ts`, `store/slices/ui.ts`, `src/main/active-view-preference.ts` |
| Tab | `ChatModeToggle` generalised to a segmented Chat / Code / Bots control (pill offset from the active index); Bots segment shown only with the flag | `chat-mode/ChatModeToggle.tsx`, `SidebarNav.tsx`, `ChatModeSidebar.tsx` |
| Page | `BotsPage` hosting the webview, with loading, "starting", crash and restart states | `src/renderer/src/components/bots/` |
| Routing | lazy import, sidebar and titlebar handling like chat, page switch | `src/renderer/src/App.tsx:327, 1506, 2004, 2337` |
| Shortcut | `view.bots` keybinding and action-palette entry | `src/shared/keybindings.ts`, `action-palette-invokers.ts` |
| Sidecar | fork, port probe, owner token, readiness probe, supervisor restart, credentials, account env, quit cleanup | `src/main/bots/` (new), `src/main/index.ts` `will-quit` |
| Embedding | `persist:muster-bots` partition, owner header hook, webview exception, bots preload with the `ogb` subset | `createMainWindow.ts`, `browser-session-registry.ts`, `src/preload/bots-preload.ts` (new) |
| Build | download and verify the pinned muster-bots artifact; add it to `extraResources`/`asarUnpack`; boot check | `electron.vite.config.ts`, `config/electron-builder.config.cjs`, a fetch script |
| macOS | entitlements and usage strings for Accessibility, Screen Recording and Microphone (computer control and dictation) | mac build config |
| Notices | OpenMausBot `NOTICE` and third-party licences added to Muster's notices | third-party notices file |
| i18n | new Muster-side keys in all five locales | `src/renderer/src/i18n/locales/*.json` |

All new Muster files follow the 300-line `.ts` / 400-line `.tsx` limits and the design system. New
Bots logic goes in small files under `src/main/bots/` and `src/renderer/src/components/bots/` instead
of growing `App.tsx` or `ui.ts`.

## Phases

Each phase ends with a working, testable build behind the flag. Estimates assume one developer driving
agents; ranges are wide because the fork is large and moves fast.

1. **Phase 0: fork and build pipeline (1 to 2 days).** Create `jefrontv/muster-bots` from the v0.1.133
   tag. Delete `enterprise/`. CI builds `dist-server`, the UI, skills and the per-platform binaries into a
   versioned, checksummed artifact. Add `NOTICE`, `CHANGES.md` and the upstream-merge procedure.
   *Done when* the artifact boots headless and serves `/api/health` (or the equivalent identity route).
2. **Phase 1: host in Muster (3 to 5 days).** Flag, view, three-segment toggle, `BotsPage`, the
   sidecar module, partition, owner header, webview exception, bots preload, account environment, quit
   cleanup. *Done when* a new bot replies through the managed Claude account inside the Bots tab, the
   sidecar stops on quit, and the tab is hidden with the flag off.
3. **Phase 2: rebrand and cloud cut (3 to 5 days).** Rebrand script and CI check, Muster skin,
   onboarding reworded (Meet, then create the default "Muster" bot), all cloud features hidden and their
   routes disabled, telemetry, bug reports and update checker removed. *Done when* a grep of the running
   UI and the packaged artifact finds no user-visible OpenMausBot/MausBot text or domains, and no
   network request leaves for an `openmausbot.com`, `posthog` or `workers.dev` host during a smoke run.
4. **Phase 3: Composio, own key (2 to 3 days).** Key field and storage, broker URL removed, plugin
   panel, connect cards, outbound approvals. *Done when* a bot connects Gmail through Composio's hosted
   page and runs a read tool, and a send is held for approval.
   **Phase 3b: efront broker (3 to 5 days, if chosen).** Worker, D1, webhook registration, triggers.
5. **Phase 4: computers and native helpers (1 to 2 weeks).** Automation browser engine, cua-driver
   local-computer control with macOS permissions, Docker local VM, noVNC viewer, speech helpers,
   Android platform-tools, DuckDB and resvg native modules under Muster's packaging and the glibc 2.31
   floor. *Done when* each computer kind runs one scripted task in a packaged build.
6. **Phase 5: phone companion (3 to 5 days).** Companion sidecar, pairing, PWA. *Done when* the phone
   web app pairs over LAN and sends a message to a bot.
7. **Phase 6 (later, optional): native Muster panels.** Replace OpenMausBot UI panels one at a time
   with Muster components that call the same API through a `window.api.bots` proxy, starting with the
   sidebar and chat thread.

Agents: Phases 0 to 2 are sequential. After Phase 2, Phases 3, 4 and 5 can run in parallel in separate
worktrees, each agent owning one phase. Every merge into `muster` is reviewed (diff read, checks rerun)
before release.

## Upstream tracking

- The fork keeps an `upstream` remote. Merges happen on a schedule (for example monthly) or for a
  specific fix, never automatically.
- After each merge: rerun the rebrand script, the brand-leak CI check, the cloud-host network check,
  and the fork's own test suite; rebuild the artifact; bump the pinned version in Muster.
- Muster pins one artifact version, so an upstream change never reaches users without a Muster release.

## Verification

- Fork CI: upstream vitest suite (minus enterprise and cloud tests that no longer apply), the
  open-source-edition build job, brand-leak check, packaged-server boot test.
- Muster: unit tests for the sidecar lifecycle (fork, port fallback, restart, quit), the view
  sanitising, the toggle, the partition header hook, and the webview exception; `pnpm lint`,
  `typecheck:release`, i18n coverage.
- Manual, in a packaged build: flag off hides everything; flag on starts the sidecar only when the
  Bots tab first opens; Claude and Codex bots reply using Muster's accounts; a routine fires while the
  app is open; Composio connect and approval; computer control permission prompts name Muster.
- Security: a request from another local process to the sidecar port without the token cannot change
  settings or approve a card.

## Risks

1. **Hidden shell duties.** The 46K-line OpenMausBot Electron layer does work the server relies on
   (owner token, credentials, the cua-driver grant, phone secrets). Anything Muster skips degrades
   silently. Mitigation: port the parent contract from `electron/main.mjs` and `server-session.mjs`
   first, and test every `parentPort` message type.
2. **Security.** Local bots run unsandboxed with shell and computer control. A wrong trust setting
   gives any local process owner access. Mitigation: the token contract, the partition-only header,
   and the security check above.
3. **Size and churn.** v0.1.133 is young and fast-moving; the packaged app grows by the server, UI,
   browser engine, cua-driver and native modules (measure in Phase 0). Mitigation: pinned artifacts,
   scheduled merges, re-runnable rebrand.
4. **Duplicate agent handling.** OpenMausBot's Claude and Codex drivers run their own processes and
   sessions beside Muster's terminals and chat. Mitigation: shared managed accounts; separate session
   storage under the bots data directory.
5. **Composio API drift.** The upstream code relies on Tool Router v3.1 behaviour. Mitigation: the
   pre-Phase 3 check.

## Later

- Bots on SSH hosts (run the sidecar remotely, tunnel the UI).
- Windows support.
- Native Muster phone apps.
- Muster-run replacements for cut cloud features if wanted (shared team bots, published pages).
- Opening a Muster Bots thread from Muster's Chat tab, and handing a bot's work to a Code worktree.
