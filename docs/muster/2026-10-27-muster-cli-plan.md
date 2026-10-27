# Muster CLI: rename, `muster .`, styled output

Four pieces of work, shipped in this order. Each one is a separate commit and can be released on its own.

1. Rename the shell command from `orca` to `muster` on every platform.
2. Add `muster .` / `muster open [path]`: focus the project when Muster already knows it, import it when it does not.
3. Give every human-readable CLI output a consistent styled look. `--json` output stays byte-for-byte unchanged.
4. Add `muster annotate <path>`: plan review from the shell, as a fallback when the MCP tool call is unreliable.

## Current state

- The app bundle already ships the launcher as `bin/muster` (mac, Linux) and `bin/muster.cmd` / `bin/muster.exe` (Windows) — `config/electron-builder.config.cjs:281-401`.
- The installer still registers the command as `orca` (`/usr/local/bin/orca`, or `~/.local/bin/orca` when `/usr/local/bin` is missing) and `orca-ide` on Linux — `src/main/cli/cli-installer.ts:29-112`. Dev builds register `orca-dev`.
- Help, usage strings, examples, bundled skill guides, agent preambles and renderer copy all say `orca` (about 38 non-test files with `orca <subcommand>` strings, 18 with `orca-dev`, 34 with `orca-ide`, 21 with `orca-cli`).
- `orca open` launches the app and waits for the runtime. It takes no path.
- `repo.add` (`src/main/runtime/orca-runtime.ts:15674`) takes `kind: 'git' | 'folder'`, applies the LocalWP `app/public` remap, and returns the existing repo when the path is already registered. `kind: 'git'` throws on a non-git folder.
- `worktree.activate` focuses a worktree in the window through `activateManagedWorktree`.
- No CLI output is styled. Formatters in `src/cli/*-format.ts` (about 1,000 lines) return plain strings.
- Electron 43 ships a Node with `util.styleText`, so styling needs no new dependency.

On this machine: `/usr/local/bin/orca` is a dangling symlink to the deleted `/Applications/Orca.app`, and `~/.local/bin/muster` is an unrelated terminal multiplexer (`muster-v0.1.92`).

## 1. Rename `orca` → `muster`

### Command names

| Build | Old | New |
| --- | --- | --- |
| Packaged mac | `orca` | `muster` |
| Packaged Linux | `orca-ide` | `muster` (the `orca-ide` name existed only to avoid GNOME Orca's `/usr/bin/orca`; `muster` has no such clash) |
| Packaged Windows | `orca.cmd` on PATH | `muster.cmd` on PATH |
| Dev | `orca-dev` | `muster-dev` (`package.json` already declares this bin) |

No `orca` alias. Old `orca …` invocations stop working after the update.

### Installer (`src/main/cli/cli-installer.ts`)

- Command name constants become `muster` / `muster-dev`. `LEGACY_LINUX_COMMAND_NAME` and the Linux bare-`orca` dispatcher (`linux-bare-orca-dispatcher.ts`) are deleted.
- Migration on first launch after update: remove an old `orca`, `orca-ide` or `orca-dev` entry ONLY when it is a symlink or launcher that points into a Muster bundle or this checkout, or is a dangling symlink. Never remove a real file or a link into another app.
- Collision guard: when the target path (`/usr/local/bin/muster` or `~/.local/bin/muster`) already holds something that is not Muster's launcher, do not overwrite it. Settings shows "Another `muster` command is installed at <path>" with a Replace button that needs a confirm.
- WSL registration (`wsl-cli-installer.ts`, `wsl-cli-registration-reconciliation.ts`) and the SSH remote launcher (`ssh-remote-cli-launcher.ts`, `ssh-relay-session.ts`, `relay.ts`) install and resolve `muster` instead of `orca`. Remote hosts that already have `orca` get the same migration rule.

### Strings that change

- `src/cli/help.ts`, every `src/cli/specs/*.ts` usage and example, `agent-context.ts`, error messages that print a command.
- Bundled skill guides (`src/cli/bundled-skill-guides.ts` and `skills/orca-cli`, `skills/orca-linear`, `skills/orca-per-workspace-env`): command text becomes `muster`, skill folders and names become `muster-cli`, `muster-linear`, `muster-per-workspace-env`.
- Agent preambles and shims that tell agents which command to run: `orchestration/preamble.ts`, `claude-agent-teams-shim-env.ts`, `tui-agent-config.ts`, `agent-feature-install-commands.ts`, `command-code-managed-script.ts`, `ipc/pty.ts`, `wsl-orca-env.ts`, `linux-terminal-orca-cli-shim.ts`.
- Renderer copy that shows a command (`AddRemoteHostFields.tsx`, `RuntimeEnvironmentsPane.tsx`, `MobileSettingsPane.tsx`, `mobile-platform-copy.ts`, the source-control agent action plans, etc.). Locale files es/ja/ko/zh are regenerated with `bootstrap:locale-catalog`.

### What stays `orca`

These are functional identifiers, not the command name, and renaming them would break pairing, saved state or remote hosts: `orca://` pairing codes, `orca.yaml`, `~/.orca`, `X-Orca-*` headers, `ORCA_*` env vars (including `ORCA_CLI_COMMAND`, whose value becomes `muster`), `orca.*` storage keys, and `onorca.dev` endpoints. The internal class and file names (`orca-runtime.ts`, `launchOrcaApp`) stay too; renaming them is churn with no user-visible effect.

### Skills installed outside the app

`ORCA_SKILLS_REPOSITORY_URL` clones the public `stablyai/orca` repo, whose `orca-cli` skill says `orca`. After the rename, that skill would tell agents to run a command that no longer exists. Muster's skill install switches to the bundled guides (`muster skills get muster-cli`) so the installed skill matches the installed CLI. An already-installed `orca-cli` skill in `~/.claude/skills` is replaced by `muster-cli` on the next skill install; Muster does not delete it unprompted.

### Tests

- `vocabulary-policy.test.ts` gains a rule: no `orca <subcommand>` in user-facing CLI strings.
- `registry-parity.test.ts`, installer tests (mac `/usr/local/bin` present and absent, Linux, Windows PATH, dev), migration tests (dangling link removed, foreign file kept, Muster link replaced), collision guard test.

## 2. `muster .` and `muster open [path]`

### Behaviour

| Invocation | Result |
| --- | --- |
| `muster open` | Unchanged: launch Muster and wait for the runtime. |
| `muster .` | Same as `muster open .`. |
| `muster open <path>` | Launch if needed, then open the project at `<path>` (rules below). |
| `muster <path>` | Only when `<path>` starts with `.`, `/`, `~` or is an existing directory, so a typo like `muster stauts` still reports an unknown command. |

Opening a path:

1. Resolve to an absolute, real path. `~` expands. A remote runtime (`--environment`, pairing code) requires an absolute path, as `repo add` already does (`resolveRepoPathArgument`).
2. Already known: if the path is a registered repo, one of its worktrees, a folder workspace, or inside any of them, activate that workspace. The deepest match wins, so a worktree beats its parent repo.
3. Not known: import it. A git work tree imports as `git`; anything else imports as `folder`. The LocalWP `app/public` remap applies as it does for `repo add`. Then activate the new project's primary workspace.
4. Bring the Muster window to the front (macOS `app.focus({ steal: true })`, `BrowserWindow.show()` + `focus()` elsewhere).
5. A path that does not exist, is a file, or cannot be read fails with the reason and the path. Nothing is imported.

### Runtime

- New RPC `workspace.openPath { path, executionHostId? }` → `{ outcome: 'focused' | 'imported', kind: 'git' | 'folder', repo, worktree }`. It wraps the existing `addRepo` dedupe and `activateManagedWorktree`. The import and activation run in the runtime so `muster .` works the same from a local shell, a Muster-managed terminal, WSL, and an SSH host through the relay.
- `addRepo` gains `kind: 'auto'` (git when `isGitRepo`, else folder) so the CLI does not guess.
- From an SSH host's terminal the path is on that host: the relay passes the host's execution id, and the import uses that host. Tested against a real SSH workspace.

### CLI

- `src/cli/specs/core.ts`: `open` accepts an optional positional `[path]`; dispatch maps a bare path-like first argument to `open`.
- `src/cli/handlers/core.ts`: after launch, call `workspace.openPath`.
- `--json` returns the RPC result inside the usual envelope.

## 3. Styled output

### Rules

- Styling turns on only when stdout is a TTY, `NO_COLOR` is unset, and `TERM` is not `dumb`. `FORCE_COLOR=1` forces it on, `FORCE_COLOR=0` off. Pipes, agents reading output, and `--json` get plain text exactly as today, so agent parsing and existing tests do not change.
- One module, `src/cli/cli-style.ts`, owns every colour and glyph. Formatters call its helpers; no formatter writes an escape code.
- Colours come from a small palette mapped to the app's tokens: accent, success, warning, danger, muted. Glyphs: `✓` success, `✗` failure, `●` live, `○` idle, `›` pointer. On Windows consoles without Unicode support the glyphs fall back to ASCII.

### What each surface gets

- **Help**: a one-line header (`muster` + version), bold section titles, commands in accent with aligned summaries, examples prefixed with a muted `$`.
- **Results**: a status line first (`✓ Opened muster-ui` / `✓ Imported ~/Sites/foo as a folder project`), then aligned key/value details in muted labels.
- **Lists** (`repo list`, `worktree list`, `worktree ps`, `terminal list`, `automations list`, `project list`): column-aligned tables with a muted header row, truncated to the terminal width, with state shown as coloured glyphs.
- **Waiting** (`open`, `terminal wait`, `serve` startup): a spinner on stderr while waiting, TTY only, replaced by the final status line.
- **Errors**: `✗` + the message in danger colour, then muted lines for cause and fix when the error carries them (`runtime_unavailable` → "Muster isn't running. Run `muster open`.").

### Tests

- `cli-style.test.ts`: on/off detection for TTY, `NO_COLOR`, `FORCE_COLOR`, `TERM=dumb`.
- Existing `format*.test.ts` run with styling off and must pass unchanged. New snapshot tests run each formatter with styling forced on.

## 4. `muster annotate <path>`

A CLI route into plan review, for agents whose MCP call to `annotate_plan` / `collect_plan_review` drops or times out. It uses the same queue as the MCP tools (`openPlanAnnotation` / `awaitPlanAnnotationResult` in `src/main/sites/plan-annotation-requests.ts`), so a review opened one way can be collected the other.

### Behaviour

| Invocation | Result |
| --- | --- |
| `muster annotate <path>` | Opens the plan in Muster's review window and blocks until a decision, then prints it. |
| `muster annotate <path> --timeout <seconds>` | Blocks at most that long (default 540, under Claude Code's 10-minute Bash cap). On timeout prints the review id and the resume command, exits 2. |
| `muster annotate --resume <review-id>` | Waits on an open review again. Same timeout and exit codes. |
| `muster annotate <path> --detach` | Opens the review, prints the review id, exits 0 without waiting. |

- `<path>` must be an existing `.md` file. Relative paths resolve against the shell's cwd. A folder is refused with "pass the plan file, not its folder".
- Launches Muster first if it is not running, like `muster open`.
- Over SSH or WSL the path is read on the host the shell runs on and the content is sent with the request, so the review window works when the file is not on the Mac.

### Output

Human output: a status line (`✓ Approved`, `✓ Approved with notes`, `✎ Annotated, revise and resubmit`, `○ Dismissed`), then the notes and any direct edits as Markdown, the same text the MCP tool returns. `--json` prints `{ review_id, decision, notes, edits }`.

Exit codes, so an agent can branch without parsing text:

| Code | Meaning |
| --- | --- |
| 0 | approved, approved_with_notes, or dismissed (proceed) |
| 1 | error (bad path, Muster unreachable) |
| 2 | still pending after `--timeout` (run `--resume`) |
| 3 | annotated (revise, then run `muster annotate` again) |
| 4 | review id unknown or expired (open a new review) |

### Runtime

New RPCs `planReview.open { path?, content?, title? }` → `{ reviewId }` and `planReview.await { reviewId, waitMs }` → `{ status, result? }`, both thin wrappers over the existing functions. The runtime client's per-call timeout is raised for `planReview.await` only.

### Agent guidance

The bundled `muster-cli` skill and the plan-review section of agent preambles say: use the MCP tools when they respond, and fall back to `muster annotate <path>` when a call errors or hangs. The user's global CLAUDE.md fallback (Plannotator) can then point at `muster annotate` first.

### Tests

Handler tests for each exit code, `--resume` against a review opened through the MCP path, folder and missing-file refusals, timeout returning 2 with the id.

## Local cleanup on this machine (no code)

1. `rm /usr/local/bin/orca` (dangling link to the deleted Orca.app).
2. Decide what happens to `~/.local/bin/muster` (the unrelated multiplexer): rename it, or remove it if unused. Until then the installer's collision guard leaves it alone.

## Estimates

- Rename: about 1 day, mostly string churn plus installer migration and tests.
- `muster .`: about half a day, plus an hour testing over SSH and WSL.
- Styled output: about 1 day across 6 formatter files and help.
- `muster annotate`: about half a day.

## Verification

1. `pnpm typecheck`, `pnpm lint`, targeted `vitest` for `src/cli` and `src/main/cli`.
2. Packaged build installed to `/Applications`, then: Settings → install CLI, `which muster`, `muster --help`, `muster status`.
3. `cd ~/Sites/<known repo> && muster .` focuses it; `cd /tmp/new-folder && muster .` imports it as a folder; a git repo not yet added imports as git.
4. `muster repo list | cat` shows plain text; `muster repo list` in a terminal shows the styled table; `NO_COLOR=1 muster repo list` is plain.
5. An agent in a Muster terminal follows its preamble with `muster …` commands.
