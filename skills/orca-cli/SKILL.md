---
name: orca-cli
description: >-
  Use the public `orca` CLI to operate Muster-managed worktrees, folder contexts,
  terminals, repos, automations, worktree comments, and the browser embedded
  inside the Muster app. Use when the user says "$orca-cli", "use orca cli",
  "Muster worktree", "child worktree", "cardStatus", "spawn codex/claude in a worktree",
  "read/wait/send Muster terminal", "terminal send", "full handoff", "handover",
  "give this to another agent", "another worktree", "Muster browser", or
  "control the browser inside Muster". Prefer this over raw `git worktree`, ad hoc
  PTYs, Playwright, or Computer Use when the task touches Muster-managed state.
  Use Computer Use for browser windows, webviews, or desktop UI outside Muster's
  embedded browser.
---

# Muster CLI

This file is a discovery stub, not the usage guide. The full, version-matched Muster CLI
reference is served by the `orca` binary itself — kept out of this file on purpose so it
can never drift from the binary that will actually run your commands.

Engage Muster whenever its running editor/runtime is the source of truth: Muster-managed
worktrees, folder contexts, terminals, repos, automations, worktree comments, and the
browser embedded inside the Muster app. Triggers include "$orca-cli", "Muster worktree",
"child worktree", "spawn codex/claude in a worktree", "read/wait/send Muster terminal",
"full handoff" / "handover" / "give this to another agent", and "control the browser
inside Muster". Use plain shell tools when Muster state does not matter.

## Resolve the CLI for this session

Choose the executable once and reuse it for every later command:

- If the `ORCA_CLI_COMMAND` environment variable is set, use its value. Muster exports this
  for managed WSL sessions.
- Otherwise, in a dev checkout whose session exposes `ORCA_DEV_REPO_ROOT`, use `orca-dev`.
- Otherwise, on Linux outside a Muster-managed terminal, use `orca-ide`. Never run bare
  `orca` there — outside Muster's terminals it normally resolves to the
  GNOME Orca screen reader (`/usr/bin/orca`) and starts speech on the user's machine.
- Otherwise, use `orca`.

Below, `ORCA` is a placeholder for the executable you resolved. Substitute it before
running anything; do not create a shell variable or run `ORCA` literally. This works the
same way in POSIX shells, PowerShell, and cmd.exe.

If the selected executable cannot run, report its exact error and stop. Do not fall through
to another executable, which could silently target a different Muster build.

## Load the full guide before running Muster commands

```text
ORCA skills get orca-cli
```

That prints the complete, version-matched guide for the exact binary that will handle your
next commands — worktrees, handoffs, terminals, automations, and the built-in browser.
Read it first, then run the specific command you need.

Don't guess subcommands or flags from memory or from a cached copy of this stub. They
change between Muster releases, and this file deliberately no longer lists them. Confirm the
app is up with `ORCA status --json` (start it with `ORCA open --json` if needed), and
prefer `--json` for agent-driven calls.

## If an older Muster does not recognize `skills get`

Use this fallback only when the selected binary explicitly reports that `skills get` is an
unknown command. Another failure is not proof of an older binary; report it rather than
guessing or changing executables. For a confirmed pre-guide binary, use only this bounded,
read-only bootstrap to orient. Do not dead-end and do not invent commands:

```text
ORCA status --json
ORCA worktree ps --json
ORCA terminal list --json
```

Then tell the user that updating Muster restores the full, version-matched guide via
`ORCA skills get orca-cli`. Beyond these commands, ask the user rather than guessing a
command surface this older binary may not support.
