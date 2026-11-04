# Bots set up sites through the Set up dialog

Follows `2026-11-04-bots-project-setup-tools-plan.md`. That plan gave agents one tool and one approval card per step. Testing "set up the aidc project" with Bob showed the result feels wrong.

## What happened in the test

| Step | What Bob did | Problem |
|---|---|---|
| 1 | `create_project`, approval card | fine |
| 2 | `get_setup_job`, then `Bash: sleep 45`, then poll again | `get_setup_job` cannot wait, so the bot sleeps in a shell |
| 3 | `register_site`, second approval card | two cards for what the user sees as one step |
| 4 | Stopped: "haven't configured any environments" | never asked for the link or the password |
| 5 | User opened the `muster://` link, and the old "Set up aidc" dialog appeared over it | two setup flows that do not know about each other |

Muster already has the flow the user expects. `SiteSetupDialog` takes a source (repo picker, `muster://` link, or Finish setup), shows one review, and runs clone, register, serve, HTTPS and import behind one "Set up site" button. It has a progress bar and can be minimized to the status bar. The agent tools went around it.

## Goal

The user says "set up aidc". The Set up dialog opens in Muster, already filled in with what the bot found. The user checks it, clicks the link (or pastes it) for the credentials, and presses one button. The bot waits quietly and reports when it's done. One window, one decision, no sleeping.

## Design

### 1. One tool opens the dialog: `open_site_setup`

- Args: `clone_url`, `path` or `site` (exactly one). Optional non-secret hints: `environment`, `hostname`, `username`, `root_path`, `live_domain`, `branch`, `stack`, `domain`, `import`.
- Opens `SiteSetupDialog` with a new source `{ kind: 'agent', ... }`, prefilled the same way a link prefills it. The header says which agent started it ("Bob set this up for you").
- No approval card. The dialog's "Set up site" button is the consent, which is the dialog's existing contract (nothing is written before it).
- Returns `setup_id` at once.
- If a setup dialog is already open, the call refuses with "Muster is already setting up <name>" and the bot says so, instead of stacking a second dialog.

### 2. The bot waits without sleeping: `wait_for_site_setup`

- `setup_id`, `wait_seconds` (up to 110). Long-polls like `collect_setup_approval`.
- Returns early whenever the state changes: `reviewing`, `running` (with the step and percent, e.g. `clone 45%`), `done` (with `site_id`, `project_id` and what each step did), `cancelled` or `failed` (with the step and reason).
- `get_setup_job` gains the same `wait_seconds`, so `set_up_local_site` polling stops sleeping too.
- The skill tells the bot to keep calling `wait_for_site_setup` and send at most one short update per step ("Cloning, about halfway"), not a message per poll.

### 3. Credentials live in the dialog

- The review gets a Credentials row: "Click or paste your muster:// link, or type the password".
- A link opened while an agent's setup dialog is open goes into that dialog: it fills host, user, root path, live domain, branch and the password. It does not open a second dialog. This reuses the opened-link handoff built today, aimed at the dialog instead of the password card.
- The dialog checks the clipboard when it gets focus, as the password card does now, and offers "Use the link on your clipboard".
- The password stays in main and goes to the keychain on "Set up site". The bot only learns that a password is stored.

### 4. Progress the user can see

- The dialog's run view already shows each step with a progress bar. Agent setups use the same runner, so a clone shows "Receiving objects 45%" inside the dialog.
- If the user minimizes it, the status bar item carries the progress (existing behaviour).
- The separate toast added today is only used for jobs that run outside the dialog (`set_up_local_site`).

### 5. What happens to the step tools

- New sites: the skill uses `open_site_setup` only. `create_project` with `clone_url` followed by `register_site` stops being the path for "set up a site".
- `create_project` stays for non-site projects (a plain repo or folder in the Code sidebar) and keeps its card.
- `configure_site`, `update_project`, `create_worktree`, `remove_project`, `request_site_secret` and `import_site_config` stay for changes to something that already exists, each with its card.
- `register_site` stays for a folder that is already on disk and needs no setup run.

### 6. Small fixes in the same pass

- Done already: the minimize button on the setup dialog is aligned with the close button (same 28px box, one slot left).
- The setup dialog's minimize and close icons get tooltips that say what each does.
- The bot's final message follows the skill's two-line report: what exists, then the one thing left to do.

## Out of scope

- Agent Local asking for a password for every new site's HTTPS certificate. That needs a local root CA in the `agent-local` repo, and gets its own plan.
- Bots receiving messages from other agents.

## Questions

1. When a bot opens setup, should the dialog appear straight away over whatever you are doing (the way a link does now), or should Muster show a toast, "Bob prepared setup for aidc", with a Review button? Recommendation: open straight away when Muster is focused, and show a notification when it is not.
2. Should the review start with Serve and Import turned on, using the dialog's normal defaults, or only with what the bot was asked to do?

## Work

| Part | Files | Estimate |
|---|---|---|
| `agent` source, prefill, header | `site-setup-choices.ts`, `SiteSetupHost.tsx`, `SiteSetupDialog.tsx`, `use-site-setup-review-data.ts` | 2 h |
| Setup registry in main, bridge routes, `open_site_setup`, `wait_for_site_setup` | new `site-setup-agent-requests.ts`, `site-write-bridge-setup-routes.ts`, MCP tools | 2 h |
| Credentials row, link and clipboard handoff into the dialog | `SiteSetupReview.tsx`, `site-setup-link-handoff.ts`, `site-bind.ts` | 1.5 h |
| `get_setup_job` long-poll, skill rewrite, docs | MCP tools, fork skill, `docs/reference/muster-sites-setup-tools.md` | 1 h |
| Tests and a live run of "set up aidc" | | 1.5 h |

About 8 hours in total.
