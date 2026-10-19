# Muster Chat mode inventory (pre-refactor)

Branch inspected: `muster` @ bdcbf826ae (1.15.6). Parked redesign: `feature/chat-redesign` @ b878460c95, branched from 0fede2dcd7 (1.14.30). `muster` is 81 commits ahead of that base; the redesign branch is one squashed commit.

All paths are relative to `/Users/jakevarrese/Sites/muster-ui`.

---

## 0. Scale at a glance

Files with "chat" in the path, excluding tests: **303 files, ~35,400 lines**. Plus 154 test files.

| Area | Files | Lines |
|---|---|---|
| `src/renderer/src/components/native-chat` | 153 | 18,548 |
| `src/renderer/src/components/chat-mode` | 36 | 4,458 |
| `src/shared` (native-chat-*, chat-*) | 34 | 3,159 |
| `src/main/native-chat` (transcript reading/watching) | 22 | 2,751 |
| `src/main/chat-mode` (stream child, store, models) | 23 | 2,283 |
| `src/renderer/src/lib` (chat-thread-*, native-chat-*) | 13 | 1,053 |
| `src/main/ipc` (chat-mode, chat-thread-stream, native-chat, chat-connector) | 5 | 1,011 |
| `src/main/chat-connector` (in-process "muster" MCP) | 7 | 968 |
| `src/renderer/src/store/slices` (chat-mode + permission/lifecycle/queue) | 4 | 626 |

No single file is oversized: the lint `max-lines` rule keeps every file under ~450 lines. The problem runs the other way. Logic is spread across many tiny files: `native-chat/` alone has **56 `use-*` hooks**, and `NativeChatComposer.tsx` imports 25 of them.

Chat mode does not have its own transcript UI. It renders through **`NativeChatView`**, the Code-mode "chat view over an agent terminal pane" that came from Orca. Code mode (`terminal-pane/TerminalPane.tsx`) uses that view too, and the mobile app shares `src/shared/native-chat-*`. Chat mode plugs in through an optional `transport` prop, and about 30 native-chat files branch on `transport`/`chatThread`/`surface === 'chat'`.

---

## 1. Main process

### 1.1 Files and responsibilities

| File | Lines | Role |
|---|---|---|
| `src/main/chat-mode/chat-thread-stream.ts` | 261 | Child lifecycle: start, interrupt, stop, stopAll. Wires decoder → coalescer → `webContents.send`. |
| `src/main/chat-mode/chat-thread-stream-decode.ts` | 205 | NDJSON line buffer + `mapChatThreadStreamRecord` (record → compact event). |
| `src/main/chat-mode/chat-thread-stream-actions.ts` | 141 | Send user turn, queue ops, permission verdicts, reload replay lists. |
| `src/main/chat-mode/chat-thread-stream-registry.ts` | 42 | `registry = Map<threadId, StreamEntry>` + `writeStdinLine`. |
| `src/main/chat-mode/chat-thread-message-queue.ts` | 179 | Per-thread queue/steer state machine (queued/sending/steering, paused after Stop). |
| `src/main/chat-mode/chat-thread-stream-spawn-plan.ts` | 53 | Shell + env: `$SHELL -c|-lc <command>`, login-shell env delta, hook env. |
| `src/main/chat-mode/chat-thread-stream-preflight.ts` | 20 | Refuses win32; detects missing cwd. |
| `src/main/chat-mode/chat-thread-stream-delta-coalesce.ts` | 51 | Merges text deltas into 50 ms frames; non-delta events flush first. |
| `chat-thread-stream-user-content.ts` / `-mcp-config.ts` / `-system-prompt.ts` | 72/43/34 | Base64 image blocks; per-thread tmp MCP config; tmp `--append-system-prompt-file`. |
| `chat-thread-permission-response.ts` | 21 | Builds `control_response` for `can_use_tool`. |
| `chat-workspace-store.ts` + `chat-workspace-state-parse.ts` + `-singleton.ts` | 247+124 | Persisted workspaces + threads (`userData/chat-workspaces.json`). Rows are pointers only; "transcripts stay in the agent's files". |
| `chat-thread-search-index.ts` (+snippet) | 281 | Sidebar content search over transcript files, cached per file. |
| `chat-thread-title-generation.ts` | 64 | Semantic title after first turn. |
| `claude-model-registry.ts`, `claude-cli-models.ts`, `claude-settings-effort.ts` | 154/116/~40 | Learned models + context windows; CLI `initialize` model list; effort from settings. |
| `src/main/ipc/chat-thread-stream.ts` | 212 | 10 IPC channels `chatThreadStream:*` (start/send/respondPermission/interrupt/stop/pendingPermissions/steerQueued/removeQueued/sendNextQueued/queues). |
| `src/main/ipc/chat-mode.ts` | 288 | Store CRUD. Header: "session launching stays in the renderer". |
| `src/main/ipc/chat-connector.ts` + `src/main/chat-connector/*` | 117 + 968 | Localhost streamable-HTTP MCP ("muster" tools) with a bearer token per thread. |
| `src/main/native-chat/*` + `src/main/ipc/native-chat.ts` | 2,751 + 354 | Transcript JSONL resolve/read/tail/watch (fs.watch + reconcile scheduler), per-agent line decoders (claude/codex/grok), turn lifecycle. Channels `nativeChat:readSession/subscribe/appended/...`. Remote runtimes supported via `runtime/rpc/methods/native-chat.ts`. |

### 1.2 Spawn

- The renderer builds the whole shell command line (`src/renderer/src/lib/chat-thread-session-launch.ts:44-45, 106-154`):
  `claude <model/effort flags> <defaultArgs> --add-dir … -p --verbose --input-format stream-json --output-format stream-json --include-partial-messages --replay-user-messages --permission-mode manual --permission-prompt-tool stdio` (resume adds `--resume <id>` through `buildAgentResumeStartupPlan`).
- Main runs it as `$SHELL -c|-lc "<command>"` (`chat-thread-stream-spawn-plan.ts:44-45`), so the command is a quoted string, not argv. That is why Windows is blocked (`chat-thread-stream-preflight.ts:10-13`).
- `isRemote: false` is hardcoded (`chat-thread-session-launch.ts:93,142,152`). The header says "Local-only for now; SSH/runtime variants slot in behind the thread transport later" (`:7-8`).
- Replace semantics: `startChatThreadStream` calls `stopChatThreadStream(threadId)` first (`chat-thread-stream.ts:80`).

### 1.3 stream-json parsing (`chat-thread-stream-decode.ts`)

The decoder keeps very little. Each record maps to at most one event (`:67-148`):

| CLI record | Event | Notes |
|---|---|---|
| `system/init` | `init {sessionId, model}` | `:75-85` |
| `stream_event` → `content_block_delta` / `text_delta` | `delta {text}` | `:86-99`. **Thinking deltas, `input_json_delta` (tool args) and `content_block_start/stop` are dropped.** |
| `assistant` | `message-final` (no payload) | `:100-102`. The message body is thrown away. |
| `control_request can_use_tool` | `permission-request {requestId, toolName, input}` | `:105-121`. Drops `title`, `description`, `decision_reason`, `permission_suggestions`, `blocked_path`. |
| `control_cancel_request` | `permission-cancel` | `:122-127` |
| `result` | `turn-complete {isError, errorMessage, contextWindow}` | `:128-144`. Drops cost, duration, usage. |
| `user` (tool results, `tool_use_result`) | **dropped** | Only `replayedUserMessageId` (`:57-64`) is observed, for queue delivery acks. |
| `tool_progress`, `tool_use_summary`, `prompt_suggestion`, task records, `control_response` | **dropped** | |

Subagent records (`parent_tool_use_id`) are filtered out (`:72-73`). Shared event type: `src/shared/chat-thread-stream-types.ts:5-30`. Its header says "the transcript file stays the authoritative message source".

### 1.4 Thread registry

- **Live processes:** `registry: Map<threadId, StreamEntry>` in main (`chat-thread-stream-registry.ts:8-29`). It holds the child, `stopping`, `killTimer`, `pendingPermissionRequests`, `controlRequestCounter`, `cleanup`, `emit` and `queue`.
- **Session records (which thread has a live process, its paneKey, applied options):** these live in the **renderer** only (`store/slices/chat-mode.ts:26-34, 43` `chatThreadSessions`). Main has no list or snapshot API, so after a reload the renderer has forgotten that a child is alive.
- **Persisted threads:** `chat-workspace-store.ts`. A `ChatThread` (`src/shared/chat-mode-types.ts:51-89`) is `{id, workspaceId, title, agent:'claude', claudeSessionId, transcriptPath, timestamps, contextWindow, reportedModel, sortOrder, activeCollabTask, pinned, archived}`.
- **Idle cap:** renderer-side `enforceChatThreadIdleSessionCap` (`lib/chat-thread-session-ensure.ts:92-107`). "Busy" is judged from hook state, pending permissions and the streaming text.

### 1.5 Approvals (`can_use_tool`)

1. CLI writes `control_request {subtype: can_use_tool}` → decoder → `permission-request` event. Main records it in `entry.pendingPermissionRequests` (`chat-thread-stream.ts:140-151`).
2. Renderer `installChatThreadStreamEvents` → `store.addChatThreadPermissionRequest`. The auto-approve policy (full access, "always allow" per tool) also lives there, **in the renderer** (`store/slices/chat-thread-permission-state.ts:23, 56`).
3. Verdict: `chatThreadStream:respondPermission` → `respondChatThreadPermission` (`chat-thread-stream-actions.ts:98-120`). It echoes the original input as `updatedInput` on allow (`chat-thread-permission-response.ts:4-21`).
4. Reload replay: `chatThreadStream:pendingPermissions` (`chat-thread-stream-actions.ts:125-141`, called from `lib/chat-thread-stream-events.ts:88-100`).
5. Stop denies everything still open, then emits `permission-cancel` (`chat-thread-stream.ts:217-229`).
6. **AskUserQuestion is answered with a `deny`** whose message carries the answer text (`components/native-chat/NativeChatStreamAskCard.tsx:133-140`), so the model sees a tool error. The card latches the prompt because "the CLI emits the prompt then immediately cancels" (`:1-5`). "Always allow" never sends `updatedPermissions`. It is a renderer-only per-session allowlist.

### 1.6 Interrupt / stop

- Interrupt: `control_request {subtype:'interrupt'}` with `req_N` (`chat-thread-stream.ts:198-210`). Nothing correlates `control_response` (no control client).
- Stop: deny pending, end stdin, then `SIGKILL` the single pid after 1.5 s (`:212-249`). There is no SIGTERM and no process group, so Bash-tool children (dev servers) are orphaned. The kill timer is `unref`'d. A relaunch does not wait for the old child's `close`.

### 1.7 Model / effort change = relaunch

`lib/chat-thread-session-option-relaunch.ts` (152 lines). Header (`:1-3`): "an option change stops the stream and relaunches it with the new launch flags, resuming the provider session." It clears the partial streaming text so it cannot prefix the next turn (`:125`), drops the queue without an event (`:128`), and lands the view on its resume state (`:143`). A model switch mid-turn kills the turn. The CLI's `set_model` / `set_max_thinking_tokens` / `set_permission_mode` control requests are not used.

### 1.8 Session resume

- `thread.claudeSessionId` is set from the stream `init` event (`lib/chat-thread-stream-events.ts:116-127`) **and** from the agent hook's `providerSession` (`ChatThreadView.tsx:80-107`). Two writers for the same field.
- Resume: when `claudeSessionId !== null`, launch uses `--resume` (`chat-thread-session-launch.ts:118-143`). There is no check that the transcript still exists (Claude's 30-day cleanup) and the launch cwd is not stored per thread (review item R16).
- History with no process: `NativeChatView` gets `fallbackProviderSession {id, transcriptPath}` and reads the JSONL directly (commit 79644b7001 "keep chat history visible without a process").

### 1.9 Open reliability items from `docs/muster/2026-09-27-project-review.md` §Chat (verified still open on `muster`)

- R12: no `prepareClaudeAuth` on chat spawn (only `ipc/pty.ts` and `attach-main-window-services.ts` call it). An `ANTHROPIC_API_KEY` exported in the shell profile bills chats to that key.
- R13: sessions live in renderer memory, so a reload kills running turns.
- R15: weak stop (see 1.6).
- R16: resume with no transcript check.
- R18: auto-approve policy and "needs you" notifications run in the renderer, so with the window closed approvals stall.
- R19: the connector stops on `before-quit` (`ipc/chat-connector.ts:116`).
- R20: no `.corrupt-<ts>` backup when the store fails to parse.
- R21: Chat is still offered on Windows even though the spawn refuses there.
- R14 is partly addressed by the renderer-side idle cap. P-g: each 50 ms delta does two global `set`s.

---

## 2. Renderer

### 2.1 Component tree (Chat view)

```
App root
└─ installChatThreadStreamEvents()            lib/chat-thread-stream-events.ts (283) — single IPC listener
ChatModePage (111)                            components/chat-mode/ChatModePage.tsx
├─ ChatModeSidebar (170)
│  ├─ ChatModeToggle (115)                    Chat | Code
│  ├─ search input → use-chat-thread-content-search (81)
│  └─ ChatSidebarThreadSections (302)
│     ├─ ChatSidebarFadeScroller (75)
│     ├─ ChatThreadDragList (77)
│     │  └─ ChatThreadRow (321)               status pill, menu (pin/unread/archive/delete)
│     └─ ChatClearAllDialog (100)
├─ ChatWorkspaceCreateDialog (319) (+ UrlList 186, EmailList 132, ProjectBinding 135, Appearance 59)
├─ ChatModeDraftHero (276) + DraftHeroControls (143) + HeroTaskShortcuts (59)   "new chat" screen
│  └─ use-chat-draft-prewarm (132)            spawns a hidden thread while you type
└─ ChatThreadView (173)
   ├─ ChatThreadTaskStrip (166)               linked ActiveCollab task
   └─ NativeChatView (400)                    components/native-chat/NativeChatView.tsx
      └─ NativeChatSessionGate (54) → NativeChatResolvedView
         ├─ NativeChatMessageList (254)
         │  ├─ use-native-chat-scroll-anchoring (334) + native-chat-scroll-anchoring (175)
         │  ├─ use-native-chat-toggle-scroll-compensation (48), use-native-chat-row-anchor (95)
         │  ├─ NativeChatVirtualRows (124)    @tanstack/react-virtual
         │  │  └─ NativeChatTimelineRowView (78)
         │  │     ├─ NativeChatMessageRow (327)    user/assistant bubbles, markdown, typewriter
         │  │     ├─ NativeChatWorkLog (122) → NativeChatWorkRow (209) / NativeChatWorkDetail (195)
         │  │     ├─ NativeChatChangedFilesRow (102), NativeChatTurnPlanRow (105)
         │  │     └─ NativeChatTurnErrorRow (53)
         │  └─ NativeChatWorkingRow (68)
         ├─ composerNotice = ChatThreadSessionNotice → ChatThreadNotice (165) (starting/ended/folder-missing)
         └─ NativeChatViewInput (132)
            ├─ NativeChatStreamAskCard (168) / NativeChatQuestionCard (291) / NativeChatInteractiveCard (178)
            ├─ NativeChatQueueStrip (216)
            └─ NativeChatComposer (450, 25 hooks)
               ├─ NativeChatComposerField (311), NativeChatComposerActions (217), NativeChatAutocompleteMenus (282)
               ├─ NativeChatSessionOptionPickers (329)   model / effort
               ├─ NativeChatContextWindowMeter (88)
               └─ NativeChatApprovalPanel (161) → NativeChatApprovalCard (57)
```

### 2.2 Store (zustand, single `useAppStore`)

`store/slices/chat-mode.ts` (350) plus `chat-thread-permission-state.ts` (179), `chat-thread-lifecycle-state.ts` (61) and `chat-thread-message-queue-state.ts`. Per-thread records keyed by threadId:

- persisted mirror: `chatWorkspaces`, `chatThreads`, `activeChatWorkspaceId`, `activeChatThreadId`
- runtime: `chatThreadSessions`, `chatThreadLaunching`, `chatThreadSessionEnds`, `chatThreadSessionTouchedAt`, `chatThreadStreamingText {text, sealed}`, `chatThreadContextWindow`, `chatThreadLastError`, `chatThreadFirstMessage`, `chatThreadPermissionRequests`, `chatThreadFullAccess`, session-allowed tools, `chatThreadMessageQueues`
- **plus, outside the chat slice:** `agentStatusByPaneKey[paneKey]` (agent hooks: `state`, `stateStartedAt`, `prompt`, `providerSession`, `lastAssistantMessage`, `interactivePrompt`), agent launch configs, and the native-chat pending-send / launch-prompt caches (`native-chat-pending.ts` 382, `use-native-chat-optimistic-turns.ts` 164).

Transcript messages are **not** in the store. `useNativeChatLiveSession` (375) keeps them in hook-local state from `nativeChat:readSession` + `nativeChat:appended`, with pagination, a merger (`shared/native-chat-merge.ts`) and an incremental assembler.

### 2.3 How streaming text and transcript messages merge

`NativeChatResolvedView` (`NativeChatView.tsx:155-259`) builds the visible list as:

```
transcript messages (useNativeChatLiveSession, from JSONL)
  → useStableSessionMessages (keep object identity)
  → sessionAfterCommandBoundaries (optimistic slash-command markers)
  + [ synthetic "streaming" message ]   ← useNativeChatStreamingBubble(transport.streamingText | hook lastAssistantMessage)
                                          → useNativeChatTypewriter (40 ms tick, re-parses markdown)
  + pendingMessages                      ← optimistic user echoes, pruned when the real user turn lands
```

- The streaming bubble is one string per thread. `appendChatThreadStreamingText` **restarts** the text when a delta arrives after a seal (`store/slices/chat-mode.ts:315-326`).
- `message-final` / `turn-complete` seal the text. A 6 s timer clears it if the transcript never catches up (`lib/chat-thread-stream-events.ts:25-27, 136-145`).
- `deriveNativeChatStreamingText` (`shared/native-chat-streaming.ts`) hides the bubble once the transcript tail holds the same assistant text.
- "Working" comes from `session.status`, a merge of hook state and transcript turn markers (`native-chat-live-status.ts` 157), adjusted by local Stop suppression (`native-chat-working-suppression.ts`), `awaitingSend` (optimistic) and `awaitingUser` (permission requests or hook `interactivePrompt`) (`NativeChatView.tsx:160-294`).
- Tool rows, diffs, plans and changed files come **only from the transcript JSONL** (`main/native-chat/transcript-line-decoders-claude.ts` 269, `transcript-tool-use-result.ts` 150, `shared/native-chat-work-summary.ts` 204). They never come from the stream.

---

## 3. End-to-end data flow (send → render)

1. **Composer submit** → `use-native-chat-composer-send` / `use-native-chat-transport-send` → `onOptimisticSend` writes a pending echo → `transport.send(text, images, mode)`.
2. `useChatThreadTransport.send` (`components/chat-mode/use-chat-thread-transport.ts:49-74`) → `ensureChatThreadSession` (launch if none; one in flight per thread) → on the first send of a new thread, wrap the text with the workspace brief → set the title from the prompt → `window.api.chatThreadStream.send`.
3. **Launch (if needed)** (`lib/chat-thread-session-launch.ts`): trust preflight, build the command, `registerAgentLaunchConfig(paneKey)` (the thread poses as a terminal pane so hooks and NativeChatView can find it), then IPC `chatThreadStream:start` → main ensures the connector MCP is up, writes tmp files, and spawns `$SHELL -lc`.
4. **Main** → queue `submit` → `writeUserMessage` builds content blocks (images read and base64'd) and writes `{"type":"user",uuid,...}` to stdin.
5. **CLI stdout** → decoder → coalescer (50 ms) → `chatThreadStream:event`.
6. **CLI hooks** (UserPromptSubmit/Stop/etc., when status hooks are on) → agent-hook server → `agentStatusByPaneKey[paneKey]`. This gives working state, prompt, providerSession and lastAssistantMessage.
7. **CLI transcript JSONL** (`~/.claude/projects/<cwd>/<session>.jsonl`) → main `transcript-watch-engine` (fs.watch + reconcile) → `nativeChat:appended` → `useNativeChatLiveSession` → merger/assembler.
8. **Renderer events** (`lib/chat-thread-stream-events.ts`) update the store: deltas → streaming text; turn-complete → settle hook "working", errors, notifications, `lastCompletedAt`, auto-title; permission → queue; exit → clean up.
9. **Render**: transcript ⊕ streaming bubble ⊕ optimistic echoes → timeline rows (turn folds, work log) → virtualized list with a three-mode scroll anchor.

**Where the transcript comes from:** the CLI's own JSONL file is the source of truth for every committed message, tool call, tool result and diff. The stream supplies only text deltas, lifecycle, permissions and queue acks. Hooks supply working state and session identity. The UI is assembled from **three asynchronous channels** with different latencies: stdout via 50 ms coalescing, the file watcher with debounce/reconcile, and hook HTTP posts.

---

## 4. Visible problems (ranked)

### P1. Three sources of truth stitched together in the renderer
Stream deltas, transcript JSONL and agent hooks each describe the same turn at different times. Reconciling them takes about a dozen modules: seal/clear timer, typewriter, streaming-bubble derivation, optimistic pending prune, launch-prompt prune, working-suppression epochs, hook/transcript status merge, message identity, assembler, merger. Every swap from the streaming bubble to the transcript row is a remount point: a different id, the markdown re-parsed, and a height change.
- The bubble covers **text only**. Tool calls appear when the JSONL line lands and the watcher fires, not when the model emits them, so tool rows pop in late and in bursts.
- The text restarts after a seal (`chat-mode.ts:315-326`). Message 2's first delta can replace message 1's preview before the transcript shows message 1. The text vanishes, then reappears.
- The 6 s `SEAL_CLEAR_MS` fallback means an interrupt or decode gap leaves stale text up to 6 s, then it disappears.
- Working state needs hooks. With `agentStatusHooksEnabled` off, status degrades to transcript markers (see the memory note "vanishing agent rows"). The stream's `result` record has to patch hooks back (`chat-thread-stream-events.ts:150-157`, fix 2828fd2eae "settle stuck working state").

### P2. Chat mode is a guest inside Code mode's terminal-chat view
`ChatThreadView` fakes a terminal pane (`chatThreadPaneIdentity`, `registerAgentLaunchConfig`, `ORCA_PANE_KEY`) so `NativeChatView` and the hook pipeline work. `NativeChatView` then carries PTY concepts that chat mode doesn't need: `targetPtyId`, `readTerminalScreen`, `interactiveSend` sending ESC for Stop, hook previews, terminal-scrape sources, mobile parity rules. About 30 native-chat files branch on chat vs code. Any chat UX change risks Code mode and mobile, and chat UX is limited by a component built for scraping TUIs.

### P3. Most of the protocol is thrown away
The decoder drops thinking, tool-input streaming, `tool_use_result` (structured patches, stdout/stderr, exit codes), `tool_progress`, `tool_use_summary`, prompt suggestions, task/subagent records, cost, duration, permission titles, descriptions and suggestions, and every `control_response`. The consequences:
- diffs and command output are re-derived from the transcript
- no live tool timers
- no subagent view
- AskUserQuestion is answered with a **deny** (`NativeChatStreamAskCard.tsx:133-140`)
- "Always allow" is a renderer allowlist, not `updatedPermissions`
- a model or effort change **kills the process and resumes** instead of using `set_model` (`chat-thread-session-option-relaunch.ts`)

### P4. Session ownership in the renderer, weak process lifecycle
`chatThreadSessions`, permission policy, notifications and the idle cap all live in the renderer. A reload (Cmd+R, crash recovery, window reopen) forgets live children. The next open relaunches, and replace semantics deny open approvals and SIGKILL the running turn (R13). With the window closed, background approvals stall unseen (R18). Stop is stdin EOF + single-pid SIGKILL at 1.5 s: Bash children are orphaned, relaunch races the old child writing the same transcript (R15), and auth env is not sanitized (R12).

### P5. Scroll and ordering fragility from layered correction
There are four scroll mechanisms:
- the three-mode anchor (`use-native-chat-scroll-anchoring.ts` 334)
- toggle compensation
- the row anchor for prepends
- tanstack virtualization

They all react to rows changing height from bubble→transcript swaps, typewriter reveals, work-log folds and paged history. Recurring fixes in the git log:
- 43024eb6f4 "stop chat bouncing to bottom after a turn"
- 94dec7529a "anchor rows so prepends keep wheel scroll"
- 66a306b6f0 "anchor windowed rows by virtual position"
- 30e40d6648 "page long threads on scroll, virtualize"
- efd4694a73 "show mid-turn chat messages in order"
- fd21dd6c84 "show working row from moment of send"
- 40becd307d "stop glued rapid sends from pinning queued bubble"
- 9ba465af02 "stop chat spinner masking a blocked permission prompt"
- 1579798cc9 "show re-asked question card in chat mode"
- e80367c79f "keep interim agent prose out of turn folds"

Each fix added another reconciliation rule, not a simpler model.

### Other issues
- **Fragmentation:** 303 files and 56 hooks for one feature. `NativeChatComposer` composes 25 hooks. Following one send means walking more than 15 files.
- **Duplicate writers:** `claudeSessionId` is set from both the stream `init` and the hook `providerSession`. The thread title is set in `use-chat-thread-transport.ts:66-69`, `ChatThreadView.tsx:85-97` and `chat-thread-auto-title`. The literal `'New chat'` is a sentinel in several places.
- **Store churn:** two global `set`s per 50 ms delta, and no-op returns of `{}` still broadcast (P-g). The typewriter re-parses markdown every 40 ms.
- **Draft prewarm** spawns hidden processes while the user types (`use-chat-draft-prewarm.ts`). Combined with renderer-only ownership, this leaks children (R14).
- **Styling drift (STYLEGUIDE):** chat TSX has 11 raw palette classes (`emerald/rose/amber-NNN`), 37 arbitrary `text-[Npx]` sizes, and `rounded-[7px]` / `rounded-[9px]` one-offs. Changed-files rows use emerald/rose instead of `--git-decoration-*`.

### Bug-area heat (git log, 50 commits each on chat-mode and native-chat paths)
Stream lifecycle (f8980e561e five defects, fac2e6a6ed, 2828fd2eae, 8ccdfa5630 events dying outside the chat view), permissions (9ba465af02, 2520a498d2, 64eb874744), scroll/ordering (P5 list), model/effort (19efbbaf6c, 1049c24ac0, 527f2ad378, 75c835ed52, ad5debef4e draft lost on model relaunch), history without a process (79644b7001, 757+/374−).

---

## 5. `feature/chat-redesign` (b878460c95)

163 files, +18,913 / −652 against `muster...feature/chat-redesign`, by area:

| Area | +lines | Verdict |
|---|---|---|
| Main engine `src/main/chat-mode/engine/*` | 3,040 | **Salvage** (port onto current `muster`) |
| Main stream/ipc changes (reaper, exit, controls, files, `ipc/chat-engine.ts`) | 1,230 | **Salvage** most |
| `src/shared/chat-engine-types.ts` | 234 | **Salvage** as the model contract |
| `tests/e2e/fixtures/fake-claude-stream.cjs` + helpers + e2e | 883 | **Salvage** fixture and helpers; rewrite specs |
| Renderer thread UI `components/chat-mode/thread/*` | 6,965 | Mostly **discard** visuals; keep pure helpers |
| Redesign CSS (`chat-thread.css` 1,020, review 332, sidebar 144, new-chat 85) | 1,581 | **Discard** |
| Renderer sidebar/page | 1,633 | **Discard** (rebuild to the new reference) |
| i18n (5 locales × 324) | 1,624 | Discard; regenerate for the new strings |
| Spec + mockup | 1,178 | Keep as research reference |

### What the engine is (worth keeping)
- `ChatEngine` in main owns every thread's model. Renderers `subscribe → snapshot`, then receive `chatEngine:patch` events with changed turns only, so unchanged turns keep identity (`chat-engine.ts`, `chat-engine-thread.ts` 266, `lib/chat-engine-client.ts` 161).
- One reducer for stream records and transcript JSONL (`chat-engine-transcript.ts`: "Transcript records are the stream's records minus the partials, so the same reducer applies"). This removes the stream-vs-transcript merge.
- Typed handlers `chat-engine-apply-{assistant,user,system,control,task,events}.ts` cover text/thinking/tool streaming, `tool_use_result` → `ChatEngineToolResult` (structured patch, stdout/stderr, exit), `tool_progress`, `tool_use_summary`, prompt suggestions, tasks/subagents, `result` cost/duration.
- Model (`src/shared/chat-engine-types.ts`): `Turn {user, items[text|thinking|tool|agent|notice], status, durationMs, costUsd, toolSummaries}`, `Meta {status, session, pending[permission|question|plan] with title/description/suggestions, queued, todos, suggestions, contextUsage, tasks, totalCostUsd}`.
- Control client (`chat-engine-control.ts`, `-control-actions.ts`): numbered `control_request`s correlated to `control_response`s. Covers `set_model`, effort, `set_permission_mode`, interrupt, context usage, mcp status/reconnect/toggle, file suggestions, `rewind_files` (dry run), `stop_task`.
- Persistence: per-thread snapshot files, with old turns' tool output trimmed (`chat-engine-persistence.ts`); restore (`chat-engine-restore.ts`).
- Lifecycle fixes: idle reaper with LRU cap (`chat-thread-stream-reaper.ts`, R14), process-group SIGTERM→SIGKILL with relaunch waiting on the old child (`chat-thread-stream-exit.ts`, R15), and controls (`chat-thread-stream-controls.ts`).
- Tests: engine, thread (414 lines), restore, control-actions, reaper, exit, a fake-CLI test, and a protocol-faithful fake CLI for e2e.

### Caveats when salvaging
- It is 81 commits behind `muster`. Since the branch point, `muster` added queue/steer (2585ccc864, main-side `chat-thread-message-queue.ts` + `--replay-user-messages`), CLI model naming (1049c24ac0), virtualization/paging, word-paced streaming and drafts. The engine's `queued` model and the stream/ipc edits have to be reconciled with those, not copied over them.
- The redesign never cut over. `ThreadScreen.tsx` says "the old stream-event pipeline keeps running beside it for session records, titles and notifications", so it still had two pipelines plus the hook-based status. A refactor should make the engine the only pipeline: status, titles, notifications and permission policy all in main.
- It was still renderer-command-string + `$SHELL -lc` (the launch file only changed +48). Argv spawn (R21) and auth prep (R12) were specified but need checking before reuse.

### What to discard
- The visual layer the user called "clunky and cheap": `ThreadScreen`, `ThreadHeader`, `ThreadDock`, `TurnView`, `WorkLog`, `ActivityRow`, `Composer`/`ComposerPickers`, `PendingCard`, `ReviewPanel/Panes/Changes`, `NewChatScreen`, `ChatSidebarRedesign`. Also the 1,581 lines of hand-written CSS with 48 hard `font-size: Npx` and fixed `6px/8px` radii, which bypass Tailwind and the token scale.
- **Pure helpers worth lifting** if their behaviour fits the new UI: `thread-line-diff.ts` (+test), `thread-diff-lines.ts`, `thread-tool-describe.ts` (tool → verb/object), `thread-work-summary.ts`, `thread-turn-layout.ts` / `thread-turn-model.test.ts`, `pending-describe.ts`, `claude-model-name.ts`, `use-file-mentions.ts`, `use-uncommitted-changes.ts`, `use-folder-branch.ts`, `chat-engine-client.ts`.

---

## 6. Constraints a refactor must keep

1. **SSH / remote runtime** (AGENTS.md: "All changes must consider the SSH use case"). Today chat threads are local-only (`isRemote:false` hardcoded). Code mode's native chat already reads transcripts through remote runtimes (`runtime/rpc/methods/native-chat.ts`, `native-chat-session-transport.ts`). The new engine needs a host seam: the process and transcript run where the workspace lives, the model is reduced next to the process (or in local main fed over RPC), and the UI tolerates 50–200 ms latency (STYLEGUIDE §Cross-platform/SSH). `ChatWorkspace` has no host/connection field yet.
2. **Folder workspaces, not git worktrees.** `ChatWorkspace.directories: string[]` (first one = cwd, the rest = `--add-dir`). Folder-less and standalone chats fall back to home. Git-only features (branch chip, uncommitted scope, revert) must degrade cleanly. Missing-folder handling already exists (`chat-thread-stream-preflight.ts`, `ChatThreadFolderMissingNotice`).
3. **Cross-platform.** Windows is currently refused. The fix is argv spawn with a resolved `claude` binary instead of `$SHELL -lc` string quoting, and hiding Chat on win32 until then. Shortcuts must use the Mac `metaKey` / `ctrlKey` split and `CmdOrCtrl` accelerators, with platform-correct labels (`ShortcutKeyCombo`, `shared/keybindings.ts`). Paths go through `path`.
4. **STYLEGUIDE tokens.** Use `src/renderer/src/assets/main.css` tokens: `--status-attention`, `--destructive`, `--status-success*`, `--git-decoration-*`, sidebar list-row rules, `color-mix` tints. Use the shadcn primitives in `components/ui/`. Type is Geist on the Tailwind scale (11/12/13/14). Radius comes from `--radius` (`rounded-md` for controls). Shadows stop at three levels. Light and dark both. Run the Screen UX review rubric. No new raw palette or arbitrary sizes.
5. **Code mode and mobile must not regress.** `NativeChatView` stays for `TerminalPane`. `src/shared/native-chat-*` is shared with `mobile/`. Chat mode should leave `NativeChatView`, not fork it.
6. **Existing features users rely on.**
   - queue + steer with delivery acks
   - image attachments (base64, 4 MB cap)
   - the workspace brief via `--append-system-prompt-file`
   - the in-process "muster" MCP connector with per-thread token
   - ActiveCollab task chips, strip and hero shortcuts
   - auto-titles
   - content search
   - completion and needs-input notifications
   - context meter with learned model windows
   - drafts that survive restarts
   - pin, unread, archive and drag-ordering
   - `claudeSessionId` / `transcriptPath` persistence for resume
7. **Repo rules.** No `max-lines` disables. No `helpers/utils` file names. Concise comments. The formatter is oxfmt. Commits need `--no-verify` (memory note). Git 2.25 baseline if any git calls are added. GitLab-neutral naming.

---

## 7. Note on the DeepSeek Harness reference
Nothing in the repo references DeepSeek Harness. Its UI was not researched here, so a refactor plan needs a separate pass to capture its layout and interaction patterns. Inputs that already exist for comparison: `docs/specs/chat-mode-redesign.md` §2 (the Codex, Claude desktop, Conductor and T3 survey), `docs/specs/chat-t3-parity-*.md` and `docs/specs/chat-mode-audit.md`.
