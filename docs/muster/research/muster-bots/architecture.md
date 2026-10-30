# OpenMausBot v0.1.133 runtime architecture (research notes)

Read-only review of `milind-soni/OpenMausBot` at tag v0.1.133 (commit d280d4433e). Nothing was run.

- Size: server about 212K non-test lines (`server/index.ts` alone is 15,818 lines), UI about 125K lines in 850 files, Electron shell 162 modules / about 46K lines (`electron/main.mjs` 3,247 lines; 66 modules are cloud, managed, companion or org code).
- Server child: `utilityProcess.fork` (`electron/main.mjs:1162`) of `resources/server/desktop-entry.mjs`. Config via env: `OMB_DATA_DIR`, `OMB_PORT`, `OMB_STATIC_DIR`, `OMB_DESKTOP_PARENT=1`, decrypted credentials (`main.mjs:1132-1160`). Supervisor `electron/server-supervisor.mjs`, readiness `server-boot-probe.mjs`.
- Ports 8799, 18799, 28799 (`electron/desktop-ports.mjs:2`); binds 127.0.0.1 (`server/index.ts:15688`).
- Parent contract over `process.parentPort` (`index.ts:1451`, `1515-1527`): 32-byte owner token, phone secrets, trusted-approval mode, local-computer grant, Composio broker credentials.
- Auth: loopback Host and Origin or a paired session (`server/request-auth.ts`). Desktop owner actions need header `X-OpenMausBot-Desktop-Owner`, added by Chromium on `defaultSession` requests to the server port (`electron/server-session.mjs:34-48`). Without `OMB_DESKTOP_PARENT`, bare loopback gets owner trust.
- UI is served by the server (`OMB_STATIC_DIR`); the window loads `http://127.0.0.1:<port>` (`main.mjs:2254`). REST under `/api/*` (67 segments used by the UI), SSE `GET /api/events`, WebSockets for browser streams, noVNC and shared computers.
- Preload bridge `window.ogb` (`electron/preload.cjs:562`), about 206 IPC calls, used in 144 UI files mostly with optional chaining.
- Other children: phone companion, speech helper, cua-driver daemon, cloudflared (from Electron); one CLI process per thread, MCP proxy children via `ELECTRON_RUN_AS_NODE=1` (`server/drivers/turn-mcp.ts:45`), agent-browser/Chrome, Docker/Podman containers, SQLite search worker (from the server).
- Drivers: Claude = `claude` CLI stream-json, one long-lived process per thread with `--resume`, `--mcp-config`, `--permission-mode` (`server/drivers/claude.ts`). Codex = `codex app-server` JSON-RPC (`server/drivers/codex.ts`). ACP agents in `drivers/acp/`, HTTP providers. CLIs are not bundled.
- Bot-box sandbox is Linux-only and off locally; local bots run unsandboxed.
- Browser backends `local`, `my-chrome`, `cdp-url`; engine binary downloaded from GitHub releases.
- Computers: this machine via Electron-hosted cua-driver (macOS permissions), Docker/Podman Cua image, VPS over SSH, Boat (paid remote).
- Data dir `~/.openmausbot` (`OMB_DATA_DIR`): `config.json`, `bots.json`, `groups.json`, SQLite via `node:sqlite` (`messages.db`, `runtime.db`, `notes.db`, `state.db`, `cookies.sqlite`); no migration framework. DuckDB only for data tools.
- Secrets: Electron `safeStorage` `credentials.bin` passed as env; sealed login store; per-bot secret vault; lazy 1Password SDK.
- Packaged resources: `ui`, `server` (esbuild ESM), `companion`, `skills`, Android platform-tools, per-platform `cua-driver`, `cloudflared`, `agent-browser`, native `duckdb`, `@resvg/resvg-js`, `@1password/sdk` (lazy, optional); macOS Swift speech/recorder helpers and TCC strings.
- Node: `engines.node >=24`; packaged server already runs under Electron's Node (Electron ^43.5); Muster is Electron ^43.1.
- Cloud dependencies: `cloud.openmausbot.com`, `accounts.openmausbot.com`, `admin.openmausbot.com`, the author's Composio broker Worker, bug reports, PostHog (on by default, hard-coded key), GitHub update check, team library fetch, models.dev.
- `enterprise/`: optional dynamic import only (`server/enterprise.ts:119-140`); the bundler skips it when the folder is missing. `brand.json` white-label is gated on the enterprise `whitelabel` entitlement (`server/brand.ts`).
- Brand footprint: 2,413 occurrences in 18 locale files; 507 in UI code; 1,246 in server; 257 in Electron; 146 in shared; 313 unique `OMB_*` env vars; 423 `.openmausbot` path refs; 169 `openmausbot://` deep links; `window.ogb` (445 refs); `window.mausbot` page API used by saved agent-made pages; `appId com.openmausbot.app`.
- Agent recommendation: sidecar the built server, embed its UI; merging into Muster's main process is impractical (import-time globals, top-level await, monolithic index, parentPort coupling); a native UI rewrite is 850 files and can happen panel by panel later.
