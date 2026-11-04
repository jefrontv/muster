# Gravity Forms CRUD on the muster-sites MCP

2026-09-21. Add MCP tools so an agent can list, read, create, update and delete Gravity Forms **forms** and **entries** on a local WordPress install or a remote environment, through `GFAPI`, with the same local/remote posture the ACF tools shipped with: required `location`, deploy env guard on remote, preview by default, revert tokens, one bundled PHP runner over `wp eval-file`.

Every file reference below was read against the current tree (`muster` branch at 3b3b925067).

## What is already here (reuse, do not rebuild)

| Piece | Where | Used for |
|---|---|---|
| Local WP root + LocalWP socket env | `site-mcp-wp-target.ts` `resolveMcpLocalWp` | `location: local` |
| Remote SSH + deploy guard + Bedrock-aware webroot | `site-mcp-wp-target.ts` `openMcpRemoteWp` | `location: remote`; unmatched branch refuses unless `env=` or `confirm=true` |
| eval-file transport, temp files always deleted, sidecar JSON, output file collection | `wp-eval-file.ts` | every GF call |
| One entry point that runs a PHP body on either side and returns the transport envelope | `site-mcp-wp-eval-run.ts` `runEval` | every GF call |
| Runner stdout → JSON, with named failures (no WordPress, DB down, output cut) | `wp-acf-payload.ts` `parseAcfRunnerOutcome` | GF result parsing, after a small generalisation |
| Token store on disk (revert, snapshot), retention, `consumed` | `wp-acf-state-store.ts` | GF undo tokens |
| Closed schemas, shared properties, census test | `site-mcp-schemas.ts`, `site-mcp-tools.test.ts` | new tools |

Nothing GF-aware exists. Agents today reach Gravity Forms with `wp_eval_file` and hand-written `GFAPI` calls, or `run_remote_wp_cli` with `gf` verbs that only work when the separate Gravity Forms CLI add-on is installed and are not on the read allowlist.

## Decisions to confirm in review

| Question | Proposed |
|---|---|
| API path | `GFAPI` via the bundled runner. Never `wp gf` (add-on, not guaranteed), never SQL. `wp gf` reads are additionally allowlisted on `run_wp_cli` as a convenience. |
| Naming | `verb_gf_noun`: `list_gf_forms`, `get_gf_form`, `create_gf_form`, `update_gf_form`, `delete_gf_form`, `list_gf_entries`, `get_gf_entry`, `create_gf_entry`, `update_gf_entry`, `delete_gf_entry`. Ten tools. |
| Delete default | Trash, reversible, token issued. Permanent delete needs `permanent: true`, `apply: true`, and for a form with entries an `expect_entry_count` that matches the live count. |
| New entry default | `mode: add` (`GFAPI::add_entry`, no notifications, no feeds). `mode: submit` (`GFAPI::submit_form`) fires notifications and add-on feeds and says so in its description. |
| Undo | Each mutating GF tool takes `undo: <token>` and replays only tokens it minted; a token from another tool errors naming the right one. `list_wp_reverts` lists GF tokens beside ACF ones with a `tool` column. |
| State store name | Rename `wp-acf-state-store.ts` to `wp-tool-state-store.ts` (types `WpToolStateStore`, `WpToolStateRecord`) in one mechanical commit before GF records land in it. The file would otherwise hold records its name says it does not. |
| Baseline | Gravity Forms 2.5+. Methods newer than that (`validate_form` 2.6.4, `add_note`/`get_notes` 2.4.18) are probed with `method_exists` and degrade with a named error, never a fatal. |

## Constraints (load-bearing)

1. **Local is not an environment.** Same rule as ACF: `location` is required, `env=local` is an environment name.
2. **Remote is the deploy guard.** `openMcpRemoteWp` as is. Reads use it too; reading production when you meant staging is still the wrong answer.
3. **GF must be active on the target.** `class_exists('GFAPI')` or hard error naming `home`. No fallthrough to options or SQL.
4. **Field ids are the handle, not positions.** `form['fields']` is a list, but ids are what survive reordering, what entries key values by, and what conditional logic references. Form paths address fields by **id**. Choices and inputs, which have no stable id an agent would know, are addressed by 0-based position.
5. **`update_form` writes meta; `is_active`, `is_trash` are columns.** Those two go through `GFAPI::update_form_property`. `title` is in both places; `update_form` keeps them aligned.
6. **Exactly one default confirmation.** Removing the confirmation with `isDefault` is refused. Notification and confirmation ids are GF's hex strings and may start with a digit, so the path grammar is parent-typed (below), not the ACF regex.
7. **Whole-entry `update_entry` clobbers.** It requires every field present. Writes go through `GFAPI::update_entry_field` per input id and `GFAPI::update_entry_property` per property. Old values are read first so preview and revert are exact.
8. **`submit_form` has side effects.** Notifications, feeds (Zapier, payment add-ons), post creation. It is opt-in per call and described as such. Preview for `submit` runs `GFAPI::validate_form` only, which saves nothing.
9. **Permanent deletes cascade.** `GFAPI::delete_form` deletes the form's entries; `GFAPI::delete_entry` deletes uploaded files. Both are stated in the descriptions and the preview reports what goes with it.
10. **Output caps.** Bundled runner caps apply (256 KB PHP, 1 MB stdout). Entry pages are capped at 100 and a form `get` has an outline projection so a 60-field form with long choice lists does not hit the ceiling.
11. **`max-lines` 300 per new `.ts`.** PHP is not under that lint; the runner is one file.
12. **Census.** New names go in `SITE_MCP_TOOLS` and `TOOL_ARGUMENTS`.
13. **GF form cache.** After a write the runner calls `GFFormsModel::flush_current_forms()` when it exists. Page-cache plugins (WP Rocket on Avalon) still serve stale form markup; the apply response warns, nothing is purged. Same policy as ACF.

## Transport

```
MCP tool
  │  buildGfPayload({mode, ...})            → JSON sidecar
  ├─ location=local  → resolveMcpLocalWp → runLocalWpEvalFile(GF_FORMS_PHP, sidecar)
  └─ location=remote → openMcpRemoteWp   → runRemoteWpEvalFile(GF_FORMS_PHP, sidecar) → finally delete
       ↓
  parseRunnerOutcome → envelope + tool-specific keys
```

`runEval` today decides "bundled" by `php === ACF_FIELDS_PHP`. Change that to a `BUNDLED_PHP` set holding both runners so the GF runner gets the bundled caps. `parseAcfRunnerOutcome` and friends move to `wp-eval-runner-outcome.ts` with a `runner` label parameter (`'ACF runner'` / `'Gravity Forms runner'`); `wp-acf-payload.ts` re-exports so nothing else moves.

PHP source: `src/main/sites/php/gf-forms.php`, imported with `?raw` like `acf-fields.php`. Functions prefixed `muster_gf_`. `MUSTER_GF_NO_MAIN` guard so `gf-forms.selftest.php` can `require` it with stubbed `GFAPI`, `GFFormsModel`, `GFExport` classes. Stdout is one JSON object; PHP notices are collected into `warnings`, never printed.

### Envelope (every call)

```
{
  ok, blocked?, needs_confirmation?,
  site, site_id, location, environment, host, wp_root,
  home,               # get_option('home')
  gf_version,         # GFForms::$version or null
  warnings: string[]
}
```

Blocked remote calls return the existing `McpWpBlocked` shape and never touch WordPress.

## Forms

### `list_gf_forms`

```
list_gf_forms(location, status?: "active" | "inactive" | "trash" | "all" = "active", site?, env?, confirm?)
→ envelope + { count, forms: [{ id, title, is_active, is_trash, date_created, field_count,
                                 entries: { total, unread, starred, spam, trash } }] }
```

`GFAPI::get_forms($active, $trash)` with the status mapped to its two nullable booleans; counts from `GFFormsModel::get_form_counts`. `all` passes `null, null`.

### `get_gf_form`

```
get_gf_form(location, form_id, return?: "outline" | "full" | "export" = "outline", site?, env?, confirm?)
→ envelope + { form: {...} }
```

- `outline`: `id, title, description, is_active, is_trash, button, fields: [{ id, type, label, adminLabel, isRequired, inputs: [{id, label}], choices_count, conditionalLogic: bool }], notifications: [{id, name, to, event, isActive}], confirmations: [{id, name, type, isDefault}]`. Fits in a few KB for any form.
- `full`: `GFAPI::get_form` passed through `json_decode(json_encode())` so `GF_Field` objects become arrays. This is what `update_gf_form` paths are resolved against.
- `export`: `GFExport::prepare_forms_for_export([$form])`, the same JSON the admin export produces, with `version`. Feed it to `create_gf_form` on another host.

Unknown `form_id` is a hard error listing the ids that exist, not an empty form.

### `create_gf_form`

```
create_gf_form(location, form?: {...}, from_form_id?: number, apply?: false, site?, env?, confirm?)
→ envelope + { apply, form_id?, title, field_count, checks: [...], revert_token? }
```

Exactly one of `form` or `from_form_id`.

- `form` is a full form meta (hand-written `{title, fields:[...]}` or a `get_gf_form return: export` payload; an export wrapper `{version, 0: {...}}` with one form is unwrapped). `id` is stripped; GF assigns one. Missing field ids are assigned with `GFFormsModel::get_next_field_id`.
- `from_form_id` calls `GFAPI::duplicate_form` on the same host. Cross-host copy is `get_gf_form(export)` on one side then `create_gf_form(form)` on the other; the plan does not add a two-host tool.
- Preview (`apply: false`) runs the checks and writes nothing: title present, field ids unique, one default confirmation (one is synthesised with a warning if absent), every field `type` maps to a registered `GF_Field` class on the target (an add-on field type missing on staging is a warning naming the type, because GF renders unknown types as text).
- Apply calls `GFAPI::add_form`, re-reads, returns the new `form_id`. Revert token trashes it.

### `update_gf_form`

```
update_gf_form(location, form_id, fields?: [{path, value}], ops?: [...], apply?: false, undo?: token, site?, env?, confirm?)
→ envelope + { apply, results: [{ path, old, new, changed, applied, warnings }], ops: [...], revert, revert_token?, digest }
```

Path grammar, parent-typed:

| Path | Resolves to |
|---|---|
| `title`, `description`, `cssClass`, `labelPlacement`, `requireLogin`, … | top-level meta key |
| `button.text`, `button.type` | `form['button']` |
| `is_active`, `is_trash` | form table columns via `update_form_property` (bool) |
| `fields.<id>.<prop>` | the field with `id` == `<id>` (integer id, not position) |
| `fields.<id>.choices.<n>.<prop>` | 0-based choice position |
| `fields.<id>.inputs.<n>.<prop>` | 0-based input position; the result echoes the input id (`3.1`) |
| `notifications.<id>.<prop>` | `form['notifications'][<id>]`, id is GF's hex key |
| `confirmations.<id>.<prop>` | `form['confirmations'][<id>]` |

Segment charset `[A-Za-z0-9_-]+`; the parent decides whether it is a field id, a position or a key. A path that resolves to nothing is a per-path error listing what exists at that level (field ids, choice count, notification ids). If any path fails, nothing is written.

Ops (mirrors ACF row ops):

| Op | Effect |
|---|---|
| `{op:'add_field', field:{type,label,...}, after?: <id>}` | id assigned by `get_next_field_id`; appended or placed after `after` |
| `{op:'remove_field', id}` | refused when another field's `conditionalLogic` references it, with the referencing ids |
| `{op:'move_field', id, to: <position>}` | 0-based target position |
| `{op:'add_notification', notification:{name,to,subject,message,event?}}` | id generated with `uniqid()` as GF does |
| `{op:'remove_notification', id}` | |
| `{op:'add_confirmation', confirmation:{name,type,message?,pageId?,url?}}` | |
| `{op:'remove_confirmation', id}` | refused when `isDefault` |

Write path: mutate the decoded meta in memory, `GFAPI::update_form`, `update_form_property` for the two columns, flush, re-read, compare each touched path (`applied`). Revert is `[{path, value: old}]` plus inverse ops, in reverse order, and is returned by preview as well as apply. Drift check before undo: sha1 of the canonical JSON of the whole form meta taken right after the write; a changed digest refuses the replay, same as ACF.

Caps: 40 paths, 40 ops, 256 KB payload.

### `delete_gf_form`

```
delete_gf_form(location, form_id, permanent?: false, expect_entry_count?: number, apply?: false, undo?: token, site?, env?, confirm?)
→ envelope + { apply, form_id, title, was: {is_trash, is_active}, entries_affected, permanent, revert_token? }
```

- Default: `update_form_property(id, 'is_trash', 1)`. Revert restores the previous `is_trash`.
- `permanent: true`: `GFAPI::delete_form`. When the live entry count is above zero the call must carry `expect_entry_count` equal to it, which the preview reports; a mismatch refuses. No token, nothing to revert. The description tells the agent to name the count to the user first.

## Entries

### `list_gf_entries`

```
list_gf_entries(location, form_id, status?: "active" | "spam" | "trash" = "active",
                field_filters?: [{key, value, operator?}], search?: string,
                start_date?, end_date?, sort?: {key, direction, is_numeric?},
                page?: 1, page_size?: 20, return?: "summary" | "full" = "summary",
                site?, env?, confirm?)
→ envelope + { form_id, total, page, page_size, field_labels: {"3": "Email", "4.3": "First"},
               entries: [...] }
```

`GFAPI::get_entries($form_id, $search_criteria, $sorting, $paging, $total)`. `search` becomes GF's any-field filter (`key: 0`, `operator: contains`; the implementation confirms the key on 2.5). `page_size` is capped at 100. `field_labels` is sent once so the agent does not need `get_gf_form` to read a page. `summary` drops empty values and admin-only columns (`ip`, `user_agent`, `source_url`); `full` is the entry as GF returns it.

### `get_gf_entry`

```
get_gf_entry(location, entry_id, site?, env?, confirm?)
→ envelope + { entry, form_id, field_labels, notes: [{id, user_name, date_created, value, note_type}] }
```

`GFAPI::get_entry`, notes via `GFAPI::get_notes(['entry_id' => id])` when it exists. Unknown id is a hard error.

### `create_gf_entry`

```
create_gf_entry(location, form_id, values: {"3": "…", "4.3": "…"}, mode?: "add" | "submit" = "add",
                properties?: {status?, created_by?, is_starred?, is_read?, date_created?},
                apply?: false, undo?: token, site?, env?, confirm?)
→ envelope + { apply, mode, entry_id?, validation?: {is_valid, messages: {field_id: text}}, revert_token? }
```

- `add`: preview resolves every key to a field or input on the form and reports unknown keys and required fields left empty as warnings; apply calls `GFAPI::add_entry` with `form_id`, `values` and `properties`. No notifications, no feeds.
- `submit`: preview calls `GFAPI::validate_form($form_id, $input_values)` and returns the result (when the method is missing the preview says validation needs GF 2.6.4 and stops there); apply calls `GFAPI::submit_form`, which runs validation, notifications and feeds, and returns the new entry id from the submission result.
- Values are keyed by field id or input id, the same keys `list_gf_entries` returns. File upload fields accept a URL string and the plan moves no files.
- Revert token trashes the entry.

### `update_gf_entry`

```
update_gf_entry(location, entry_id, values?: {"3": "…"}, properties?: {status?, is_starred?, is_read?, created_by?, payment_status?, …},
                note?: string, apply?: false, undo?: token, site?, env?, confirm?)
→ envelope + { apply, results: [{ key, label, old, new, changed, applied }], properties: [...], note_id?, revert, revert_token? }
```

Per key `GFAPI::update_entry_field`, per property `GFAPI::update_entry_property`, `note` through `GFAPI::add_note(entry_id, 0, 'Muster', note)` when it exists. Preview reads the current values and shows old→new. Property names are checked against GF's list (`status`, `is_starred`, `is_read`, `created_by`, `date_created`, `ip`, `source_url`, `payment_status`, `payment_amount`, `transaction_id`, `is_fulfilled`, `currency`); an unknown one is a hard error. Revert holds the old values; drift check digests the entry.

### `delete_gf_entry`

```
delete_gf_entry(location, entry_id, permanent?: false, apply?: false, undo?: token, site?, env?, confirm?)
→ envelope + { apply, entry_id, form_id, was: {status}, permanent, files: [...], revert_token? }
```

Default sets `status` to `trash` through `update_entry_property`; revert restores the old status (`active` or `spam`). `permanent: true` calls `GFAPI::delete_entry`, which also removes uploaded files; the preview lists the file URLs that go with it. No token.

## Undo

- `WpToolStateKind` gains `'gf-revert'` with the same retention as `'revert'` (20 per site, 24 h). Record `payload` is `{ tool, args }` where `args` is a complete replay argument set for that tool with `apply` left to the caller. `digests` holds `{ form:<id> | entry:<id> : sha1 }`.
- Replay: the tool loads the token, refuses when `payload.tool` differs from its own name (message names the right tool), runs a `checksum` mode call, refuses on drift, replays with the caller's `apply`, marks consumed on an applied success, and mints a new token for the replay (redo).
- `list_wp_reverts` gains an optional `kind?: "acf" | "gf" | "all" = "all"` and each row carries `tool`. Description updated.

## `run_wp_cli` convenience

Add to `WP_READ_ALLOWLIST` in `wp-cli-runner.ts`: `gf: ['form list', 'form get', 'form export', 'entry list', 'entry get', 'entry export', 'field list', 'field get', 'version']`. The two-word matching already exists (`cron event list`). This only matters when the GF CLI add-on is installed and costs one line plus a test.

## A series of calls (what an agent does)

Local, in a theme checkout with a bootable WP root:

1. `list_gf_forms(location: local)` → ids, titles, entry counts.
2. `get_gf_form(location: local, form_id: 3)` → outline.
3. `update_gf_form(location: local, form_id: 3, fields: [{path: "fields.7.label", value: "Work email"}, {path: "fields.7.isRequired", value: true}])` → preview, old→new.
4. Same call with `apply: true` → `applied`, `revert_token`.
5. `list_gf_entries(location: local, form_id: 3, page_size: 5)` → confirm labels.

Remote staging, branch matches the `staging` environment:

1. `list_gf_forms(location: remote)` → env inferred from the branch.
2. `get_gf_form(location: remote, form_id: 3, return: "export")`.
3. `update_gf_form(location: remote, form_id: 3, ops: [{op: "add_notification", notification: {name: "Ops copy", to: "ops@example.com", subject: "New enquiry", message: "{all_fields}"}}], apply: true)`.
4. `update_gf_form(location: remote, form_id: 3, undo: "<token>", apply: true)` when it was wrong.

Copy a form from local to staging:

1. `get_gf_form(location: local, form_id: 3, return: "export")`.
2. `create_gf_form(location: remote, env: "staging", form: <export>)` → checks, including any field type the staging install lacks.
3. Same with `apply: true` → new `form_id` on staging.

Entries triage on production, explicit env:

1. `list_gf_entries(location: remote, env: "production", form_id: 3, status: "spam", page_size: 50)`.
2. `update_gf_entry(location: remote, env: "production", entry_id: 9812, properties: {status: "active"}, note: "Restored from spam, real enquiry", apply: true)`.
3. `delete_gf_entry(location: remote, env: "production", entry_id: 9813, apply: true)` → trashed, token.

## Files

Each new `.ts` under 300 lines.

| File | Role |
|---|---|
| `src/main/sites/php/gf-forms.php` | Runner: modes `forms.list/get/create/update/delete`, `entries.list/get/create/update/delete`, `checksum`; envelope; path resolver; ops; validation checks |
| `src/main/sites/php/gf-forms.selftest.php` | Stubbed `GFAPI`/`GFFormsModel`/`GFExport`; asserts on paths, ops, refusals |
| `src/main/sites/wp-tool-state-store.ts` | Renamed from `wp-acf-state-store.ts`; kind `'gf-revert'` |
| `src/main/sites/wp-eval-runner-outcome.ts` | `parseRunnerOutcome` and failure explanations, extracted from `wp-acf-payload.ts` with a runner label |
| `src/main/sites/wp-gf-payload.ts` | `GF_FORMS_PHP` raw import, `buildGfPayload`, caps |
| `src/main/sites/wp-gf-form-path.ts` | Form path grammar (TS side refuses junk before SSH), ops readers |
| `src/main/sites/wp-gf-entry-query.ts` | Status, filters, dates, sort, paging readers; property name list |
| `src/main/sites/mcp/site-mcp-gf-form-tools.ts` | Five form tools |
| `src/main/sites/mcp/site-mcp-gf-entry-tools.ts` | Five entry tools |
| `src/main/sites/mcp/site-mcp-gf-undo.ts` | Store a GF revert, replay one with drift check |
| `src/main/sites/mcp/site-mcp-wp-eval-run.ts` | `BUNDLED_PHP` set |
| `src/main/sites/mcp/site-mcp-wp-snapshot-tools.ts` | `list_wp_reverts` kind filter and `tool` column |
| `src/main/sites/mcp/site-mcp-schemas.ts` | `FORM_ID_PROPERTY`, `ENTRY_ID_PROPERTY`, `APPLY_PROPERTY` |
| `src/main/sites/mcp/site-mcp-tools.ts` | Splice `SITE_MCP_GF_FORM_TOOLS`, `SITE_MCP_GF_ENTRY_TOOLS` |
| `src/main/sites/wp-cli-runner.ts` | `gf` read allowlist |
| Tests beside each: `wp-gf-payload.test.ts`, `wp-gf-form-path.test.ts`, `wp-gf-entry-query.test.ts`, `site-mcp-gf-form-tools.test.ts`, `site-mcp-gf-entry-tools.test.ts`, `site-mcp-gf-undo.test.ts`; census in `site-mcp-tools.test.ts` | |

No renderer, no IPC, no Sites panel UI.

## Tests (what has to be true)

**Path and payload (pure TS)**
- `fields.7.label` → field id 7; `fields.7.choices.2.text` → position 2; `notifications.5f3a9c.to` → key; `confirmations..x` refused; `fields.label` (no id) refused with the reason.
- `remove_confirmation` payload shape; 41 ops refused; `form` and `from_form_id` together refused.
- Entry query: `page_size: 500` clamps to 100; unknown property refused; `status: "deleted"` refused.

**Tools (fake `runEval`)**
- Every tool registered, closed schema, census.
- `apply` defaults false; a preview issues one runner call with `mode` ending in `.preview`-equivalent flag and no write.
- Remote unmatched branch returns `blocked: true` without opening SSH (same assertions as the ACF tool tests).
- `permanent: true` on a form with entries and no `expect_entry_count` is refused before the runner runs; a wrong count is refused after the preview count comes back.
- `create_gf_entry mode: submit` description contains the notification warning (census description check).
- Undo: token minted by `update_gf_form` refused by `delete_gf_form` with the right tool named; drift refuses; consumed token refused.

**PHP self-test (`php -l`, then `php gf-forms.selftest.php`)**
- GF absent → `{ok:false, error}` naming `home`.
- Field addressed by id, not position: fields `[ {id:3}, {id:7} ]`, path `fields.7.label` writes the second element.
- Removing the default confirmation refused; removing a field referenced by conditional logic refused with the referencing id.
- `add_field` assigns `max(id)+1` through the stub.
- `update_gf_entry` uses `update_entry_field` per key, never `update_entry`.
- Export unwrapping: `{version, 0:{...}}` becomes one form meta with `id` stripped.

No live-WordPress test in this PR.

## Implementation order and release

Two agents, same split as the ACF rounds: one owns `gf-forms.php` and its self-test, one owns the TypeScript. They meet on the JSON contracts written here.

1. Rename `wp-acf-state-store.ts` → `wp-tool-state-store.ts`; extract `wp-eval-runner-outcome.ts`; `BUNDLED_PHP` set. No behaviour change, tests green.
2. `gf-forms.php` read modes (`forms.list`, `forms.get`, `entries.list`, `entries.get`) plus `list_gf_forms`, `get_gf_form`, `list_gf_entries`, `get_gf_entry`. Ship as **1.14.19**: read-only, low risk, immediately useful.
3. Form writes: `update_gf_form` (paths, then ops), `create_gf_form`, `delete_gf_form`, GF undo. Ship as **1.14.20**.
4. Entry writes: `create_gf_entry`, `update_gf_entry`, `delete_gf_entry`. Ship as **1.14.21**.
5. `gf` allowlist on `run_wp_cli` rides with step 2.

Each release: diffs reviewed, `pnpm exec vitest run src/main/sites`, `tsc --composite false --incremental false`, oxlint, oxfmt, PHP lint and self-test, no file over 300 lines, no lint disables, release notes written.

## Out of scope (v1)

- Add-on feeds (`GFAPI::get_feeds/add_feed/update_feed/delete_feed`). Phase 2 as `list_gf_feeds` / `update_gf_feed` once forms and entries are proven.
- `location: both` compare and `checksum` on `get_gf_form`. The digest already exists for drift; exposing it is a follow-up.
- Sending or resending notifications (`GFAPI::send_notifications`).
- Moving uploaded files between hosts.
- Entry export to CSV; `list_gf_entries` pages JSON and that is enough for an agent.
- Any renderer UI.

## Risks

| Risk | Why real | Mitigation |
|---|---|---|
| Field addressed by position | The obvious mistake; positions change on every reorder | Grammar addresses fields by id; self-test locks it |
| `submit_form` on production | Emails clients, charges cards through payment feeds | Opt-in `mode: submit`, preview validates only, description says what fires |
| Permanent form delete takes entries | GF cascades | Trash by default; permanent requires the live count echoed back |
| Whole-entry update clobbers | `update_entry` needs every field | Per-key `update_entry_field` only |
| Add-on field types missing on target | Staging without the add-on renders the field as text | Create preview warns per type |
| GF version spread | Some GFAPI methods are newer than 2.5 | `method_exists` probes, named degrade |
| Stale form markup | Page-cache plugins | Warning on apply, no purge, same as ACF |
| Wrong host | Same class as every remote tool | Required `location`, envelope carries `home` and `host` |
| Theme-only checkout | No bootable WP root locally | Existing named error; use `location: remote` |
| Store rename churn | Touches every ACF tool import | One mechanical commit, tests unchanged |

## Questions

1. Ten tools, or fold create/update/delete into one `write_gf_form` / `write_gf_entry` with an `op` field? Ten keeps each description short and each schema closed; one tool per noun halves the tool list. Recommendation: ten.
2. Should `delete_gf_form permanent: true` be refused outright on `remote` unless `env` is passed explicitly, on top of the entry-count echo?
3. Ship the read-only slice as 1.14.19 first, or hold for form writes and release once?
