# ACF-aware field writes on the muster-sites MCP

2026-09-17. Add MCP tools so an agent can read and write ACF values on a local WordPress install or a remote environment without hand-building `options_repeater_9_name` keys, without `wp eval` quoting hell, and without upload → SSH → delete for a one-shot PHP script.

Every file reference below was read against the current tree.

## Decisions (from review, 2026-09-17)

| Question | Decision |
|---|---|
| How the agent picks local vs remote | Required `location: "local" \| "remote"`. Not `env=local` — environment names are user data and can already be `local`. Confirmed in review. |

## Verdict

All three proposed tools are feasible. Two of them are mostly wiring. The third is a real feature, and it is the one that pays the rent.

| Proposed | Feasible? | What is already here | Ship? |
|---|---|---|---|
| `update_wp_fields` | Yes — this is the actual product | Nothing ACF-aware. Agents fake it with `wp option update` and uploaded PHP. | **Yes. P0.** Plus a read twin. |
| `run_wp_cli` | Yes — the engine exists, MCP does not | `src/main/sites/wp-cli-runner.ts` (local + remote, argv, quoting, read-allowlist, hard-ban on `eval`/`eval-file`/`shell`). IPC already: `siteTools:runWpCli` in `src/main/ipc/site-tools-diagnostics.ts`. Ocsites parity listed as done in `docs/muster/OCSITES_INTEGRATION_PLAN.md:334` and **never registered** in `SITE_MCP_TOOLS`. | **Yes. P0.** Wire the existing runner. Do not lift the eval ban. |
| `wp_eval_file` | Yes — and `update_wp_fields` needs this transport anyway | SSH already has `writeSecureRemoteFile` + `removeRemoteFile` (`pipeline-contract.ts:79-81`). `run_ssh_command` is an arbitrary remote shell, so this is not a new privilege on remote. | **Yes. P0 as internal primitive. Expose as a tool in the same PR** — size-capped, always cleaned up, never via `run_wp_cli`. |

Do not implement `update_wp_fields` as a sequence of `wp option update` calls. That is the bug this exists to kill. Writes go through ACF (`update_field` / a parent rewrite) so field-key references, serialisation, and `acf/update_value` filters stay ACF's problem.

## What agents do today (the pain this removes)

Remote, against a Muster environment:

1. Reverse-engineer ACF option keys (`options_spacing_templates_9_name` plus the `_options_*` field-key sibling).
2. `run_ssh_command` with `cd public_html && wp option update …` — or upload a PHP apply-script with `upload_files`, `run_ssh_command` `wp eval-file /tmp/…`, then delete.

Local:

- agent-local `wp_cli` (arbitrary argv, no Muster env guard).
- Muster IPC `siteTools:runWpCli` (not on the MCP).
- Same ACF-key archaeology.

`run_ssh_command` does not `cd` to the WordPress root (`site-mcp-ssh-tools.ts:132-133`). Agents forget, the command misses, they retry. `wp eval '…'` through a remote shell is a quoting war crime. The field-key sibling is how ACF knows a value belongs to a field; skip it and the admin shows empty after a "successful" write.

## Constraints that shape the design

These are load-bearing. Ignore one and the tool writes the wrong row, or the wrong host.

1. **Local is not an environment.** `SiteEnvironment` is a remote target (`site-types.ts:111-131`). Sites can already have an env named `local`. `env=local` is forbidden as a synonym for the checkout. Use a required `location: "local" | "remote"`.
2. **Remote env resolution is the deploy guard.** Same as `run_ssh_command`: branch → env; unmatched branch REFUSES unless `env=` or `confirm=true`; missing SSH still refuses. Reuse `buildSiteToolPlan` / `canStartRun`. Group `'deploy'` — the command reaches a live host the way a deploy does.
3. **`wp eval` / `eval-file` / `shell` are hard-banned** in `checkWpCliSafety` even with `allowWrites` (`wp-cli-runner.ts:62-63, 100-106`). That ban stays on `run_wp_cli`. Field writes and agent PHP go through a dedicated eval-file runner that never calls `checkWpCliSafety`.
4. **ACF row indexes are a trap.** `update_sub_field(['repeater', 1, 'name'], …)` is **1-based**. Option keys and `get_field($name, $id, false)` arrays are **0-based**. The motivating example `spacing_templates.9.name` → `options_spacing_templates_9_name` is storage index 9. If the PHP calls `update_sub_field` with `9`, it writes row 8's neighbour or a hole. **Our path language is 0-based, matching `get_field(..., false)` and the option-key integers agents already reverse-engineer.**
5. **Group fields are fake repeaters.** `update_sub_field` on a group without a row index writes `{$group}_{$index}_{$sub}` — the wrong meta key. Do not use `update_sub_field` as the general write. Rewrite the **root** field (see Write strategy).
6. **Gutenberg ACF blocks live in `post_content`.** `update_field` writes post meta the block will not read. V1: if the field's location rules include a block, refuse with that reason. efront page content is the `modules` flexible field, which is meta, which we handle.
7. **`readString` caps at 4096 chars** (`site-mcp-arguments.ts:12`). Eval-file bodies and field values must not go through it. JSON-RPC frames may be 8 MB (`site-mcp-jsonrpc.ts:19`).
8. **`max-lines` is 300 for new `.ts`.** Split. PHP is not under that lint; the walker lives in PHP.
9. **Tool table census.** `site-mcp-tools.test.ts` asserts `SITE_MCP_TOOLS` names equal `TOOL_ARGUMENTS` keys. New tools go in both.
10. **Local WP-CLI only works on a bootable WordPress root.** `resolveSiteWpDir` is `site.path` + `site.localWpRoot` (`site-run-config.ts:24-27`). A theme-only checkout with no WP root cannot take local writes — remote still can. Error must say that, not "wp: command not found" and stop.
11. **Remote webroot is not always `rootPath`.** Bedrock serves from `web/`. Use `resolveRemoteLayout` / `withRemoteSiteTool` (`site-tool-session.ts:24-38`), not a blind `cd rootPath`.
12. **ACF must be active on the target.** No plugin, no write. Hard error, never fall through to `update_option`.
13. **Do not auto-purge WP Rocket / NitroPack.** After a DB write, page-cache plugins serve stale HTML (learned on Avalon). Return a warning; let the agent call `run_remote_wp_cli` / `run_ssh_command` for `wp rocket clean`. `wp cache flush` is not enough on those stacks and is not our job to special-case.

---

## Tool 1 — `get_wp_fields` / `update_wp_fields`

The proposal's `update_wp_fields` is right. Add a read twin that shares the PHP runner. Agents cannot write `modules.6.bottom_spacing` until they can see that row 6 exists and what layout it is.

### MCP shape

```
get_wp_fields(
  location: "local" | "remote",          # required
  target: { kind: "option"|"post"|"term"|"user"|"comment", id?: number|string },
  fields: string[],                      # dotted paths
  site?, env?, confirm?
) → envelope + { results: [{ path, exists, value, field: { name, key, type, parent_layout? }, error? }] }

update_wp_fields(
  location: "local" | "remote",          # required
  target: { kind, id? },
  fields: [{ path, value }],             # value is JSON
  apply: false,                          # default = preview; no writes
  site?, env?, confirm?
) → envelope + { results: [{ path, exists, old, new, changed, applied, field, warnings, error? }] }
```

`confirm` is the unmatched-branch override, same as every other remote write. Preview (`apply: false`) against remote still opens SSH and reads — it uses the same guard, because reading the wrong host is still a wrong answer (`upload_files` already treats downloads that way).

Required `location`. An omitted location will be guessed as remote and that is how you nuke production.

### Envelope (every call, success or block)

```
{
  ok, blocked?, needs_confirmation?,
  site, site_id,
  location,                    # local | remote
  environment,                 # null on local
  host,                        # user@hostname on remote; local domain or wpDir on local
  wp_root,                     # resolved webroot / wpDir
  home,                        # get_option('home') — the transcript proof
  acf_version,                 # acf_get_setting('version') or null
  warnings: string[]           # e.g. page-cache may be stale after apply
}
```

Blocked calls return this envelope plus `blocked_by` and never touch WordPress.

### Target → ACF `$post_id`

| `kind` | `id` | `$post_id` passed to ACF |
|---|---|---|
| `option` | omitted | `'option'` (also accept `'options'`, normalise) |
| `option` | string | that string (custom options-page `post_id`, ACF 6.2+) |
| `post` | int | the post ID; 404 if `get_post` is null |
| `term` | int | `'term_{id}'` (ACF 5+). No taxonomy in v1. |
| `user` | int | `'user_{id}'` |
| `comment` | int | `'comment_{id}'` |

`post` / `term` / `user` / `comment` require `id`. Missing entity is a hard error before any field is touched.

efront options (`spacing_templates`, social channels, WSRV override) are `kind: "option"`. efront page modules are `kind: "post", id: <page>`. Archive-prefixed flex fields (`news_modules`) are the stored field name — we do not guess `efr_maybe_prefix_key_for_archive`.

### Path language

Dotted, 0-based, matching unformatted `get_field` arrays and ACF option-key integers.

```
path     := segment ('.' segment)*
segment  := field_name | index
field    := [A-Za-z_][A-Za-z0-9_]*     # names or field_xxxx keys
index    := [0-9]+                       # 0-based row
```

Examples:

| Path | Meaning |
|---|---|
| `hero_title` | top-level field |
| `spacing_templates.9.name` | repeater row 9 (the tenth row), subfield `name` — same cell as `options_spacing_templates_9_name` |
| `modules.6.bottom_spacing` | flex row 6, subfield `bottom_spacing` (efront `module_index` 6) |
| `modules.6` | the whole flex row (object including `acf_fc_layout`) |
| `hero.title` | group `hero`, subfield `title` — **no** index |
| `modules` | the entire flexible field (how you add/remove rows) |

v1 has no bracket syntax, no `index_base` flag, no `modules[6:hero]` layout assertion. If the row's `acf_fc_layout` does not contain the subfield, that path is a hard error and the error lists the layout name plus the subfields that do exist.

Tab / accordion / message fields resolve through `acf_get_field` but store nothing — hard error, "not a value field".

Unknown root name: hard error, never `update_option`. The PHP looks up via `acf_get_field()` (name or key). Typos die here.

### Write strategy (PHP runner)

One bundled PHP script, owned by us, run with `wp eval-file`. Agent JSON in, JSON out. No agent PHP in this tool.

For each path:

1. Parse segments. Reject empty / trailing-dot / non-field first segment.
2. `acf_get_field(root)` — fail if missing or ACF inactive.
3. `get_field(root_name_or_key, $post_id, false)` — unformatted.
4. Walk the PHP value: numeric segment → array index; string → associative key. For flexible rows, the subfield must exist on that row's layout (`acf_get_fields` on the layout).
5. Record `old`. For update, compare JSON-stable `old` vs `new`.
6. Coerce + warn (below). Do not invent values.
7. If **any** path in the batch fails to resolve, **apply none**. Preview can still return per-path errors.
8. If `apply`: mutate the in-memory root value and `update_field($root_key, $root_value, $post_id)` **once per distinct root field**. Then re-read the leaf unformatted as `new` so the result is what ACF stored, not what we sent.

Why rewrite the root rather than `update_sub_field`:

- One code path for repeater, flexible, group, clone-as-group.
- Avoids the 1-based selector and the group-as-repeater meta-key bug.
- `update_field($key, …)` uses the field **key**, which is the form that creates the `_field_*` reference ACF needs on first write.

v1 does not create missing rows. Index `>= count` is an error that includes `count`. To append or delete, write the whole parent array (`path: "modules"`, value: `[...]`).

No rollback. ACF has no transaction. Resolve-all-then-apply is the atomicity we can actually have. If write #2 of two roots fails, report which roots were applied.

### Value coercion and warnings (not silent mutation)

| Field type | Accepted | Warning |
|---|---|---|
| `true_false` | bool, `0`/`1`, `"0"`/`"1"` | coerced |
| `number` / `range` | number or numeric string | coerced |
| `image` / `file` | attachment ID | URL → `attachment_url_to_postid` (0 → error); return-format array → extract `ID`/`id` and warn "sent formatted value, wrote ID" |
| `gallery` | `number[]` | same URL/array unwrap per item |
| `post_object` / `relationship` / `page_link` | ID or `ID[]` matching `multiple` | formatted object(s) → extract IDs + warn |
| `taxonomy` | term ID or `ID[]` | |
| `select` / `checkbox` / `radio` | string or `string[]` matching `multiple` | |
| `link` | `{title, url, target}` | |
| `google_map` | `{address, lat, lng}` | |
| `date_picker` | `Ymd` or parseable date → `Ymd` | warn if rewritten |
| `wysiwyg` / `textarea` / `text` / `email` / `url` / `oembed` | string | |
| `repeater` | array of row objects keyed by subfield name | |
| `flexible_content` | array of objects each with `acf_fc_layout` | missing layout → error |
| `group` | object keyed by subfield name | |
| `accordion` / `tab` / `message` | — | error |
| unknown / efront custom (`acf-color-swatch`, `oembed-url`, `taxonomy-relationship`, focal point) | pass through JSON | warning: unvalidated custom type |

`update_field` wants **input** format, not `return_format`. Image fields in efront are `return_format: array`; agents that paste `get_field` output would write garbage without the unwrap.

### Caps

- Max 40 paths per call.
- Max JSON payload 256 KB.
- Timeout 120 s (same band as IPC WP-CLI).

### Out of scope v1

- Gutenberg ACF blocks (refuse when location includes `block`).
- Bidirectional relationship dance beyond what `update_field` already does.
- Creating rows by writing past `count`.
- `comment`/`widget`/menu-item sugar beyond the `$post_id` table.
- Auto cache-plugin purge.
- Reading field groups from local `acf-json/` as a preflight (the target's `acf_get_field` is the authority; local JSON can be ahead of a stale remote theme).

---

## Tool 2 — `run_wp_cli` / `run_remote_wp_cli`

Ocsites names, because `site-mcp-tools.ts:7-8` keeps those names so old prompts survive. One MCP tool with `location` would also work; two names match the parity list and the IPC `location` split.

```
run_wp_cli(args: string[], allow_writes?: false, timeout_ms?, site?)
run_remote_wp_cli(args: string[], allow_writes?: false, timeout_ms?, site?, env?, confirm?)
```

Both call `runLocalWpCli` / `runRemoteWpCli` as `site-tools-diagnostics.ts:87-110` already does:

- `args` is `string[]`. No shell string. No quoting by the model.
- Local: `cwd = wpDir`, LocalWP PHP/socket env when `dbSocket` is set.
- Remote: `cd <webroot> && wp --no-color <quoted args>` via `buildRemoteWpCliCommand`. Layout-resolved webroot.
- `allow_writes` default **false**. Writes need the flag; remote writes also need the env guard.
- `eval` / `eval-file` / `shell` stay refused. The error names `wp_eval_file` / `update_wp_fields` so the model does not retry with `run_ssh_command` as the first instinct (it still can; the description should say when to).
- Output already capped at 50 k chars in the runner.

This replaces `cd public_html && wp option get home` and `wp rocket clean --confirm` one-liners. It does **not** replace ACF writes.

Local `run_wp_cli` does not take `env`. There is no remote host.

---

## Tool 3 — `wp_eval_file`

Internal primitive first. Public tool second. Same function.

```
wp_eval_file(
  location: "local" | "remote",
  php: string,                 # file body, not a path
  args?: string[],             # forwarded as WP-CLI extra args ($args in the file)
  site?, env?, confirm?
)
```

Behaviour:

- Size cap **64 KB** of PHP. Hard refuse above that.
- Write to a unique temp path (`muster-eval-{uuid}.php`).
- Remote: `writeSecureRemoteFile` under the SSH user's tmp (probe `mktemp` or `/tmp`), `cd webroot && wp --no-color eval-file <path> <args…>`, `removeRemoteFile` in `finally` (that helper already ignores cancel — `site-ssh-session.ts:84-98`).
- Local: `os.tmpdir()`, `wp eval-file` via the same spawn path as `runLocalWpCli` (LocalWP env, `WP_CLI_PHP_ARGS`), `unlink` in `finally`.
- Never leave the file on success, failure, or timeout.
- Do not go through `checkWpCliSafety`.
- Extra args still quoted with `quoteShellArgument` and still refused if they contain shell metacharacters.
- Remote unmatched-branch guard identical to other writes.
- Description: tell the user what the script does before `confirm` on a production-ish host. Same posture as `run_ssh_command`.

`update_wp_fields` uses this with **our** PHP plus a JSON sidecar (second temp file, also cleaned up). The public tool is for jobs that are not ACF field writes. Once `update_wp_fields` exists, the "page-10 apply script" in the motivating transcript should die; if it does not, the escape hatch is this tool rather than `upload_files`.

Do not add `wp eval` (inline). File body + argv is enough and it keeps the payload off the shell command line.

---

## Transport

```
MCP tool
  │
  ├─ location=local  → resolveSiteWpDir + dbSocket + runLocalWpCli-style spawn
  └─ location=remote → buildSiteToolPlan → openSshSession → resolveRemoteLayout
                         → write temps → wp eval-file → read JSON stdout → finally delete
```

Shared module (name after the job, not `helpers`): `src/main/sites/wp-eval-file.ts`.

- `runLocalWpEvalFile({ wpDir, dbSocket, php, args, signal })`
- `runRemoteWpEvalFile({ session, webroot, php, args })`

Both return `{ code, stdout, stderr, truncated }` after cleanup. Callers parse stdout as JSON (field tools) or pass it through (`wp_eval_file`).

PHP source: `src/main/sites/php/acf-fields.php`, imported as a string (`?raw` or `readFileSync(new URL(...))` — pick whichever electron-vite actually emits into the main bundle; the bytes must ship inside the JS, not as an extraResource the MCP stdio process may not find). Tests import the same string.

Stdout of the PHP is **one JSON object**. PHP warnings are collected into `warnings[]`, not printed. `error_reporting` restricted so a notice cannot break `JSON.parse` on the Node side. If stdout is not JSON, the TS side fails with a truncated stdout excerpt — never treats it as success.

---

## Files

Keep each new `.ts` under 300 lines.

| File | Role |
|---|---|
| `src/main/sites/php/acf-fields.php` | Walker, coerce, preview/apply, envelope fields (`home`, `acf_version`) |
| `src/main/sites/wp-eval-file.ts` | Local + remote eval-file + mandatory cleanup |
| `src/main/sites/wp-acf-payload.ts` | MCP arg validation, path syntax, payload JSON, result parse |
| `src/main/sites/mcp/site-mcp-wp-cli-tools.ts` | `run_wp_cli`, `run_remote_wp_cli` |
| `src/main/sites/mcp/site-mcp-wp-field-tools.ts` | `get_wp_fields`, `update_wp_fields`, `wp_eval_file` |
| `src/main/sites/mcp/site-mcp-tools.ts` | Splice the new groups into `SITE_MCP_TOOLS` |
| `src/main/sites/mcp/site-mcp-tools.test.ts` | Census entries |
| `src/main/sites/mcp/site-mcp-arguments.ts` | `readStringArray`, `readJsonValue` (bounded), long-string reader for PHP bodies |
| `src/main/sites/wp-cli-runner.ts` | Error text on eval-ban names the new tools. No behaviour change. |
| Tests next to each: `wp-eval-file.test.ts`, `wp-acf-payload.test.ts`, `site-mcp-wp-cli-tools.test.ts`, `site-mcp-wp-field-tools.test.ts` | |

No renderer, no IPC channel, no Sites panel UI in this slice. The IPC WP-CLI path stays as it is. A later change can point the panel at `update_wp_fields` if anyone wants a button; it is not required to make agents stop uploading PHP.

---

## Tests (what has to be true)

**Payload / path (pure TS)**

- Parse `spacing_templates.9.name` → `[field, index 9, field]`.
- Reject `''`, `'.a'`, `'a.'`, `'9.name'` (index cannot be root).
- Target normalisation: `options` → `option`; missing `id` on `post` fails; unknown `kind` fails.
- Caps: 41 paths refused; oversize PHP refused.

**Eval-file (fake spawn / fake SSH)**

- Local: writes temp, spawns `wp eval-file <abs> …`, unlinks even when spawn throws or times out.
- Remote: `writeSecureRemoteFile` php+json, `exec` contains quoted `eval-file`, `removeRemoteFile` for both paths on success **and** on `exec` throw.
- Extra args with `;` refused before any write.
- Secrets in stdout/stderr redacted the same way `run_ssh_command` redacts.

**MCP CLI tools**

- `run_wp_cli` / `run_remote_wp_cli` registered, closed schemas, census.
- `eval` / `eval-file` still blocked with `allow_writes: true`.
- Remote unmatched branch returns `blocked: true` and does not open SSH (same assertion style as `site-mcp-ssh-tools` tests).
- Local does not require SSH.

**MCP field tools**

- `apply: false` default.
- `location` required.
- `env=local` is just an environment name if one exists; it does not mean the checkout. Documented in the schema description.
- Fake eval-file returning a canned JSON envelope: tool surfaces `home`, `environment`, `location`.
- Apply-none-if-any-path-unresolved: PHP unit via a small fixture if we can run PHP; otherwise assert the payload flag `apply` is false when the TS side short-circuits on a syntax error before eval-file.

**PHP walker** (run with `php` in CI if `php` exists; otherwise a documented local-only script)

- 0-based: setting index `9` mutates array key `9`, not `8`.
- Group path `hero.title` does not invent a `hero_0_title` key.
- Flex: missing subfield on that layout errors with layout name.
- ACF absent: `{ ok: false, error: 'ACF is not active' }`.
- Image formatted array unwraps to ID.

Do not add a live-WordPress integration test against a real site in this PR. The fake-SSH + fake-spawn + PHP-without-WP (where possible) suite is the gate.

---

## Implementation order

1. `readStringArray` / long-string reader + census-friendly schemas.
2. `wp-eval-file.ts` + tests (this unblocks both remaining tools).
3. MCP `run_wp_cli` / `run_remote_wp_cli` wrapping the existing runner. Smallest visible win; agents can stop shell-quoting `wp option get home` immediately.
4. PHP walker + `wp-acf-payload.ts` + `get_wp_fields` (read-only, easier to verify).
5. `update_wp_fields` preview, then apply.
6. Public `wp_eval_file`.
7. Eval-ban error copy in `wp-cli-runner.ts` pointing at 5/6.

Do not ship 5 without 4. Do not ship 5 implemented as `wp option update`.

---

## Agent-facing description (what the schema text must say)

`update_wp_fields`:

- Required `location`. Remote uses the deploy env guard. Local uses this site's WordPress root (`path` + `localWpRoot`).
- Paths are 0-based. `modules.0` is the first flex row, matching efront `module_index` and matching `options_{field}_{n}_{sub}`.
- Preview by default. `apply: true` writes.
- A typo'd field name is an error. It will not create a stray option.
- Gutenberg ACF blocks are refused.
- After apply, object caches may still be hot; page-cache plugins are the agent's problem.

`get_wp_fields`: same paths, same target, no write.

That is enough for an efront agent to do `get_wp_fields(location=remote, env=staging, target={kind:option}, fields=["spacing_templates"])` then `update_wp_fields(..., fields=[{path:"spacing_templates.9.name", value:"…"}], apply:true)` without touching `/tmp`.

---

## Risks

| Risk | Why it is real | Mitigation |
|---|---|---|
| Off-by-one row writes | ACF docs 1-based vs storage 0-based | Path language = unformatted PHP arrays; tests lock index 9 → key 9; never call `update_sub_field` |
| Wrong host | Same class of bug `run_ssh_command` exists to prevent | Required `location`; envelope always includes `home` + `host` + `environment` |
| `env=local` collision | Environment names are user data | `location` is a separate required enum |
| Eval-file leftovers on a client's `/tmp` | Cancel mid-write | `finally` + `removeRemoteFile` which already runs unsignalled |
| Theme-only checkout | `wpDir` is not WordPress | Explicit error: local writes need a bootable WP root; use `location=remote` |
| Stale remote theme JSON | `acf_get_field` misses a field the agent sees in local `acf-json/` | Error names the target `home` and says the field is not registered **on that WordPress**; agent deploys first |
| Formatted image/relationship values | efront image return_format is array | Unwrap + warning |
| Page cache | WP Rocket on Avalon, NitroPack on TTI | Warning on apply; no plugin-specific purge |
| MCP stdio process vs GUI | Field tools need SSH secrets and `wp` on PATH | Same engine binding as `run_ssh_command`; no new privilege model |

---

## What this is not

- Not a replacement for the acf-json MCP. That MCP edits field **groups** in `acf-json/*.json`. This writes field **values** in the database of a running WordPress. Agents will use both: schema locally, values on the site.
- Not a replacement for agent-local `wp_cli`. Stack daemon stays the stack daemon. Muster-sites is the one that knows environments, the unmatched-branch guard, and ACF.
- Not `run_ssh_command` with nicer defaults. If the job is "restart php-fpm" or "tail error_log", that tool remains.

The motivating transcript's three tools collapse to: structured WP-CLI for boring verbs, ACF field get/update for content, eval-file for the leftover script. That is the right split.
