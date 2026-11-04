# Project and site setup tools for agents (Bots)

Status: approved with notes, 2026-11-04 (review 2a7300b5). Branch: `feature/muster-bots`.

## 1. Goal

A bot in the Bots tab can set up work in Code view the way a person does today:

- create or import a project (clone a repo, or adopt a folder already on disk) and put it in the sidebar;
- register it as a site and fill in its configuration: environments, SSH, remote root, live domain, toggles;
- set up the local site (LocalWP, DDEV or Agent Local) and run the first import;
- bring in existing configuration from ocsites or a `muster://` bind link.

Everything is delivered as new `muster-sites` MCP tools, so any agent (Bots, Claude Code in a terminal, Codex) gets them. Bots already loads `muster-sites`: the user-level entry in `~/.claude.json` points at the packaged app's `site-mcp-shim.js`, and the fork's `claudeUserMcp` is on by default.

## 2. What exists today

| Capability | Where it lives now | Reachable by an agent? |
|---|---|---|
| List, read and edit sites, environments, toggles, custom steps | `sites/mcp/*` tools | Yes |
| Create, rename, duplicate, delete an environment | `site-mcp-env-tools.ts` | Yes |
| Run import and deploy, job status, logs | `site-mcp-run-tools.ts`, `site-mcp-job-tools.ts` | Yes |
| Add a repo by path, clone, create, list, remove | runtime RPC `repo.add`, `repo.clone`, `repo.create` (used by the `muster` CLI) | Only through the CLI, not MCP |
| Create a worktree | runtime RPC `worktree.create` | Only through the CLI |
| Create or adopt a site record at a path | `sites:create` → `site-create.ts` `adoptOrCreateSite` | No (GUI IPC) |
| Link sites to sidebar repos | `sites:linkRepo`, `sites:linkRepos`, `sites:addDiscoveredToSidebar` | No |
| Clone sources (Bitbucket, GitHub) | `siteCloneSources:providers`, `siteCloneSources:repos` | No |
| Guided setup planner ("what can this site still do, and what blocks each stage") | `siteSetup:plan` → `site-setup-plan.ts` | No |
| Site roots and folder discovery | `siteRoots:*` → `site-candidate-discovery.ts` | No |
| Local stack detect, start, migrate, set domain | `siteStacks:*`, `localwp-site-creation.ts`, `ddev-project-setup.ts`, `agent-local-*` | No |
| ocsites import | `sites:importFromOcsites` | No |
| Bind links (staged, user confirms) | `siteBind:*` → `site-bind-intake.ts` | No |
| Store SSH or DB password | `sites:setSecret` → keychain via `safeStorage` | No, by design |

So the work is mostly exposure: the operations exist and are tested behind GUI IPC. The new part is the access model around them.

## 3. Access model

### 3.1 A setting, off by default

New setting under Settings → Sites: "Let agents create and set up projects". Off by default.

- Off: the new write tools are absent from `tools/list`. Hidden rather than refused, so a model does not try spelling variants. The new read tools stay available whenever the sites MCP is exposed to agents (`isSitesMcpExposedToAgents`).
- On: the write tools appear. Each one still passes through the approval gate below.

### 3.2 Approval in the Muster window

Writes that touch disk, a local stack or a remote host are staged, not applied. This reuses the shape of `site-bind-intake.ts`, which already stages an untrusted `muster://` link until the user confirms it.

1. The tool posts the request to the GUI over the existing write bridge (`site-write-bridge-server.ts`, new route `/approval/request`).
2. Muster shows an approval card: the agent's client name (from `site-mcp-client-identity.ts`, shown as information only), the action, and exactly what will be written (target path, repo URL, site name, environments, stack, domain).
3. The user picks Approve, Approve for this site (covers further config edits on that site until Muster restarts), or Deny.
4. The tool waits like `collect_plan_review` does: it returns a `request_id` immediately, and `collect_setup_approval` returns `pending`, `approved` or `denied`. A tool call never holds the dispatch chain while a person decides (`concurrent: true`).

No GUI running means no approval, so every elevated tool refuses with "Open Muster to approve this." The keychain is also only reachable from the GUI process.

### 3.3 Secrets stay out of the model

The current rule stays: passwords are never returned and never accepted as tool arguments. A new `request_site_secret` tool opens a password prompt in Muster for one site, environment and kind (`ssh` or `db`). The user types the value there; it goes straight to `setSiteSecret`. The agent learns only that the secret is now present. Key-based SSH (`sshUseAgent`) needs no prompt at all.

### 3.4 What is never exposed

- Deleting files or folders on disk. `remove_project` only takes a project out of the sidebar, matching `repos:remove`.
- Reading secret values.
- Running anything against a live environment without the existing run guard (`site-run-plan.ts`).

## 4. New tools

Read tools (available whenever the sites MCP is exposed):

| Tool | Wraps | Returns |
|---|---|---|
| `list_projects` | runtime `repo.list` | Sidebar projects with path, kind (git or folder) and linked site |
| `list_clone_sources` | `listCloneSourceProviders`, `listCloneSourceRepos` | Connected providers and their repos (Bitbucket, GitHub) |
| `discover_site_folders` | `discoverSiteCandidates` + `describeConfiguredSiteRoots` | Folders under the site roots that are not yet sites |
| `get_setup_plan` | `buildSiteSetupPlan` | Each setup stage, its state and what blocks it. The agent follows this instead of guessing the order |
| `detect_local_stack` | `siteStacks:detect` logic | Which stack serves the folder, if any, and which stacks are installed |

Write tools (setting on, approval per call unless noted):

| Tool | Wraps | Notes |
|---|---|---|
| `create_project` | runtime `repo.clone` (blobless opt-in, as site setup does) or `repo.add` | Inputs: `clone_url` or `path`, `parent_dir` (defaults to the primary site root), `name`. Progress through the job tools |
| `register_site` | `adoptOrCreateSite` + `sites:linkRepo` | Adopts an existing record at the path instead of duplicating it |
| `configure_site` | existing `set_deployment_fields`, `set_deployment_toggles`, `create_environment` | One staged batch so the user approves the whole config once. The existing per-field tools keep working as now |
| `set_up_local_site` | `addLocalWpSite`, `runDdevSetup`, Agent Local attach | Long running; returns a job id. Refuses if a stack already serves the folder |
| `import_site_config` | `importOcsitesConfig` + `applyOcsitesImport`, or bind-link staging | Shows the import report in the approval card before applying |
| `request_site_secret` | `setSiteSecret` via a GUI prompt | No approval card; the prompt is the approval |
| `add_site_root` | `addConfiguredSiteRoot` | Approval |
| `create_worktree` | runtime `worktree.create` | Approval only on the first call per project |
| `remove_project` | `repos:remove` | Sidebar only, never deletes files |
| `collect_setup_approval` | approval queue | Polls a staged request, like `collect_plan_review` |

All writes go through the bridge so the GUI's in-memory state stays the owner. The current fallback (write the data file directly when no GUI runs) does not apply to these tools, because they need the approval card.

## 5. Bots side (fork)

- No transport work: Bots already gets `muster-sites`.
- `cwd` for a bot is its own workspace, not a site. Site-scoped tools already take `site`; tool descriptions for the new tools say so plainly.
- Add a skill to the fork's bundled skills, "Set up a Muster project". It names the order: `get_setup_plan`, then `create_project` or `register_site`, then `configure_site`, `request_site_secret`, `set_up_local_site`, and the first `run_import_functions` after `preview_run`.
- The approval card is in the Muster window, so a bot's reply says "Approve it in Muster" when a tool returns a pending request. The Bots tab can raise a toast so the user does not need to switch tabs (phase 4).

## 6. Phases

1. **Approval queue and setting (1.5 days).** The setting, the `/approval/request` and `/approval/collect` bridge routes, the approval card in the renderer, the `collect_setup_approval` tool, and the hidden-when-off tool filter. Done when a stub write tool round-trips approve and deny in the running app.
2. **Read tools (1 day).** `list_projects`, `list_clone_sources`, `discover_site_folders`, `get_setup_plan`, `detect_local_stack`. Done when a bot can describe what a fresh site still needs.
3. **Projects and sites (2 days).** `create_project`, `register_site`, `configure_site`, `add_site_root`, `remove_project`, `create_worktree`. Done when a bot clones a Bitbucket repo, registers it, fills in two environments, and it appears in the Code sidebar.
4. **Secrets, local stacks and imports (2 to 3 days).** `request_site_secret`, `set_up_local_site` for LocalWP, DDEV and Agent Local, `import_site_config`, and the Bots-tab toast. Done when a bot takes a repo from nothing to a running local site with its database imported.
5. **Skill, docs and end-to-end test (1 day).** The fork skill, tool docs, and one scripted end-to-end run against a throwaway repo.

Total: about 7.5 to 8.5 days.

## 7. Constraints carried from AGENTS.md

- SSH and remote hosts: phase 3 creates projects on the local host only. `create_project` takes an optional `host` that maps onto the existing project host setups (`project setup-clone`) so an SSH host can follow without a schema change.
- Folder workspaces: `create_project` with a plain folder path registers a folder project; no git assumption.
- Git 2.25 baseline: clones reuse the existing clone code, including its blobless fallback.
- Providers: clone sources cover Bitbucket and GitHub through the existing seam; GitLab is not in that seam today and stays out of scope.
- Cross-platform: paths through `path.join`, no shell-specific commands in the new tools.

## 8. Tests

- Tool table tests against the fake context (`site-mcp-fake-context.ts`), one per tool, including the hidden-when-off case.
- Bridge tests for the approval routes: approve, deny, timeout, GUI gone mid-wait.
- A guard test that no new tool schema accepts a property that looks like a password (extends `site-mcp-config-guards.test.ts`).
- One live run in the dev app driven from the Bots tab for each phase's "done when".

## 9. Decisions from review

1. Approval granularity: as described. Approve, Approve for this site, or Deny.
2. `configure_site` edits on a site already approved for this session skip the card.
3. The setting also gates the existing write tools (`set_deployment_fields`, `set_deployment_toggles`, `create_environment` and the other environment writes): with it off they are hidden too. Read tools are unaffected.
