# Chat mode refactor, modelled on DeepSeek Harness

Status: approved 2026-10-19 with all five decisions in section 3 accepted as recommended.

Research behind this plan (all with file:line citations):

- [DSH visual design](research/2026-10-19-dsh-visual-design.md): tokens, layout, rows, composer, motion
- [DSH chat mechanics](research/2026-10-19-dsh-chat-mechanics.md): data model, transport, store, scroll, approvals, tests
- [Muster chat inventory](research/2026-10-19-muster-chat-inventory.md): what exists today, problems, what to salvage from `feature/chat-redesign`

Reference repo: `github.com/deepseek-ai/deepseek-harness` at `687f282e` (2026-10-17), MIT. Porting code is allowed with the MIT notice added to `THIRD_PARTY_NOTICES`. Brand assets (whale, name, logo) are not.

## 1. Why the current chat feels bad

1. **Three sources of truth.** The live stream supplies text only, the CLI's JSONL transcript watcher supplies messages and tools, and agent hooks supply status and session id. About a dozen renderer modules (seal timer, typewriter, pending-echo pruning, status merge) reconcile them. That reconciliation causes late tool rows, text that vanishes and reappears when the streaming bubble swaps for the transcript row, and the scroll jumps.
2. **Chat mode borrows Code mode's terminal-chat view.** `ChatThreadView` pretends to be a terminal pane so it can reuse `NativeChatView`. About 30 files branch on chat vs code, so every chat fix risks Code mode and mobile.
3. **Most of the protocol is dropped.** The decoder keeps text deltas and drops thinking, tool input deltas, tool results, progress, subagents and cost. AskUserQuestion goes back as a `deny`. A model or effort change kills and resumes the process instead of sending `set_model`.
4. **The renderer owns sessions.** A reload forgets live processes. With the window closed, approvals stall. Stop is one SIGKILL that orphans Bash children. Review items R12, R13, R15, R16 and R18 are still open.
5. **303 files and 56 hooks.** The composer alone imports 25 hooks. One send passes through more than 15 files.

## 2. What DSH does that we copy

### Mechanics

1. **One log, one reducer.** Main parses every stream-json line once, gives it a monotonic `seq`, and folds it into the thread model. Live and replayed history go through the same reducer, so reload equals live.
2. **Fold by stable id.** An assistant step is keyed by `message.id`, a tool call by `tool_use.id`. Each concept has a small definition (`match`, `start`, `update`). Appending a line touches one entry.
3. **Transient vs durable rows.** `stream_event` partials build a transient row. It is retired when the full `assistant` line for that `message.id` arrives. No swap between two components.
4. **Snapshot then numbered patches** from main to renderer: subscribe, get a snapshot, then `replace | append | settle` patches with a revision number. A gap triggers a full replace.
5. **`order[]` plus per-row subscriptions.** The list re-renders only on structural change. A token re-renders one row.
6. **Cadence by event type.** Text and JSON deltas batch per animation frame. `tool_result` and `result` flush at once.
7. **Partial JSON reader** for `input_json_delta`, so a running Edit or Bash row shows its arguments while they stream. Streaming markdown freezes all but the last two blocks.
8. **Approvals and questions take over the composer**, keyed by `tool_use_id`, at the same width. Precedence: plan review, then question, then approval. Pending requests live in main and replay to a reloaded renderer.
9. **Scroll follows intent.** Only wheel, touch, pointer drag and scroll keys release stick-to-bottom. Layout changes never do. 24px threshold, forced follow on own send, per-thread anchor memory, anchor kept when older history pages in.
10. **Two registries, no plugin framework.** `Map<nodeKind, Component>` for rows and `Map<toolName, Component>` for tools, with a generic tool card fallback and an error boundary per renderer. Tool views read pure model functions that unit tests cover.

Skipped: the Cordis plugin graph and the typed slot algebra. They solve a third-party plugin problem Muster doesn't have.

### Visual

1. **One width variable** for transcript, composer, approval card, question card and turn navigator: `clamp(680px, 64%, 920px)`. Swapping the composer for an approval never changes width.
2. **User and assistant look different.** User: pale tinted bubble, about 70% of the column, 14/22 text, 10px by 16px padding, no border or shadow. Assistant: bare 14/24 prose with no bubble. Message actions appear on hover by opacity only, so nothing shifts.
3. **One 13px tier for process rows.** Tool, reasoning and group rows are 24px tall with a 16px icon box and tertiary text. On hover the icon crossfades to a chevron. A finished turn folds into one header line ("Worked for 12s").
4. **Weight never above 500.** Hierarchy comes from four ink levels (primary, secondary, tertiary, caption), not size or bold.
5. **Hairlines and soft shadow.** Raised surfaces use a 0.5px outline drawn as the first shadow layer and ambient shadow at 8% opacity or less.
6. **Composer:** large radius card with a soft shadow, a fixed 36px fade band above it, `scrollbar-gutter: stable` on the transcript. Send and Stop are the same 34px circle so swapping them moves nothing. Queued messages show as a tab on the composer's top edge.
7. **Motion at 160ms or less.** Collapse fades first, then shrinks, with the scroll position corrected on the same frame. Running state uses a text shimmer and tabular-nums timers. Reduced motion gets a static icon.
8. **Fade masks** wherever content clips: 24px at scroll edges, 48px on streaming thinking summaries.
9. **Empty state:** a single line of large type, a workspace chip and the centred composer. No suggestion cards.

## 3. Decisions (settled)

1. **How closely to copy the look.** Recommendation: translate DSH onto Muster's tokens and add a small set of chat-scoped tokens to `main.css` and `STYLEGUIDE.md`: content width, user bubble fill, four ink levels, process-row size, hairline shadow. DSH's radii (20px bubble, 28px composer) and 0.5px hairlines don't exist in Muster's scale today, so this is a styleguide change, not a one-off.
2. **Approvals as composer takeover only** (DSH) or also an inline card in the transcript. Recommendation: takeover only, with the matching tool row showing the command.
3. **SSH in v1.** Recommendation: build a host seam in the engine (process and transcript run where the workspace lives), ship local first, wire SSH in a follow-up. Chat is local-only today.
4. **"Always allow".** Recommendation: keep it and send it to the CLI through `updatedPermissions` so the policy lives in Claude settings, not the renderer.
5. **Branch.** Recommendation: new branch `feature/chat-refactor` off current `muster`. Port the engine from `feature/chat-redesign` file by file instead of merging that branch, which is 81 commits behind.

## 4. Phases

Estimates assume one agent working with tests. They are rough until phase 1 lands.

### Phase 1: main-process engine (2 to 3 days)

1. Port `src/main/chat-mode/engine/*`, `src/shared/chat-engine-types.ts`, the control client, the idle reaper, the process-group stop and the fake CLI fixture from `feature/chat-redesign`.
2. Reconcile its queue model with current `chat-thread-message-queue.ts` (queue, steer, delivery acks through `--replay-user-messages`).
3. Restructure the reducer as fold-by-id definitions with transient partials (section 2, mechanics 1 to 3).
4. Move ownership into main: session records, pending approvals, auto-approve policy, titles, notifications, unread.
5. Model and effort changes go through `set_model` and the thinking-token control request, with relaunch only as a fallback.
6. Spawn by argv with a resolved `claude` binary and run `prepareClaudeAuth` first (R12, R21). Stop sends SIGTERM to the process group, then SIGKILL, and relaunch waits for the old child (R15).
7. Snapshot-then-patch IPC with revision numbers, replacing the ten `chatThreadStream:*` channels.

Done when: replay tests over recorded stream-json sessions give the same snapshot for (a) the whole file at once and (b) a prefix plus line-by-line append. A renderer reload mid-turn keeps the turn running and shows the pending approval.

### Phase 2: renderer view model and new thread surface (2 to 3 days)

1. New `components/chat-thread/` surface that does not use `NativeChatView`. Code mode and mobile keep `NativeChatView` untouched.
2. Engine client with `order[]` and per-row `useSyncExternalStore` selectors; rAF batching for deltas.
3. Row registry by node kind and tool registry by tool name with generic fallback and error boundaries. MCP tools match by full name with a `mcp__server__` prefix fallback.
4. Tool view models first: Bash (exit status counts as error), Edit and Write (live diff from `old_string`/`new_string`, capped at 9 lines until expanded), Read, Grep and Glob, WebFetch and WebSearch, TodoWrite, Task subagents, AskUserQuestion.
5. Streaming markdown that freezes settled blocks.

Done when: the new surface renders a recorded session identically live and from history, and a streaming token re-renders one row (checked with React Profiler).

### Phase 3: visual layer (3 to 4 days)

1. Tokens per decision 1, added to `main.css` with light and dark values and documented in `STYLEGUIDE.md`.
2. Layout: shared width variable, sticky composer seat with fade band, stable scrollbar gutter, back-to-bottom button above the composer.
3. Rows: user bubble, assistant prose, disclosure row primitive, tool rows, reasoning row, grouping of consecutive tool calls, turn fold header, running status, error and interrupted states.
4. Composer: card, toolbar with model and effort picker, attachments, `/` and `@` menus, Send/Stop swap, queue tab, context meter. Approval, question and plan-review takeovers at the same width.
5. Empty state and the chat sidebar rows (running spinner, completion dot, pending-interaction badge).

Done when: the screen UX rubric in `STYLEGUIDE.md` passes in light and dark, and side-by-side screenshots against DSH show matching spacing and hierarchy.

### Phase 4: scroll and navigation (1 day)

1. Intent-based follow (section 2, mechanics 9) replacing the four current scroll mechanisms.
2. Paged history with anchor preservation.
3. Turn navigator rail, virtualized.

Done when: scroll specs pass with fake timers and a timer-leak check, and the wheel-input benchmark shows no jumps (see the virtualizer benchmark memory).

### Phase 5: cutover and cleanup (1 to 2 days)

1. Route Chat mode to the new surface; delete the chat branches inside `native-chat/` and the old renderer pipeline (seal timer, typewriter, echo pruning, stream event installer).
2. Keep every feature in the inventory's constraint list: queue and steer, image attachments, workspace brief, muster MCP connector, ActiveCollab chips, auto-titles, search, notifications, context meter, drafts, pin, unread, archive, drag order, resume.
3. Playwright e2e on the fake CLI: send, stream, tool approval, question, stop, reload mid-turn, model switch.
4. Hide Chat on Windows until argv spawn is verified there.

Done when: the full test suite has no new failures (the documented environmental ones aside), Code mode's agent chat is unchanged, and the user signs off in the dev app.

## 5. Out of scope

- SSH execution (seam only, per decision 3).
- Changes to Code mode's `NativeChatView` or the mobile app.
- DSH features with no Claude Code equivalent: goals, schedules, workflows, deliverables, the plugin market.
