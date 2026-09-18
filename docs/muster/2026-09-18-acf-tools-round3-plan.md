# ACF tools: acting on the Avalon round 3 plan

2026-09-18. Source: `/Users/jakevarrese/Sites/muster-acf-tools-plan.md`, written by the Avalon agent after a third pass against 1.14.16. Correctness is confirmed on local and staging; every item below is ergonomics. The tester ranks them 1 to 4 and names two smaller ones. `describe` with `layout_filter` and clone flattening stay as they are.

Same two agents, same file split: `acf-php-phases` owns `src/main/sites/php/acf-fields.php` and its self-test, `acf-ts-phases` owns the TypeScript. Two phases, one release (Muster 1.14.17), with a review and the full check set after each phase.

## Phase 5: smaller responses, compare, multi-target

### Response projection (tester item 1)

`get_wp_fields` and `update_wp_fields` take `return: "full" | "values"`, default `"full"`, which is byte-identical to today.

PHP shapes the results, so the bytes never cross the transport:

- get, `"values"`: a plain path is `{ path, value }`; a wildcard match is `{ index_path, value }`. The pattern-level `field: {key, type}`, `count` and `skipped` stay.
- preview and apply, `"values"`: each result drops `field`; each op drops `row_layouts`; `applied`, `changed`, `warnings`, counts and the whole `revert` stay. `revert` is never abbreviated at any setting.

TypeScript trims the envelope in `fieldResult`: `"values"` omits `site_id`, `host`, `wp_root` and `command`; `ok`, `warnings`, `location`, `site` and `environment` always stay. Expected size for the tester's 259-match case: about 10 KB, where each match is `{"index_path":[n],"value":"white"}`; the tester's 8 KB is the goal, not a promise.

### Local and remote compare with checksums (tester item 2)

`get_wp_fields` accepts `location: "both"` (read only; `update_wp_fields` keeps local or remote). TypeScript runs the same payload against local and the resolved environment, then merges in a new pure module `wp-acf-compare.ts`:

- a plain path becomes `{ path, field?, local, remote, differs }`, where `local` and `remote` are the values (or `null` with `exists: false` on that side);
- a wildcard becomes `{ path, field, count: { local, remote }, matches: [{ index_path, local, remote, differs }], only_local: [index_path], only_remote: [index_path] }`;
- the top level gains `differs_count`, and either side's own error is carried under that side.

`checksum: true` on `get_wp_fields` replaces values with digests. PHP `mode: 'checksum'`: per requested path `{ path, digest }`; with `fields` omitted, one entry per usable root of the target plus a top-level `target_digest` over the sorted root digests. Digest algorithm, stated in the tool description: sha1 of JSON with every associative array's keys sorted recursively, lists kept in order, scalars passed through the walker's existing normalisation (so `null`, absent and `""` are one state and numbers compare as strings), encoded with unescaped slashes and unicode. Both hosts run the same walker, so digests compare across them. `checksum` combines with `location: "both"`, which is the one-call "is staging still identical".

### Multi-target (smaller item 1)

`targets: [{kind, id}, ...]` (at most 20) on `get_wp_fields` and `update_wp_fields`, exclusive with `target`. PHP loops in one run and returns `targets: [{ target, ...envelope }]`; the top-level `ok` is true only when every target's is. Writes stay atomic per target, not across targets; the description says so. `targets` with `location: "both"` is refused in this phase.

### Mismatch warning on its row (smaller item 2)

The `write issued but the re-read did not match` warning is appended to the affected result row's own `warnings` (and op row's) as well as the top level. One PHP change plus a self-test assertion.

### Phase 5 tests

PHP self-test blocks for projection shapes, checksum stability across key order and scalar type, multi-target with one failing target, and the per-row mismatch warning. TypeScript: `return` and `targets` validation, the compare merge on canned envelopes (differing, one-sided, wildcard), `location: "both"` running two evals and refusing on `update_wp_fields`, and the census. All current checks stay green; no file over 300 lines, no lint disables.

## Phase 6: server-held reverts, snapshot and restore

Both need a place to keep state and the digest primitive from Phase 5.

### State store

New `src/main/sites/wp-acf-state-store.ts`. Records are JSON files under an `acf-state` directory beside the run-log base directory that `site-mcp-entry` passes to the engine: `acf-state/<siteId>/<token>.json`. A record holds `{ kind: 'revert' | 'snapshot', token, site_id, location, environment, target, when, summary, digests: { <root>: sha1 }, consumed?, payload }`. Tokens are 8 hex characters from `randomBytes`. Retention on every write: reverts keep the newest 20 per site and drop anything older than 24 hours; snapshots keep the newest 10 per site and drop anything older than 7 days. The context exposes the store to tools the way it exposes the step library.

### Server-held reverts (tester item 3)

- PHP: every apply response gains `digests: { <root name>: sha1 }` over the re-read roots, computed with the checksum algorithm.
- `update_wp_fields` on `apply: true` stores the inline `revert` plus those digests and returns `revert_token` beside `revert`, which is unchanged.
- `update_wp_fields` accepts `undo: "<token>"`, exclusive with `fields`, `rows` and `targets`. Flow: load the record; a consumed token is refused with the reason and the original summary; run PHP `checksum` on the touched roots at the record's target and location and refuse on any mismatch naming the root; replay the rows half, then the fields half, as two PHP runs in that order, honouring `apply` (a preview previews both halves); on `apply: true` stop after the rows half if it fails, then mark the record consumed only when both halves applied. The replay's own `revert` and `revert_token` come back as usual.
- New tool `list_wp_reverts` (`site?`, `limit?` default 20): `[{ token, target, location, environment, when, summary, consumed }]`, newest first. A separate tool costs one census name but is findable from a fresh session, which is the point.

### Snapshot and restore (tester item 4)

- PHP `mode: 'snapshot'`: for every usable root of the target, or the root names given in `fields` (a sub-path is refused), the unformatted stored value from `muster_acf_load_root_value` plus its digest. Because a large target exceeds the 1 MB output ceiling, the walker writes the snapshot JSON to `<payload path>.out` and prints a small envelope `{ ok, output_file, bytes, digests, target_digest }`.
- TypeScript: `WpEvalFileRequest.collectOutputFile?: true`; the local runner reads and unlinks the file, the remote runner downloads it through `session.download` and removes it, and the result carries `outputFileContents`. Cap 64 MB.
- New tool `snapshot_wp_fields` (`location`, `target`, `fields?`): stores a `snapshot` record and returns `{ token, target, paths, when, digest }`.
- New tool `restore_wp_fields` (`token`, `apply?` default false, `location?` override): loads the record and runs PHP `mode: 'restore'` with `roots: { <root name>: value }`. Preview returns per root `{ path, changed, rows: { before, after }, digest: { before, after } }` and no values. Apply writes each root through `update_field`, which rebuilds rows and removes any beyond the snapshot's count, then verifies `digest.after` against the snapshot digest and reports `applied` per root. The bundled sidecar cap rises to 32 MB for this mode, since the snapshot travels back as the payload. The description states that values go through `update_field`, never raw meta, and that `add_post_meta` unslashes serialized values and is not a safe route. A cross-host restore needs the same post ID on both sides; the description says so.

### Phase 6 tests

Store: retention, consumed flag, corrupt file skipped. Undo: consumed refusal, drift refusal naming the root, rows-then-fields order, preview honours `apply: false`, stop after a failed rows half. Snapshot and restore: output-file collection on both runners with a canned file, restore preview shape, digest verification, refusal of a sub-path in `fields`. PHP self-tests for `snapshot`, `restore` (including a shorter row count rebuilding), and `digests` on apply.

## Order and gating

Phase 5 starts on approval and Phase 6 follows it directly; both ship in one release, 1.14.17. After each phase: both agents report, I read the diffs, run php -l, the self-test, vitest on `src/main/sites`, tsc with `--composite false --incremental false`, oxlint and oxfmt, then commit both halves. The bump and release follow the Phase 6 review.

## Questions

1. `list_wp_reverts`, `snapshot_wp_fields` and `restore_wp_fields` are three new census names. Fine, or fold snapshot and restore into one `wp_field_snapshots` tool with an `action`?
2. Retention: 20 reverts for 24 hours and 10 snapshots for 7 days per site. Different numbers?
3. `location: "both"` stays read only. A `copy_field` from one side to the other is a small extra on top of compare; include it in Phase 5 or leave it out?
