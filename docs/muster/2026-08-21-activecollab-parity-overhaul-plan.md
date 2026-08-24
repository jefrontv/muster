# ActiveCollab Parity Overhaul — Plan

2026-08-21. Goal: make the Tasks area feel like a first-class ActiveCollab client, not a viewer with a comment box. Everything below is grounded in the current implementation (19 endpoints, ~180 files) and the ActiveCollab v1 self-hosted API.

## Where we are

**Solid foundation.** Auth + encrypted credential store, hardened HTTP client (retry, redaction, auth-shaped-500 handling), My Work list grouped by project, project drill-in, task workspace side panel (complete/reopen, assignee, due/start date, labels, hidden-from-clients), rich comment composer (mentions, attachments, lightbox), local unread tracking with change-detection polling, MCP credential seeding, site binding + start-work.

**What makes it feel like a "cheap extension" today:**

1. Task detail is shallow — no subtasks, no estimates/tracked time, no watchers, no priority, read-only title/description, comments can't be edited or deleted.
2. My Work is a flat due-date list — no Today/Overdue/Upcoming structure, no filters, no text search, no keyboard nav, can't create a task from it.
3. Unread is a local diff, not ActiveCollab's real notification stream — read state doesn't sync with the web app, and there's no inbox of mentions/assignments.
4. No time tracking at all — for an agency this is half the point of ActiveCollab.
5. Project view is minimal — task lists are render-only groups; no reorder, no move between lists/projects, no completed-task browsing, no full projects browser.
6. No global search, no deep links (open-in-web / copy link / paste an AC URL to jump).

## API surface available but unused (verified against developers.activecollab.com)

| Area | Endpoints |
|---|---|
| Subtasks | `GET/POST projects/:p/tasks/:t/subtasks`, `PUT complete/subtask/:id`, `PUT open/subtask/:id`, `POST .../subtasks/:id/promote-to-task` |
| Time | `GET/POST/PUT projects/:p/time-records`, `GET .../filtered-by-date`, `GET users/:id/time-records`, `GET job-types` |
| Estimates | `estimate` + `job_type_id` on task PUT; `tracked_time` on task detail |
| Task lists | `GET/POST/PUT projects/:p/task-lists`, `PUT projects/:p/tasks/reorder` (`task_ids` + `task_list_id`) |
| Move/copy | `PUT projects/:p/tasks/:t/move-to-project`, `.../copy-to-project` |
| Notifications | `GET notifications`, `GET notifications/object-updates`, `GET notifications/object-updates/recent` (top 5 + unseen count), mark-read |
| Activity | `GET whats-new`, `GET whats-new/daily`, `GET projects/:p/whats-new`, `GET users/:id/activities` |
| Subscribers | `GET/POST/DELETE subscribers/task/:id`, per-user subscribe/unsubscribe |
| Comments | `PUT comments/:id`, `DELETE comments/:id` |
| Search | `GET search?q=...&project_id=...`, `GET search/suggest` |
| Fields we already receive but drop | `task_number`, `task_list_id`, `position`, `is_important`, `estimate`, `job_type_id`, `comments_count`, `total_subtasks`, `open_subtasks`, `created_by_id`, `tracked_time` |

## Phases

Ordered by user-visible value per unit of risk. Each phase ships independently.

### Phase 1 — Deep task detail (the "real client" moment)

The workspace panel becomes the full task, not a summary.

- **Model widening**: carry the dropped fields through `shared/activecollab-types.ts` + `main/activecollab/codecs.ts` (`isImportant`, `taskNumber`, `taskListId`, `position`, `estimate`, `jobTypeId`, `trackedTime`, `totalSubtasks`, `openSubtasks`, `commentsCount`, `createdById`).
- **Subtasks section** in `ActiveCollabTaskWorkspace`: checklist with add/complete/reopen, assignee + due date per subtask, promote-to-task, progress indicator (`3/7`) on task rows in both lists.
- **Editable title + description**: reuse `activecollab-rich-body-editor.tsx` (already exists for create dialog); PUT `name`/`body`.
- **Comment edit/delete** (own comments only): hover actions on `activecollab-task-comment-thread`, `PUT/DELETE comments/:id`, optimistic with rollback like existing writes.
- **Priority**: `is_important` toggle in the metadata bar; important tasks get a marker in list rows.
- **Watchers**: avatar stack in metadata bar, subscribe/unsubscribe self, add others (`subscribers/task/:id`).
- **Estimate display**: read-only `estimate` + `tracked_time` ("2.5h of 8h") in metadata bar — editing arrives with Phase 3 job types.
- Main-process work: ~8 new query/mutation functions, matching IPC channels + RPC methods, write-echo into the poll snapshot so your own edits don't self-notify. **Shipped.**

### Phase 2 — My Work that plans your day

- **Time-bucket sections**: Overdue / Today / This week / Later / No due date, with per-project grouping inside each (current grouping becomes secondary). Toggle between "by date" and "by project" (persisted view preference).
- **Inline filter bar**: text filter (name + task number), label filter, project filter, "important only".
- ~~**Global search**: `search?q=` behind a debounced overlay.~~ **Built, then removed** — see the capability table. The endpoint 500s on the target instance and no code change fixes that, so rather than ship an affordance that only ever explains itself, the whole vertical came out: module, IPC channel, RPC method, transport, store action, unsupported latch, overlay. Restore from git if an instance with a search index ever needs it.
- **Quick-create from My Work**: existing create dialog, plus project picker step.
- **Keyboard navigation**: ↑/↓ move selection, Enter opens, platform-aware modifiers per cross-platform rules.
- **Row upgrades**: subtask progress, comment count, importance marker, label chips (currently labels only render in detail).
- **Shipped**, plus the notifications bell pulled forward from Phase 5: `notifications/object-updates` behind a "My Updates" popover in the My Work header (task name, project, relative time, paged in place, row opens the task).

#### Instance capability findings (target self-hosted instance, verified live)

| Endpoint | Verdict |
|---|---|
| `GET search?q=` | **500s.** ActiveCollab search runs on ElasticSearch, which self-hosted treats as OPTIONAL and this instance has not configured. Not a route bug — no code change makes it work. Feature REMOVED end to end rather than left showing an explanation. |
| `GET notifications/object-updates` | **Works.** Returns real rows with the `related.Project` name join. AC 6.x is independently reported to 500 on `GET /notifications`, so an `api`-refusal latch still guards this path. |

Two traps this endpoint hides, both handled in `main/activecollab/notifications.ts`: `updates` is a keyed count object OR an empty array, and `total_unread: -1` means "not computed", not zero.

Two more things measured live, both worth knowing before Phase 5 is finished. AC's `total_unread` read **0** while Muster's local badge read 3 for the same account: they answer different questions (read-in-ActiveCollab vs opened-in-Muster) and cannot agree without a mark-read route. And **there is no documented mark-read mutation in v1** — the web UI's "Mark all as read" uses an undocumented internal route — so two-way read state is NOT buildable on documented API and has been dropped from the plan. Every row on this instance also came back with `updates: []` and `total_unread: 0`, so the panel is "recently-updated things you follow", not "unread".

#### Phase 5 status

- **Shipped: @-mention banners.** A fifth notification source, `activecollab-mention`, sourced from the notifications stream because a mention leaves NO trace in the assigned-task diff the poller compares. `mention-detector.ts` holds the dedupe rule (first run seeds silently; a mention fires only when its `last_update_on` advances; undated rows are skipped AND not recorded; entries carry forward rather than prune, bounded by recency) and a per-credential marker rides the existing snapshot file. Banner-only by design: `acMergeTaskUnread` prunes unread against the assigned-task fetch, so a mention on a task you are NOT assigned could never be cleared by reading it — the bell panel is its durable surface. Off by default, one extra request per poll only while on.
- **Shipped: update kinds in the bell.** The stream's `kinds` were fetched and discarded; rows now say what changed, mentions carrying an `@` and the accent colour. Unrecognised wire kinds stay silent rather than being named.
- **Not built: project activity timeline** (`GET projects/:p/whats-new`). Specced, never implemented.

### Phase 3 — Time tracking

The biggest net-new capability; makes Muster a place you *work from*, not just read from.

- **Log time on a task**: dialog with hours, date, job type, billable toggle, summary → `POST projects/:p/time-records`.
- **Task timer (stopwatch)**: local start/pause/stop per task in the workspace header; on stop, pre-fills the log dialog. Timer state lives in main so it survives renderer reloads; menubar/tray shows a running timer.
- **Time on the task detail**: list of the task's time records, tracked vs estimate bar, estimate + job type editing (completes Phase 1's read-only display).
- **My timesheet**: a week strip view of my time records (`users/:id/time-records` filtered by date) with day totals — a lightweight take on AC's Timesheet tab.

### Phase 4 — Projects as a first-class space

- **Projects browser**: proper all-projects screen (category/client grouping, favorites) rather than the sidebar picker only.
- **Task lists become real**: create/rename lists, move tasks between lists (`task_list_id` on PUT), drag-reorder within/between lists via `PUT projects/:p/tasks/reorder`, collapse per list.
- **Completed tasks**: per-list "show completed" (paged) so lists match AC web.
- **Move/copy task to another project** from a task-workspace overflow menu.
- **Full-field create dialog**: task list, labels, estimate/job type, hidden-from-clients, subscribers.

### Phase 5 — Real notifications + activity

Replace "local diff guessing" with ActiveCollab's own stream.

- **Notifications API as change source**: poll `notifications/object-updates/recent` (cheap: top 5 + unseen counts) instead of re-fetching full task pages; keep the snapshot differ as fallback for old instances.
- **Two-way read state**: opening a task marks the AC notification read server-side; badge finally matches the web app and your phone.
- **Inbox panel**: chronological mentions/assignments/comments/completions with jump-to-task — replaces nothing, sits beside My Work.
- **Activity tab on projects**: `projects/:p/whats-new` timeline.
- Desktop notifications get richer payloads (who, what kind, snippet) from the same stream; existing notification-style settings keep working.

### Phase 6 — Interop polish

- **Deep links**: "Open in ActiveCollab" + "Copy link" on tasks/projects/comments (instance URL is already stored); paste an AC URL anywhere task-aware and Muster resolves + opens it in the panel.
- **Comment drafts**: persist composer content per task (survives panel close/app restart).
- **Empty states + toasts**: designed empty states for no-tasks/no-projects; in-app toast on mention/assignment while the app is focused (OS notification already covers unfocused).
- **Cache/polling tuning**: ETag/if-modified handling if the instance supports it; faster refresh-after-write.

## Architecture notes (all phases)

- **Pattern reuse, no second convention**: new endpoints go in `main/activecollab/` beside `tasks.ts`/`mutations.ts` using `AcHttpClient`; every quirk stays in `codecs.ts` (0-as-null, epoch→local-day, label shape). Renderer reads go through `activecollab-cache.ts` scoping; writes through the optimistic-update + rollback path in `activecollab-writes.ts`.
- **IPC + RPC in lockstep**: each new channel needs the ipcMain handler and the runtime RPC twin, plus an entry in the `ACTIVECOLLAB_CHANNELS` allowlist (a guard test in `ipc/activecollab.test.ts` asserts the exact set). There is no `RPC_REQUIRED_SCOPE` table in this repo — the only fail-closed RPC gate is `MOBILE_RPC_METHOD_ALLOWLIST` in `main/runtime/runtime-rpc.ts`, which gates mobile-scope devices only; runtime-scope integrations (`activecollab.*`, `jira.*`) are deliberately absent from it.
- **Instance compatibility**: self-hosted AC versions vary. Every new endpoint gets a capability probe or graceful 404/501 degradation (hide the UI affordance rather than erroring), same posture as the Git compatibility rules.
- **Design system**: all new UI uses `docs/STYLEGUIDE.md` tokens + existing shadcn primitives; no new color/shadow/size values.
- **Testing**: same conventions as existing suites — stubbed `AcHttpClient` routes for main, vitest component tests for renderer (electron mocks with `safeStorage/app: undefined`).

## Suggested sequencing & sizing

| Phase | Size | Depends on |
|---|---|---|
| 1 Task detail | L | — |
| 2 My Work | M | 1 (widened model) |
| 3 Time tracking | L | 1 (job types shared) |
| 4 Projects | L | 1 |
| 5 Notifications | M | — (parallel-safe) |
| 6 Polish | S–M | any |

Phases 1+5 can start in parallel (disjoint code paths: task detail vs poller/notifications). 2 follows 1 quickly. 3 and 4 are independent of each other after 1.

## Open questions

1. **Phase priority** — is time tracking (3) more urgent than My Work restructuring (2) for your workflow?
2. **Inbox placement** — separate sidebar item vs a tab within Tasks?
3. **Timer scope** — is a local stopwatch (log-on-stop) enough, or do you want it synced/visible to teammates (AC's stopwatch API is not exposed in v1; local-only is the honest option)?
4. **Discussions/Notes/Files** — deliberately excluded to keep the overhaul task-centric. Worth a later phase?
5. **Reactions on comments** — v1 API support varies by instance version; probe-and-hide, or skip?
