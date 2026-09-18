# ACF tools: acting on the Avalon round 2 report

2026-09-18. Source: `/Users/jakevarrese/Sites/muster-acf-tools-report.md` (round 2), a re-test of 1.14.15 against Avalon local and staging. Six of seven round 1 bugs are confirmed fixed; wildcards, describe, row ops and revert all work when the response is small. Six new findings, all traced below.

Same split as the first plan: one agent owns `src/main/sites/php/acf-fields.php` plus its self-test, one owns the TypeScript files and their tests. Both agents from the first plan are still running with full context and take this as Phase 4. Ship as Muster 1.14.16 after review.

## Root causes

| # | Report | Cause | Owner |
|---|---|---|---|
| 1 | 2.1 flex `append`/`insert` write but report `applied: false`, no revert, top-level `apply: false` | `applied` compares the pending row (only the sub-fields the caller set) with the re-read row, which ACF fills with every sub-field of the layout. Strict equality fails, so `applied` is false, `revert_rows(require_applied)` drops the op, and `apply` (which is `any_applied`) reads as a preview. A repeater with all sub-fields given passes by luck. | PHP |
| 2 | 2.2 results over 50,000 chars fail as "invalid JSON" | `WP_CLI_MAX_OUTPUT_CHARS = 50_000` in `wp-cli-runner.ts`, applied by `finish()` in `wp-eval-file.ts` to every eval-file run. The walker's JSON is cut mid-object and `parseAcfRunnerOutcome` reports a generic parse failure although `output_truncated` is true. Local and remote share the same code. | TS |
| 3 | 2.3 `describe` unusable on a 25-layout flex field | Cause 2, plus `layout_filter` only annotates (`where`) and does not narrow `layouts` or `row_layouts`; choice labels are inline HTML swatches around 1 KB each and repeat on every layout through clones. | PHP |
| 4 | 2.4 `row_layouts` lists all 260 rows per op | `muster_acf_row_layouts` maps the whole array. | PHP |
| 5 | 2.5 multi-op `after_count` reads the final count | On apply, `after_count` and `row_layouts` are taken from the re-read root, so every op on one root reports the end state. | PHP |
| 6 | 2.6 choice warning not visible on `modules.0.module_bg_colour` | `muster_acf_warn_unknown_choices` appends to the top-level `warnings`; each result row carries `warnings: []` that nothing fills. Unverified second suspect: the leaf sits three clone levels deep and `muster_acf_layout_subfields` expands one clone level, so the def reaching `coerce` may lack `choices`. | PHP |

## PHP changes

1. **`applied` for row ops is a subset match.** New `muster_acf_rows_match( $container, $want, $stored )`: same row count, and for each row every key present in `normalise_row( want )` equals the same key in `normalise_row( stored )`, recursing into nested containers. Rows the op did not create come from storage and stay complete, so the check remains strict for them. Self-test stub `update_field` must fill every sub-field of the written layout with `''` (as ACF does) so the fixture reproduces the bug before the fix.
2. **`apply` reports that writes were issued.** In apply mode with no path errors, `apply => true` regardless of verification. Any row or op whose re-read does not match adds a warning naming the path: `write issued but the re-read did not match: <path>`. A response can no longer look like a preview after writing.
3. **Per-op counts are per op.** `before_count`, `after_count` and `row_layouts` come from the op's own result in preview and apply. Verification uses the root's final pending state against the final stored state, and the same `applied` flag applies to every op on that root. Say so in the one-line comment.
4. **`row_layouts` lists touched rows only.** Append, insert, duplicate: the landing row. Move: the row at `to`. Delete: empty. The full list stays available through `describe` and `modules.*.acf_fc_layout`.
5. **`layout_filter` narrows.** With a filter, `layouts` holds only the named layout and `row_layouts` only its rows; `where` stays. An unknown layout name is a per-path error listing the real names.
6. **Describe sheds label bulk.** Choice labels and field labels pass through `wp_strip_all_tags` and are cut to 80 characters with a trailing ellipsis; `choices` longer than 50 entries already collapse to a count.
7. **Path warnings land on the path.** Warnings raised while coercing a path go into that result row's `warnings` as well as the top level. Self-test: a radio with choices nested two clone levels deep inside a flex layout, preview a value outside the choices, assert the warning appears in both places. If the def reaching `coerce` has no `choices`, fix `muster_acf_layout_subfields` to expand clones recursively.
8. **Slimmer wildcard matches.** Each match carries `field: { key, type }` only; name, label and parent belong to `describe`. `count`, `skipped` and the per-pattern envelope stay as they are.

Self-test blocks for each. `php -l`, self-test `ok`.

## TypeScript changes

1. **Bundled runners get a larger output cap.** `WpEvalFileRequest.maxOutputChars?`; `finish()` takes the cap as a parameter defaulting to `WP_CLI_MAX_OUTPUT_CHARS`. `runEval` in the field tools passes `WP_EVAL_BUNDLED_MAX_OUTPUT_CHARS = 1_000_000` when the body is the bundled walker, the same way it already picks the 256 KB body cap. `wp_eval_file` and `run_wp_cli` keep 50,000. Confirm the remote exec helper has no second buffer below 1 MB; if it does, raise it for this call only.
2. **Truncation is a named error.** When `output_truncated` is true and the stdout is not parseable JSON, `fieldResult` throws `ACF runner output was cut at N characters. Narrow the request: fewer paths, a layout_filter, or describe one container.` instead of the generic parse failure.
3. **Descriptions.** `get_wp_fields`: `layout_filter` narrows the description to one layout. `update_wp_fields`: `row_layouts` covers the rows the op touched; `apply` is true whenever writes were issued and per-path `applied` says whether the re-read matched.

Tests: the cap parameter on both runners, the truncation error path, and the census check on descriptions. `pnpm exec vitest run src/main/sites`, `tsc` with `--composite false --incremental false`, oxlint, oxfmt. No file over 300 lines, no lint disables.

## Not a tool bug

The tester's double `delete index 259` on post 672 and the repair through `download_files` are recorded in the report; the row-op revert fix above would have covered the first delete. The `add_post_meta` unslashing note is WordPress behaviour and stays out of scope.

## Release

1.14.16 after I review both diffs and re-run the full check set, per the standing rule. Release notes list the six findings with their outcomes.

## Questions

1. Wildcard match slimming (PHP 8) changes a shape shipped an hour ago in 1.14.15. Keep it in, or leave `field` per match as is?
2. The 1 MB output cap for the bundled walker: enough headroom, or would you rather add paging to wildcard matches as well?
