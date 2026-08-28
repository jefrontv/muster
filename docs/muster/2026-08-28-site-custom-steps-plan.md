# Custom Import/Deploy Steps — implementation plan

2026-08-28. Goal: let a user tell their agent "build me an import step that does X", have it appear
as a checkbox in that site's panel, copy it to another site, and optionally promote it to a global
library step any site can install.

## Decisions (from review, 2026-08-28)

| Question | Decision |
|---|---|
| Enablement scope | **Per site**, not per environment. A step's `enabled` lives on the step itself |
| Local vs remote steps | **Both** in Phase 1 |
| Review gate for agent-authored steps | **Dropped.** Agents create steps armed; no human arming ceremony |
| Library semantics | **Copy-on-install**, with `origin.libraryId` kept for provenance |
| Ordering | **`position: 'before' \| 'after'`** relative to built-ins, defaulting to `after` |

## What exists today (verified, with anchors)

The step system is **closed at compile time**. This is the central constraint.

- `SITE_IMPORT_TOGGLES` / `SITE_DEPLOY_TOGGLES` are `as const` tuples of `{key,label}`
  (`src/shared/site-types.ts:14-26`). Each key is *literally a boolean property* on
  `SiteEnvironment` (`site-types.ts:55-75`), and `SiteToggleKey` is derived from the tuples
  (`site-types.ts:28-30`).
- The pipelines destructure those property names by hand and branch on them:
  `pipeline-deploy.ts:55-56,129-144`, `pipeline-import.ts:139`. Adding a step today means editing
  the tuple, the `SiteEnvironment` type, `site-run-plan.ts`'s `REMOTE_STEPS` map, and both
  pipelines.
- Execution contract is already generic: `SiteRunContext` (`log`/`status`/`progress`/
  `throwIfCancelled`) and `SiteSshSession.exec` (`pipeline-contract.ts:1-121`). One SSH session is
  opened per run and reused across steps.
- Safety gate is one function pair: `buildSiteRunPlan` / `canStartRun` (`site-run-plan.ts:82-176`).
  It blocks on `no-environment`, `no-steps-selected`, `missing-path`,
  `missing-ssh-credentials`, `unmatched-branch`. `confirm=true` overrides **only**
  `unmatched-branch`.
- MCP is a hand-rolled stdio JSON-RPC server, 24 tools, each a plain
  `{name, description, inputSchema, run}` object (`site-mcp-context.ts:90-95`) collected into
  `SITE_MCP_TOOLS` (`site-mcp-tools.ts:21-28`). **A new tool is one object in one array** — no
  protocol code to touch.
- The panel checkboxes are `SiteStepToggles` (`site-panel-step-toggles.tsx:16-119`), writing through
  `window.api.sites.upsertEnvironment` → `sites:upsertEnvironment`
  (`src/main/ipc/sites-environments.ts:33-42`) with optimistic local state.

### Two precedents worth copying

| Precedent | What it proves | Gap |
|---|---|---|
| `SiteEnvironment.deployCommand` (`theme-build.ts:215-262`) | A user-authored arbitrary command already runs as part of a pipeline | Runs **locally**, single fixed slot |
| `run_ssh_command` (`site-mcp-ssh-tools.ts`) | An arbitrary **remote** command already runs under the standard run guard, with secret redaction | Ephemeral, agent-only, not persisted or toggleable |

A custom step is precisely **a persisted, named, toggleable `run_ssh_command`** placed in pipeline
order. No new execution primitive is required.

## Data model

```ts
/** A user-authored step. Same shape whether it lives on a site or in the global library. */
export type SiteCustomStep = {
  id: string                     // uuid; a copy always mints a new id
  name: string                   // shown next to the checkbox
  description?: string           // shown in the editor and MCP listings
  group: SiteRunGroup            // 'import' | 'deploy'
  runsOn: 'remote' | 'local'     // session.exec vs local streamCommand
  command: string                // the shell string, verbatim
  /** Relative to the built-in steps of the same group. */
  position: 'before' | 'after'
  order: number                  // sort within (group, position)
  enabled: boolean               // per site — this is the checkbox
  /** Provenance, so "where did this come from" survives copy/promote. */
  origin?: { kind: 'copied'; fromSiteId: string } | { kind: 'library'; libraryId: string }
}
```

- **Site-scoped, per-site enablement**: `Site.customSteps: SiteCustomStep[]` (new field,
  `site-types.ts`). Definitions and their on/off state both live on the site, so a step survives
  environment add/rename and is copyable as a unit.
  *Accepted tradeoff:* unlike built-in toggles, a custom step cannot be on for staging and off for
  production. If that itch shows up, the escape hatch is an optional
  `disabledEnvironments?: string[]` on the step — additive, no reshape.
- **Global library**: `PersistedState.siteStepLibrary: SiteCustomStep[]`, edited in the Sites page.
  Installing **copies** onto a site (`origin.kind='library'`) rather than linking, so a library edit
  can never silently change what runs against production. `origin.libraryId` is retained so a later
  "library version changed — update this copy?" prompt stays possible.

Additive fields only; absent → empty. No migration, and `ocsites-config-import.ts` is untouched.

## Execution

One new stage function, `runCustomSteps(context, config, session, group, position)`, called from
both pipelines at **two** points per group — once before the built-in steps, once after
(`pipeline-import.ts`, `pipeline-deploy.ts:129-144`). This is what makes the maintenance-mode
pattern work: enable before, disable after.

For each enabled step matching `(group, position)` in `order`:

1. `context.throwIfCancelled()`
2. `context.status(step.name)` / `context.log('Custom step: <name>')`
3. `runsOn:'remote'` → `session.exec(resolved, …)`; `runsOn:'local'` → the same `streamCommand`
   path `theme-build.ts` already uses, cwd = site path
4. Non-zero exit fails the run like any other step

A `'before'` step on a group whose built-ins are all disabled still runs — selecting only custom
steps is a valid run.

**Placeholders**, resolved at run time — never secrets: `{{remoteRoot}}`, `{{liveDomain}}`,
`{{sitePath}}`, `{{themeDist}}`. Everything interpolated goes through `quoteShellArgument`
(`pipeline-contract.ts`). Output runs through the same redaction `run_ssh_command` uses
(`site-mcp-ssh-tools.ts:44-51`) so a step that echoes a password cannot leak it into the run log.

`countSelectedToggles` (`site-types.ts:254`) and `buildSiteRunPlan`'s step counting must include
enabled custom steps, or a run with only custom steps selected is blocked as `no-steps-selected`.

## Safety posture

Per review, there is **no arming ceremony**: agents create steps enabled, and the user gets what
they asked for. Two guarantees are kept anyway because they cost nothing and lose nothing:

1. **The command is always visible** in the panel row (truncated, expandable) and in every MCP
   listing. A step's behaviour is never hidden behind its name.
2. **Secret redaction on output**, reusing `run_ssh_command`'s existing pass.

Everything still flows through the existing gate — branch/environment resolution, credential
presence, `confirm` for an unmatched branch — because custom steps run inside the same pipeline as
built-ins. Nothing new is exempted.

Worth stating plainly: this makes arbitrary commands persistent and human-triggered rather than
ephemeral and agent-triggered. That is the accepted cost of the feature, and it is consistent with
`run_ssh_command` already being unpoliced by design.

## MCP surface

New file `src/main/sites/mcp/site-mcp-custom-step-tools.ts`, spliced into `SITE_MCP_TOOLS`
(`site-mcp-tools.ts:21-28`), following `site-mcp-ssh-tools.ts` for guard reuse.

| Tool | Purpose |
|---|---|
| `list_custom_steps` | Site's steps + library steps, each with its full command |
| `create_custom_step` | Author a step. Validates group/runsOn/position/command non-empty |
| `update_custom_step` | Edit by id |
| `remove_custom_step` | Delete by id |
| `copy_custom_step` | **"copy this import step from site X to this site"** — `from_site` + `step`, mints a new id, records `origin` |
| `promote_custom_step` | Copy a site step into the global library |
| `install_library_step` | Copy a library step onto a site |

Enablement reuses the existing mental model: `set_deployment_toggles` accepts `custom:<id>` keys
alongside built-ins, keeping one all-or-nothing validation path (`collectToggleUpdates`,
`site-mcp-config-tools.ts:96-114`).

`preview_run` (`site-mcp-run-tools.ts:145-152`) lists custom steps in plan order, so an agent can
show exactly what will run before starting.

## UI

- **Right sidebar** (`site-panel-step-toggles.tsx:78-105`): custom steps render inside their group's
  fieldset — `before` steps above the built-ins, `after` steps below — each with name and command
  preview.
- **Sites page** (`SiteEnvironmentSection.tsx:144-179`): the editor — add/edit/remove/reorder,
  command textarea, group + runsOn + position selects. This file currently has no repeater UI; this
  is the one genuinely new UI pattern.
- **Library**: a Sites-page section listing global steps with install-to-site.

Both surfaces already duplicate the toggle list; this plan keeps that duplication rather than
refactoring them into one component — worth doing, but separately.

## Phasing

1. **Phase 1 — site-scoped steps that run.** Types, persistence, `runCustomSteps` at both positions
   in both pipelines, remote **and** local execution, run-plan counting, panel checkboxes, MCP
   `list`/`create`/`update`/`remove`, `set_deployment_toggles` extension. Ships useful on its own.
2. **Phase 2 — mobility.** `copy_custom_step` between sites, global library + `promote`/`install`,
   library UI.
3. **Phase 3 — polish.** Reorder UI, placeholder autocomplete, per-step dry run, step run history in
   the run log, optional `disabledEnvironments` if per-env control is missed.

## Tests

- `site-types.test.ts`: step counting with custom steps.
- New `custom-steps.test.ts` (main): `(group, position)` ordering, placeholder resolution +
  quoting, cancellation between steps, non-zero exit fails the run, local vs remote dispatch —
  against a stubbed `SiteSshSession`.
- `site-run-plan` tests: a run with only custom steps is not `no-steps-selected`; a `before` step
  runs with all built-ins off.
- MCP tool tests mirroring `site-mcp-config-tools` conventions: all-or-nothing validation, copy
  mints a new id and records origin, `custom:<id>` toggle keys.
- `SitePanel.test.tsx`: custom-step checkbox writes through the existing environment write path.
