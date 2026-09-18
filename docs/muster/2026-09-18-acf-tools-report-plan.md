# ACF tools: acting on the Avalon test report

2026-09-18. Source: `/Users/jakevarrese/Sites/muster-acf-tools-report.md`, a hands-on test of `get_wp_fields`, `update_wp_fields`, `wp_eval_file`, `run_wp_cli` and `run_remote_wp_cli` against the Avalon site, local and staging, ACF 6.8.10 PRO with ACFE. Verdict there: reads, preview, apply and the atomic refusal all work across option, post, group-in-repeater-in-flex and clone-nested flex paths. Seven bugs and seven friction items follow, ranked by the tester.

Files: the PHP walker `src/main/sites/php/acf-fields.php` (+ `acf-fields.selftest.php`), the TypeScript side `src/main/sites/wp-acf-payload.ts`, `src/main/sites/mcp/site-mcp-wp-field-tools.ts`, `src/main/sites/wp-eval-file.ts`, and their tests. One agent owns the PHP file, one owns the TypeScript files, in every phase; they meet on the JSON contracts written here.

## Phase 1: bugs and the revert payload

Ship as Muster 1.14.13 after review.

| # | Report | Owner | Change |
|---|---|---|---|
| 1 | 2.1 `wp_eval_file` silently echoes a body with no `<?php` tag, `ok: true` | TS | In the `wp_eval_file` tool: if the trimmed body (after any BOM) does not start with `<?php` or `<?=`, prepend `<?php\n`. Never reject. Say so in the tool description. Test both cases. |
| 2 | 2.2 Container reads return raw composite keys | PHP | New `muster_acf_present( $field, $value )`: for repeater, flexible_content and group values, rebuild each row keyed by sub-field NAME (walk the layout's sub-fields, including clone children, with `muster_acf_value_slot`), keep `acf_fc_layout`, recurse into nested containers. Applied to `value`, `old` and `new` in every result. Writes keep accepting either keying. |
| 3 | 2.3 `acf_fc_layout` not readable | PHP | In `muster_acf_walk`, a field segment named `acf_fc_layout` on a flex ROW returns the layout string with `field: { name: 'acf_fc_layout', type: 'layout', ... }`. On write it is a per-path error: "acf_fc_layout is read-only; rewrite the row or use a row operation". |
| 4 | 2.4 Empty names in "Available" | PHP | `muster_acf_subfield_names` skips tab, accordion, message and empty names. |
| 5 | 2.5 No choice validation | PHP | In `muster_acf_coerce` for select, radio, checkbox, button_group: when `$field['choices']` is a non-empty array, any value not among its keys adds a WARNING (never an error, choices can be filter-populated at runtime). |
| 6 | 2.6 `apply_skipped` returns `ok: true` | PHP + TS | PHP envelope: `ok => false` when an apply was requested and skipped. TS `fieldResult` already derives `ok` from the PHP flag; adjust its test. `update_wp_fields` description: "ok is false when nothing was applied". |
| 7 | 2.7 Root `parent_layout` | PHP | When a path ends on a row index, `field` describes the container with `parent_layout: null` and a new `layout: '<row layout>'` key. |
| 8 | 3.6 Revert payload | PHP | On apply, add `revert: { target, fields: [ { path, value: old }, ... ] }` for every applied row, in a shape `update_wp_fields` accepts verbatim. Also present in preview so the agent can keep it before applying. |

Tests: PHP self-test cases for 2 to 8 (present() on the Avalon shapes: flex row, repeater rows, group, clone chain); TS tests for 1 and 6. Effort: PHP about 2 hours, TS about 45 minutes.

## Phase 2: discovery and wildcards

Ship as 1.14.14 after review. Both need PHP and TS; the contracts:

### Describe mode (3.2, and makes 2.3 rarely needed)

`get_wp_fields` gains `describe: true`. `fields` becomes optional in that mode; when given, each entry names a root or a container path to describe.

Response per root (or per given path):

```
{ path, field: { name, key, type, label },
  rows?: number,                         // repeater / flex
  layouts?: [ { name, label, sub_fields: [ { name, type, label, choices?, required? } ] } ],   // flex
  sub_fields?: [ ... ],                  // repeater / group
  row_layouts?: [ { index, layout } ],   // flex: one entry per row
  where?: { layout: '<name>', indexes: [ ... ] } }  // when `layout_filter` is set
```

Without `fields`, PHP lists the top-level fields whose groups apply to the target (`acf_get_field_groups( [ 'post_id' => ... ] )` then `acf_get_fields`), one entry each, containers with their row counts. `layout_filter: 'media'` answers "which rows use layout media". Cap output at 256 KB with a truncation notice; `sub_fields` omit `choices` longer than 50 entries with a count instead.

TS: `describe` and `layout_filter` args, schema, validation, tests against a canned PHP envelope. PHP: `mode: 'describe'`, the lister, the row/layout indexers, self-tests.

### Wildcards (3.4), read-only

Grammar: a `*` segment where an index is legal (repeater or flex rows). Several stars allowed. `get` only in this phase; `update_wp_fields` rejects a wildcard path with a clear error.

Response: one result per pattern, `matches: [ { index_path: [ 0 ], path: 'modules.0.section_id', value, field } ]`, plus `count`. Rows where the sub-field does not exist on that layout are listed under `skipped: [ { index_path, layout } ]`, not errors. Cap 2000 matches per pattern.

TS: `parseAcfPath` accepts `*` as `{ kind: 'wildcard' }`, refused in writes. PHP: expansion in the walker, self-tests on a 3-row fixture with mixed layouts.

Effort: PHP about 3 hours, TS about 1.5 hours.

## Phase 3: row operations (3.3)

Ship as 1.14.15 after review. `update_wp_fields` gains `rows: [ op, ... ]`, same `apply` default false, same atomic rule (any invalid op, nothing written), same revert payload.

```
{ op: 'append',    path: 'modules', layout: 'media', values: { ... } }        // layout required for flex, forbidden for repeater
{ op: 'insert',    path: 'modules', index: 3, layout?: ..., values: { ... } }
{ op: 'delete',    path: 'modules', index: 7 }
{ op: 'move',      path: 'modules', index: 7, to: 2 }
{ op: 'duplicate', path: 'modules', index: 7, to?: 8 }                        // default: right after the source
```

All operate on the unformatted root array and write once per root, as leaf writes do. `values` are name-keyed and pass through `muster_acf_coerce` per sub-field; missing sub-fields are left unset (ACF defaults). Preview returns `before_count`, `after_count` and the resulting `row_layouts`. Revert for append is a delete, for delete an insert of the removed row (full unformatted row), for move the inverse move.

Effort: PHP about 3 hours, TS about 1 hour.

## Deferred

- 3.5 `location: "both"` and `copy_field`: real value, but it is a new transport shape (two sessions in one call). Plan it after Phase 3 with the row ops in hand.
- 3.7 Multi-target in one call: cheap once wildcards exist (`target: { kind: 'post', ids: [...] }`). Fold into Phase 3 if time allows, otherwise next.

## Delegation

Each phase: two Opus agents, `acf-php-<phase>` owning the PHP pair, `acf-ts-<phase>` owning the TypeScript files and tests. Contracts above are the interface; the TS agent tests against canned envelopes, the PHP agent against the self-test stubs (see the harness pattern already in `acf-fields.selftest.php`). I review both diffs and re-run every check before each release, per the standing rule.

Phase 1 starts on approval. Phases 2 and 3 start when the previous phase has shipped, unless you want them queued behind the same agents immediately.

## Questions

1. Run Phase 1 only now, or queue Phases 1 and 2 on the same two agents back to back?
2. Row ops as `rows` on `update_wp_fields` (planned) or as a separate tool? A separate tool means one more name in the census and in every agent's prompt.
3. Wildcards read-only in Phase 2 (planned), or allow `apply` with wildcards from the start?
