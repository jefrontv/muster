# How DeepSeek Harness chat works

A functional teardown of the DSH web client's chat mode. It is written for rebuilding Muster's chat (Electron + React, driving Claude Code over `--output-format stream-json`).

All paths are relative to `ref/deepseek-harness/`. Line numbers were checked against the checkout. Nothing in the repo was built or run.

Each section ends with a **Port to Claude Code** note. The final section ranks the ideas.

---

## 0. The architecture in one picture

```
Host (Node)                                     Browser / Electron renderer
───────────                                     ───────────────────────────
append-only Session log  ──follow() stream──►  Session (React-free model)
  turn/start, step/start,     (WebSocket mux)     │  SessionEventLikeEntry window
  user/message,                                   │  (durable events + transient live chunks)
  assistant/message{stream},                      ▼
  tool/call, tool/result,                       ConversationNodeAssembler (ui-conversation)
  turn/end{reason}, llm/retry…                    │  N registered Definitions: match → start/update fold
                                                  │  keyed Contexts (kind,id) → State
live assistant-stream frames ──────────────────►  │  Location index (Turn / Step boundaries)
control() projection stream ──► projections       ▼
$events waterfalls ──► approvals / questions    Chat View builder (ui-chat) → ChatSnapshot
                                                  │  order[] + per-key node sources
                                                  ▼
                                                ChatView → ChatFlow → ChatNodeSeat(key)
                                                  │  renderSlot('conversation.chat.node', entryKey=node.kind)
                                                  ▼
                                                keyed renderers (assistant-step, tool-call → tool.call.toolview[toolName] …)
```

There are three rules everything else follows.

1. **The Host log is the only truth.** The UI never persists "how to draw". Every card is derived on the client from raw events (`packages/client/AGENTS.md`, "The web layer is pure presentation").
2. **Folding is incremental and keyed.** Each business concept (an assistant step, a tool call, a retry chain, a turn footer) has its own Definition. A Definition matches events by a stable id and folds them into State. Appending one event touches one Context (`docs/subsystems/conversation.md:276-286`).
3. **Rendering subscribes per row.** The list of keys (`order`) changes only when rows are added, removed or reordered. Each row subscribes to its own key, so a streaming token re-renders one row and not the list.

---

## 1. Data model

### 1.1 Session, Turn, Step: the durable log

`packages/core/session/src/types.ts:282` defines `SessionEventMap`, an append-only, merge-extensible map from event type to payload. Each event has a contiguous integer `seq` and a `time`. The core vocabulary:

| Event | Line | Meaning |
|---|---|---|
| `turn/start {turn}` | 289 | One user-initiated unit of work begins |
| `turn/end {turn, reason}` | 298 | `reason: completed \| aborted \| blocked \| error{LlmFailure} \| max-tokens \| interrupted \| forked` (TurnEndReasonMap at 202-233) |
| `step/start {turn, step}` / `step/end` | 300-302 | One model call plus the tools it requested |
| `user/message` | 310 | A human prompt, an injected context message, or a goal round; `source` tells them apart |
| `assistant/message {turn, step, message, stream, usage?, interrupted?}` | 342 | The settled assistant message for a step. It embeds the full timed delta stream in compact form |
| `assistant/attempt {turn, step, stream}` | 356 | A failed or retried model attempt that produced no surface message |
| `tool/call {turn, step, callId, name, arguments}` | 362 | Raw argument JSON string, unparsed |
| `tool/result {turn, step, message, error?, meta?}` | 376 | `meta` is a tool-private JSON presentation payload, such as a diff |

Plugins add their own events through declaration merging: `llm/retry`, `approval/asked`, `command/run`, `compaction/*` and others (about 30 `interface SessionEventMap` merges across `packages/`).

**Hierarchy:** Session → Turn (`turn` number) → Step (`turn:step`) → content blocks. A Turn ends with exactly one `turn/end` that carries the reason. This is how errors, interrupts and max-tokens reach the UI without separate channels.

### 1.2 The streaming protocol

`packages/llm/llm/src/types.ts:470`:

```ts
type StreamChunk =
  | { type: 'block-start'; index; blockType }
  | { type: 'text-delta'; index; text }
  | { type: 'reasoning-delta'; index; text }
  | { type: 'tool-call-delta'; index; id; name?; argumentsDelta }
  | { type: 'block-end'; index; block: ContentBlock }   // carries the assembled block
  | { type: 'usage'; usage }
  | { type: 'finish'; reason; replayState? }
```

This is almost exactly Anthropic's `content_block_start / content_block_delta / content_block_stop / message_delta`. Durable events store the stream compactly (`packages/llm/llm/src/assistant-stream.ts:20-43`): consecutive deltas pack into `text-chunks{time0, index, dt[], texts[]}`, `reasoning-chunks` and `tool-call-chunks{id, name?, args[]}`. Other chunks stay raw `{type:'chunk', time, chunk}`. Because of this, history replay can rebuild timings such as time to first token without durable per-token rows.

### 1.3 Client entries: durable plus transient

`packages/api/session-controller/src/client/contract/events.ts:7-25`:

```ts
interface AssistantLiveChunkEvent { type: 'assistant/live-chunk'; seq; time;
  data: { attemptId; turn; step; chunk: StreamChunk } }
type SessionEventLikeEntry =
  | { type: 'event';     event: SessionEvent }               // durable
  | { type: 'transient'; event: AssistantLiveChunkEvent }    // live, client-only
```

Transient rows get a **fractional seq** between durable cursors: `durableCursor + 1 - 1/(n+1)` (`client/sessions/assistant-stream.ts:88,158`). They sort correctly and never collide with a real seq. When the durable `assistant/message` or `assistant/attempt` lands, a `settle-assistant` change retires every transient row for that `attemptId` and applies the settlement (`ui-conversation/src/client/conversation/assembler.ts`, `settleAssistant` after line 300).

### 1.4 Conversation records: what the UI renders

`packages/client/ui-conversation/src/client/contract/records.ts`:

```ts
// :34 assistant content, sorted by what a UI presents
type AssistantBlock =
  | { kind: 'text'; text } | { kind: 'reasoning'; text }
  | { kind: 'image'; attachment }
  | { kind: 'tool-call'; callId; name; argsRaw }
  | { kind: 'other'; block: unknown }

// :62 settled or interruption-frozen assistant message
interface AssistantMessageNode { kind:'assistant'; seq; messageId?; time; turn; step;
  blocks; usage?; providerMetadata?; requestConfig?; timing?{stepStartTime, firstTokenTime, completedTime};
  interrupted?: true }

// :271-313 tool call lifecycle, recursive
interface ToolCallHead { callId; parentCallId?; name; turn; step; time; subCalls: ToolCallBlock[]; args: ToolArgs }
interface PreparingToolCall extends ToolCallHead { phase: 'preparing' }               // name known, args streaming
interface StartedToolCall   extends ToolCallHead { phase: 'start'; argsRaw }          // dispatched
interface ToolResultNode { kind:'tool-result'; seq; callId; name; args; call|null; callTime|null;
  content; isError; error?{name,code,reason?}; meta?; subCalls }                       // :161
type ToolCallBlock = PreparingToolCall | StartedToolCall | ToolResultNode
```

Other node kinds: `UserMessageNode`, `SteeringMessageNode` (a message admitted mid-turn, :88), `ContextMessageNode` (injected context, :100), `ModelRetryNode` (with a client-derived `retryState: scheduled|started|cancelled`, :114), `TurnErrorNode` (:131), `TurnMaxTokensNode`, `CommandNode` (slash command run/done pair), `CompactionSummaryNode`, and `UnknownSurfaceNode` (raw JSON fallback for any event no Definition claims, :214).

**Reasoning, text and tool calls are blocks of one assistant step.** Tool calls are also their own top-level Chat nodes, keyed by `callId` (section 3.3). The assistant view hides `tool-call` blocks (`ui-chat/.../conversation-nodes/assistant.ts:59-63`, `blockIsVisible`). The tool node owns the tool's presentation.

### 1.5 The Chat view model

`packages/client/ui-chat/src/client/contract/chat-nodes.ts` and `contract/snapshot.ts`:

```ts
// chat-nodes.ts:9
interface ChatConversationViewNode { key; kind; id; target:'chat'; anchorSeq; location;
  visibility: 'visible'|'hidden'; groupTree?: 'exchange'|'input'|'turn'|'process'; data }
interface ChatNodeDataMap {}                          // :24, declaration-merged per node kind
// :38
interface AssistantChatData { status: 'running'|'settled'|'interrupted'; turn; step; blocks; time; usage?; finalNode? }
interface ToolChatData { root: ToolCallBlock }        // :54
interface TurnTailChatData { turn; seq; time; closing; branchUnavailable; tokenUsage? }  // :94

// snapshot.ts:110
interface ChatSnapshot {
  order: readonly string[]            // keys in presentation order; identity changes only on structural change
  nodes: ChatNodeStore                // get(key), source(key) → per-key observable, turnDataSource, processSource
  locations: ChatLocationNodeIndex    // getTurn(turn), getStep(turn, step) → keys
  navigation: ChatTurnNavigationIndex // items(): {turn, anchorKey, prompt, response}[] for the turn rail
  timeline: ConversationTimelineSnapshot
  legacy: LegacyConversationSlice     // compat for stats pills
}
```

Node kinds registered by ui-chat (`chat/register-node-renderers.ts:40-89`): `user`, `steering`, `context`, `turn-trigger`, `system-prompt`, `assistant-step`, `command`, `manual-compaction`, `compaction`, `model-retry`, `turn-error`, `turn-max-tokens`, `turn-process` (the whole-turn "worked for Xs" disclosure), `turn-tail` (the footer with actions and token usage), and `unknown`. ui-tool registers `tool-call`.

**Port to Claude Code:** map stream-json onto the same layers.

- `system/init` is the session header.
- Each `assistant` message (one per model call) is a Step.
- `user` messages with `tool_result` are tool results.
- `result` is `turn/end` with its reason (`success`, `error_max_turns`, `error_during_execution`, interrupt).
- `stream_event` partials (`content_block_delta` with `text_delta`, `thinking_delta` or `input_json_delta`) are transient live chunks keyed by message id.

Claude Code has no explicit `turn/start` or `step/start`, so Muster has to synthesize them. Turn = from the prompt you write to stdin until `result`. Step = each distinct `message.id`.

---

## 2. Server-to-client transport

### 2.1 Carriers

- **Unary calls are HTTP POST JSON** to `/api/<namespace>/<method>` with `{type:'client-request', rpcId, method, payload}` (`packages/client/connection/src/rpc.ts:79-91`). The client mints `rpcId` and the server echoes it (`client/rpc.ts:39, 66-67`).
- **Streams share one WebSocket, `/api/remote.mux`** (`packages/api/gateway/src/stream-protocol.ts:7`). The frames are `open | item | end | cancel` with a `streamId` (`:235-257`). Ping every 2s, 256 KiB uplink cap per stream.
- **`$events`** is a reserved logical stream (`stream-protocol.ts:10, 34-71`). Its frames are `ready{clientId, host}` (always first; establishes a connection *generation*), `emit{event, args}`, `waterfall{event, eventId, agentId, request}` and `cancel{eventId}`. Answers go back as a unary POST to `$events/result` (`:88-95`).

### 2.2 Generations and reconnect

`packages/client/connection/README.md:58-62`:

- A generation is published when `ready` arrives. It ends on stream end or error, a malformed first item, and so on.
- Backoff is jittered (50-100%) with caps of 500ms, 1s, 2s, 4s, 8s, then 10s indefinitely. Browser `offline` pauses retries and `online` restarts them.
- Each logical stream reopens on the next generation. Physical and logical recovery are separate (`docs/subsystems/web-client.md:77-87`).

### 2.3 `follow()`: snapshot first, then live

Host side: `packages/api/session-controller/src/history.ts:120-233`.

1. It subscribes to `session/event` and `agent/assistant-stream` **before** reading storage (`:146-175`). This means no event can fall in the gap.
2. It yields one **snapshot** frame (`:193-203`; type in `types.ts:570`):
   ```ts
   { type:'snapshot'; header; cursor; records: SessionHistoryRecord[]; hasMore;
     projections: {asOfSeq, values}; assistantStream?: {revision, activeAttempt?{attemptId, turn, step, nextIndex, stream[]}} }
   ```
   `activeAttempt` carries the in-progress streamed reply, so a reload in the middle of a stream picks up the partial text.
3. It then yields live `{type:'event', event}` frames with strictly `seq = cursor + 1`; a skip throws (`:226-232`). It also yields `{type:'assistant-stream', frame}` frames (`types.ts:531`):
   `start{attemptId, revision, turn, step} | chunk{attemptId, revision, index, time, chunk} | end{attemptId, revision, index, outcome: committed{eventType, seq} | abandoned}`.
   The client checks that `revision` is dense (`client/transport.ts:206-214`).

**Older history:** `page({throughSeq, beforeSeq?, maxMessages?, turnWindow?})` (`types.ts:489-502`). The default is at least 50 messages and 2 turns, capped at 500 (`session-controller/README.md:69`). The journal logic is `packages/api/gateway/src/client/journal-stream.ts`:

- A prepend must be contiguous (`:187-212`).
- A gap during follow triggers `replaceThrough`, which reads a fresh tail page while still consuming follow (`:305-395`).
- A new generation's opening snapshot **atomically replaces** the window (`:261-300`).

**Snapshot vs incremental.** The client-side event source publishes a `SessionEventWindow` with `revision` and `change.kind ∈ {replace, prepend, append, settle-assistant}`. The assembler accepts it in `ui-conversation/src/client/conversation/assembly.ts:111-136`:

```ts
if (window.revision !== this.revision + 1 || window.change.kind === 'replace') { this.replace(window); return }
switch (window.change.kind) { case 'prepend': … case 'append': … case 'settle-assistant': … }
```

A missed revision falls back to a full replace. That is a simple and robust rule.

### 2.4 Control and projection stream

`control()` (`session-controller/src/index.ts:598`, `control.ts:42-80`) yields a `baseline` of projections per session, then `{type:'projection', sessionId, key, value, seq}`. The projections include:

- `inbox` = `{'next-turn': UserMessage[], 'next-step': UserMessage[]}`, which is the queue
- `userQuestions`, `permissions`, `modelSelection`, `turnOutline`, `goal`

`running` arrives as a forwarded `api-session/status(sessionId, running)` emit (`types.ts:601-637`). The control stream restarts with a fresh baseline every generation.

### 2.5 Applying deltas: three batching layers

1. **Session model notifier** (`session-controller/src/client/sessions/notifier.ts`): `markDirty()` batches to a microtask (`:31-36`); `notifyNow()` flushes synchronously and is meant for controlled inputs (`:50-55`). `SessionSnapshot` is rebuilt as a new immutable object only when dirty (`session.ts:192-195, 515-517`).
2. **Assembler publication cadence.** Every Definition declares `publication(match)` as `'none' | 'animation-frame' | 'immediate'` (`contract/conversation.ts:200`). Streaming text and tool deltas use `animation-frame`, which **waits three nested rAFs** before materializing (`assembly.ts:140-157`). Structural events (step end, tool result, turn end) are `immediate` and cancel any pending frame. `usage`/`finish` chunks are `none` (`ui-chat/.../assistant.ts:321-326`).
3. **Per-key sources.** Each Chat node source re-notifies only if its own value identity changed (`ui-chat/.../chat-snapshot-builder.ts:44-70`, `MutableChatSource.publish`).

**Port to Claude Code:**

- Electron IPC replaces the WebSocket. Keep the snapshot-then-incremental contract between main and renderer: on renderer reload, main sends `{snapshot: transcript events so far + active partial, revision}`, then `append` deltas with revision+1. A gap means asking for a full replace.
- Claude Code itself has no resumable stream. Main must persist the parsed stream-json lines per session (Muster already reads Claude's JSONL transcripts) and keep the in-flight partial in memory.
- Subscribe before you read: attach the stdout line listener before reading the JSONL file, then drop duplicates by uuid.

---

## 3. Client store and transcript derivation

### 3.1 Store library

`packages/client/store/src/index.ts` is a thin layer over `zustand/vanilla` + `subscribeWithSelector` + `immer`:

- `createSnapshotStore(init, {flush?: 'raf'|'sync', persist?})` (:103) returns `{getSnapshot, subscribe, update(draft => …), set}`. `raf` mode merges a frame's updates into one notification.
- `defineStore({init, actions: {name: (draft, ...args) => void}, persist?})` (:217) is used for **view state only**: disclosure open/closed, drafts, panel widths. Example: `ui-chat/src/client/stores.ts:50-62` (`setTurnProcessOpen`).
- **Business data never lives in a store** (`packages/client/AGENTS.md`, layering red lines). Sessions and events live in React-free model objects that expose `{getSnapshot, subscribe}`.

React binding happens in one place, `ui-renderer/src/client/bind.ts:19`, through `useSyncExternalStoreWithSelector`. Hooks are cached per source object in a `WeakMap` (`bindings.tsx:78`), with a two-level cache for keyed sources such as `useChatNode(key)` (`:150`).

### 3.2 From events to rows: Definitions

The core abstraction is `ConversationNodeDefinition<State>` (`ui-conversation/src/client/contract/conversation.ts:213-274`):

```ts
interface ConversationNodeDefinition<State> {
  kind: string; target?: 'chat' | 'trajectory' | …
  match(event): { id: string; role: 'start' | 'update'; exclusive?: true } | null   // identity only, no fold
  start(context, match, reader): State          // earliest loaded start
  update(context, match): State                 // every later match, in seq order
  publication?(match): 'none' | 'animation-frame' | 'immediate'
  buildLocationData?(context, 'step'|'turn', previous)   // publish data onto a Turn/Step for sibling rows
  buildViewNode?(context): ConversationViewNode | null    // final renderer-ready node
}
```

What the engine does (`ui-conversation/src/client/conversation/assembler.ts`):

- It keeps a Context per `(kind, id)` (`conversationContextKey`, `conversation.ts:338-343`).
- **Append** calls `match` on each Definition once, looks up the Context by key, and calls `update` on that Context only (`assembler.ts:254-280`). There are no scans. Registration can be a table from event type to handler, so the dispatcher only calls Definitions that listed the event type (`conversation.md:248`).
- **Prepend** (an older page) matches only the new inputs. Contexts whose start was missing get started, and the affected Contexts replay (`conversation.md:276-282`).
- **Update-only evidence** (an update whose start isn't loaded yet) stays pending until a page brings in the start (`conversation.md:70`).
- **`exclusive: true`** lets a business Definition claim an event so the generic fallback doesn't render it twice (`conversation.ts:8-21`).
- **Predecessor reads:** `reader.previous(kind)` gets the nearest earlier State of another kind. Dependencies are recorded and rerun when an older page reveals a nearer predecessor (`conversation.md:268-272`).
- **Location index:** Turn and Step boundaries (`turn/start`, `step/end`, …) are engine-owned (`conversation.ts:94-121`). Each Turn/Step has `status: open|closed|unknown`. Definitions use this to infer interruption: a tool still `start` when its step closed becomes a synthetic `Interrupted` error result (`ui-chat/.../tool.ts`, `projectBlock` and `interruption`).

**Worked example: the assistant step** (`ui-chat/src/client/conversation-nodes/assistant.ts`):

- `match` (:296-306): `step/start` → start with id `turn:step`. `assistant/live-chunk`, `assistant/message` and `llm/retry` → update with the same id.
- `updateChunk` (:89-162) applies `block-start`, `text-delta`, `reasoning-delta`, `tool-call-delta` and `block-end` into `blocks[index]`. It tracks `firstVisibleSeq` and `firstTokenTime`.
- `settleMessage` (:164-177) replaces the blocks with the durable content. `llm/retry` resets the blocks but keeps the first-token time (`resetForRetry`, :82-87).
- Status is derived (:263-265): `interrupted` if the final node says so, `running` while not settled, otherwise `settled`. If the step closed without a durable message but streamed text exists, it synthesizes an interrupted node from the chunks (`finalNode`, :214-227).
- Once published, a node keeps its key. If it has to go away it becomes `visibility: 'hidden'` instead of being withdrawn (:343-354; rule at `conversation.md:254`). This keeps React identity stable.

**Worked example: the tool call** (`ui-chat/src/client/conversation-nodes/tool.ts`):

- `match` (:283-301): every `tool-call-delta` and the `block-end` of a tool block are **start candidates** keyed by callId. The earliest one opens the Context. `tool/call` is a start, `tool/result` and PTC sub-dispatches are updates.
- A node exists only once the name is known (`applyDelta` skips unnamed deltas, :72-74).
- Arguments stream into a lazy `PartialArguments` reader (`packages/util/values/src/partial-json.ts:76`). Views read `args.text('command')` or `args.textPrefix('file_path', n)`. `refresh()` (:175-180) reports a change only if a field the view **actually read** changed. A new block object is produced only then (`preparingBlock`, :93-98), so streaming 20 KB of `content` into a Write call does not re-render a row that only shows the path.

### 3.3 Presentation order and grouping

- **Ordering.** `orderedVisibleChatNodes` (`chat-snapshot-builder.ts:522-535`) sorts by `anchorSeq`, then a rank so opening inputs come before process rows and the turn-process control sits between them, then the key.
- **groupTree positions** (`contract/group-tree.ts`; table at `conversation.md:256-266`): `exchange` (opening human input), `input`, `turn` (errors and the footer stay outside folding), `process` (retries; hidden by whole-turn folding), or unset (joins the surrounding step run).
- **Process grouping** (`conversation-nodes/process-groups.ts`, `process-activity.ts`; rules in `conversation-nodes/README.md`):
  - Adjacent reasoning and tool rows within a turn form groups, and any assistant reply separates groups.
  - Closed groups get titles from ranked tool categories ("Read files, ran commands and edited files"). Running groups show the live category ("Running commands · npm test"), and a title must stay up for at least 150ms.
  - When a turn completes, everything except the final answer folds behind the `turn-process` control.
  - Failed, stopped or interleaved-input turns don't fold.
- **presentation-policy** (`ui-chat/src/client/presentation-policy.ts:23-52`) maps a user setting to capabilities:

  | Mode | foldCompletedTurns | stepGrouping | liveProcessDetail | settledReasoningPreview |
  |---|---|---|---|---|
  | compact | yes | collapsed | no | no |
  | standard | yes | collapsed | yes | yes |
  | detailed | yes | history | yes | yes |
  | verbose | no | none | no | yes |

  `presentationPolicyFor` returns the **same object** for the same pair of inputs (:74-79), so selectors stay stable. `TranscriptViewPolicy` (`transcript-view.ts`) persists the choice to Host settings. `collapseTiming: 'completion' | 'next-input'` can defer folding the latest exchange until the next message.
- **views-type-chain** specs (`ui-chat/tests/views-type-chain.client.spec.tsx`, `ui-conversation/tests/views-type-chain.client.spec.tsx`, `ui-tool/tests/toolview-type-chain.client.spec.tsx`) are **compile-time tests**. `@ts-expect-error` asserts that a component can't reach props or slots it wasn't given (for example, ChatView can't render `conversation.chat.node` directly).
- **transcript-view-row** (`settings/TranscriptViewRow.tsx`, spec `tests/transcript-view-row.client.spec.tsx`) is the Settings row for this mode, not a transcript row.

### 3.4 Render path and performance

- `ChatView` (`chat/ChatView.tsx:60-263`) selects only `order` and `grouped('chat').entries` (:65-68) and passes the entries to the `conversation.chat.flow` slot.
- `ChatFlow` (`chat/ChatFlow.tsx:12-61`, `memo`) maps entries to `<ChatNodeSeat key=… nodeKey=…>` or `<ChatGroupSeat>`. It then appends pending echo bubbles and `<RunningStatus>` while running.
- `ChatNodeSeat` (`chat/ChatNodeSeat.tsx:49-174`, `memo`):
  - `useChatNode(nodeKey)` subscribes to **one key**.
  - It computes fold visibility from that node's own process presentation. Policy reads select only this seat's own result, so a mode change re-renders only seats whose visibility actually changes (comment :44-48).
  - It dispatches through `renderSlot('conversation.chat.node', owner, {entryKey: node.kind, fallback: <JsonBlock/>})` (:161-171).
  - Rows carry `data-chat-anchor-key`, `data-chat-node-key`, `data-chat-turn` and similar attributes for scroll anchoring.
- **No virtualization of the chat flow.** It relies on a windowed history (page older on demand, at least 50 messages and 2 turns per page), per-key subscriptions, `memo` on every seat, and folding, which keeps the DOM small. The Trajectory table view and the turn rail are virtualized (`TurnNavigator.tsx:6`, `@tanstack/react-virtual`).
- **Incremental markdown** (`ui-primitives/src/markdown/incremental.ts:1-50`): while streaming, every top-level block except the last two (`UNSTABLE_TAIL_BLOCKS = 2`) is frozen, and only the tail is re-parsed. Block React keys are source start offsets, so they reconcile and don't remount. Syntax highlighting runs only in the viewport (`useViewportHighlighting.ts`, IntersectionObserver). Covered by `tests/markdown-incremental.client.spec.tsx`.
- `RunningStatus` (`chat/RunningStatus.tsx`) owns its own 1s clock, so ticking doesn't re-render the transcript.

**Port to Claude Code:** this is the most valuable part.

- Write a small assembler with one Definition per concept: `assistant-step` keyed by `message.id`, `tool-call` keyed by `tool_use.id`, `turn-tail` keyed by turn.
- Feed it durable stream-json lines plus transient `stream_event`s.
- Publish `order[]` plus per-key sources.
- Use `PartialArguments`-style lazy reads for `input_json_delta`.
- Coalesce streaming to rAF and flush structural events immediately.
- Copy the incremental markdown freeze trick wholesale.

---

## 4. Scroll behaviour

The code is in `packages/client/ui-chat/src/client/chat/`:

| File | Owns |
|---|---|
| `use-chat-scroll.ts` (181 lines) | Composes the parts below and decides when content changes should move the scroll |
| `use-chat-viewport.ts` (800) | DOM: scroller refs, ResizeObserver, intent listeners, anchor capture and restore, paging preservation, the reserved spacer |
| `use-chat-reading.ts` (282) | Follow-tail policy, saved position, sampled reader movement |
| `use-scroll-follow.ts` (182) | `ScrollFollow`: follow intent and native smooth animation, without treating animation progress as reader movement |
| `use-chat-navigation.ts` (206) | Turn jumps and history-prepend anchoring |
| `flow-motion.ts` (532) | Fold animations on one frame clock with the scroll |

### 4.1 Stick to bottom

- `FOLLOW_THRESHOLD = 24` px and `SCROLL_SAMPLE_INTERVAL_MS = 500` (`use-chat-reading.ts:7-8`).
- **Telling the reader apart from layout.** `readScroll()` compares the current `scrollTop` with the last *acknowledged* position (`use-chat-viewport.ts:451-462`). If the content grew and the browser clamped, that isn't reader movement. Only real reading gestures release follow mode: `READING_INTENTS = ['wheel','touchstart','pointerdown','keydown','beforematch']` (:56). Keys count only if they are scroll keys, and pointer and keys inside the composer are ignored (:770-779).
- `onScroll` (`use-chat-reading.ts`, around :148-158): if layout moved while following, it re-follows immediately. If the reader reached the floor (< 1px), it re-follows. Otherwise it samples after 500ms or at `scrollend` to decide whether the reader left the tail.
- `ResizeObserver` on the column re-follows when content grows while following (`use-chat-viewport.ts:96-99`; `onResize` in reading).
- CSS `overflow-anchor: none` applies only while following the tail (`ChatView.module.css:36-39`), so browser scroll anchoring doesn't fight the manual follow.
- A "to bottom" button appears whenever `!followingTail` (`ChatView.tsx:240-251`).

### 4.2 Anchoring on send

`use-chat-scroll.ts:63-99`, `processContent`:

- "Own input" means the last node is a new `user`, or a new steering id, or a new local submission id (:67-71). Own input always cancels navigation and follows the tail, smoothly when deferred folding is on (:80-85). It also overrides a pending reader sample (:72).
- Without own input, a tip change (new last key, length, running flag, …) follows only if the reader was already following (:90-97). Otherwise the position is reconciled and the reader stays still.
- **Reserved spacer.** `[data-chat-turn-spacer]` (`ChatView.tsx:237`) is extra room below. When a completed turn folds just as a new message arrives, the new message can still land at the top without the page jumping. The space is given back on later scroll or growth (`reclaimBelow`, `use-chat-viewport.ts:418-428`).

### 4.3 Position memory and paging

- `capturePosition()` (`use-chat-viewport.ts:485-527`) finds the row at the top of the viewport using `elementsFromPoint`, with a binary search over rows as fallback. It saves `{anchorKey, anchorTop, scrollTop}`.
- This position is stored per session in an in-memory Map (`ui-chat/src/client/apply.ts:138, 278-283`) and restored when you switch back (`ChatReading.restore`). If none is saved, it follows the tail.
- **Load older.** `beginPreserving()` retains an anchor row and its offset (`use-chat-viewport.ts:614-643`). After the older page renders above, `preserve()` writes `scrollTop` so the anchor stays at the same pixel offset (:658-700), including inside capped inner group scrollers. Any reading gesture releases the anchor.

### 4.4 Turn navigator

- `TurnNavigator.tsx` is a fixed-pitch virtualized rail of turn marks. Each mark has a hover or focus preview of the prompt and response, an `aria-current` active turn, and `aria-busy` while a jump is loading.
- Items merge the loaded `navigation.items()` with the Host's **`turnOutline` projection**, which covers every turn in the session including unloaded ones (`turn-rail-items.ts`; `packages/session/session-turn-outline`).
- An unloaded turn's anchor is `{kind:'unloaded', seq}`. Clicking it calls `loadThrough(seq)` and then lands on the turn (`use-chat-navigation.ts:69-93, 182`).
- The active turn is computed from follow state, or by probing the reading line with a binary search over row boxes (`refreshActiveTurn`).

**Port to Claude Code:** take the gesture-intent model (wheel, touch, pointer, scroll keys) instead of "distance from bottom on every scroll event". Add the 24px threshold, per-session anchor memory keyed by row key, and anchor preservation on prepend. The turn rail is optional polish; Muster can build an outline cheaply in main from the JSONL (the first user text per turn).

---

## 5. Turn lifecycle in the UI

### 5.1 Sending

- `SubmitMachine` (`ui-conversation/src/client/input/machine.ts:37-80`) is a pure state machine: events in, effects out, with no React. Ordinary messages detach at Enter, so the editor clears at once and can take the next message while earlier sends are still in flight. Slash commands claim a frozen in-flight slot.
- **Optimistic echo.** `SessionSnapshot.pendingSubmissions` (`session-controller/src/client/contract/snapshot.ts`, `PendingSubmission`) is added synchronously with `requestId`, `placement: 'transcript'|'queued'|'steering'`, text and attachment previews. The durable `user/message.source.rpcId` echoes `requestId`. ChatView hides any echo whose rpcId is now durable (`ChatView.tsx:33-49, 151-176`). These echoes live in client memory only; reload rebuilds from durable events.
- `conversationPhase` = `blank | engaging | active` (`ui-conversation/src/client/contract/snapshot.ts:26-34`) drives the empty hero and composer layout.

### 5.2 Queue vs steer

- The inbox has two lanes, `next-turn` (queue) and `next-step` (steer) (`packages/core/agent/src/types.ts:39-45`).
- `prompt({requestId, sessionId, mode:'queue'|'steer', content})` (`session-controller/src/index.ts:461`).
- The busy-Enter preference is `queue` by default. Cmd/Ctrl+Enter picks the opposite (`ui-conversation/src/submission-settings.ts:12-18`; `input/submission-policy.ts:30-39`). If the agent isn't running, the mode is always `queue`.
- Agent semantics (`packages/core/agent-loop/src/agent.ts:163-173`):
  - `followup` → `next-turn`, wakes the agent.
  - `steer` → `next-step`, injected before the next model call of the running turn.
  - `inject` → `next-step` without waking. Used for system context such as file-change notices.
- **QueueDock** (`ui-conversation/src/client/queue/QueueDock.tsx`) renders `inbox['next-turn']` above the composer. Each row can be edited (text-only), removed, or sent as steer now (only while running). The actions are `updateQueue(itemId, {kind:'edit'|'remove'|'steer'})` (`session-controller/src/types.ts:168-175`).
- Admitted steering renders as a `steering` node in the flow, outside process folding. Pending steering shows as `PendingSteeringBubble` (`ChatFlow.tsx:44-50`).

### 5.3 Stop and interrupt

- `cancel({sessionId})` → `agent.cancel({kind:'user'}, {keepInbox:true})` (`session-controller/src/index.ts:513`; `commands.ts:509`). Queued items survive a stop.
- **Double Escape** (`ui-conversation/src/client/stop-sequence.ts:15-52`): two presses within an interval, against the same session, turn, binding generation and focused region. A stale first press can't cancel a newer turn.
- What the transcript shows after a stop:
  - The partial text is finalized as `assistant/message {interrupted: true}` and rendered with a "stopped" marker.
  - Dispatched tool calls with no result become synthetic `Interrupted` error results (`tool.ts`, `projectBlock`).
  - `turn/end {reason: aborted}` gives a `turn-error` node with code `INTERRUPTED`.

### 5.4 Running status, errors, quota, retries

- **Running** comes from `SessionSnapshot.running` (fed by `api-session/status`). `RunningStatus` (whale tail, shimmer, elapsed time from the open turn's `turn/start.time`) is appended at the end of the flow (`ChatFlow.tsx:20-26, 60`). It announces through `aria-live="polite"` without announcing every tick.
- **Errors:** `turn/end {reason: error{LlmFailure{message, code, status?, providerRetryAfterMs?}}}` becomes a `turn-error` node (`conversation-nodes/turn-error.ts`), which stays outside folding. Non-durable `agent/error` sets `SessionSnapshot.lastAgentError`. RPC failures set `promptError {op: 'send'|'stop', error}`.
- **Retries:** `llm/retry {retryId, turn, step, retry, maxRetries?, delayMs, failure}` and `llm/retry-started` fold into one `model-retry` node per `retryId` chain (`conversation-nodes/retry.ts`). `retryState` is scheduled → started, or cancelled if the step or turn closes first (:35-38). The assistant step resets its blocks on retry.
- **Quota notice** (`ui-chat/src/client/apply.ts:96-111`): ui-chat subscribes to each binding's event source and reacts **only to `change.kind === 'append'`** with a `turn/end` error whose code is `QUOTA` or `ACCOUNT_QUOTA`. An old failure scrolling back into view is "not news". It sets one app-wide notice that lives in `shell.overlay`, so it survives leaving the chat (`chat/QuotaNoticeHost.tsx`). Other packages can claim it through the `shell.quota-notice` chain slot, for example a billing upsell.
- **Max tokens:** `turn/end {reason: max-tokens}` becomes a `turn-max-tokens` node.

### 5.5 "apply" and "inject" in this codebase

These words have two unrelated meanings:

1. **Plugin wiring.** Each client package exports `inject = ['slots', 'uiConversation', …]` (required services) and `apply(ctx)`, which registers Definitions and slot renderers. Each `slots.register({inject: (sessionId, actions) => ({…callbacks, hooks: {…observables}})})` has a factory that gives the component its data and callbacks. Tests: `ui-chat/tests/chat-apply.client.spec.tsx`, `apply-inject.client.spec.tsx`.
2. **Agent `inject()`.** A non-waking `next-step` user message for context. It renders as a `context` node (`ContextInjectionRow.tsx`) or is hidden.

**Port to Claude Code:**

- Optimistic echo keyed by a client uuid, cleared when the matching `user` line comes back. Claude's `--replay-user-messages` with `--input-format stream-json` echoes user messages back with their uuid.
- A two-lane inbox:
  - **queue**: hold in Muster and write to stdin after `result`.
  - **steer**: write to stdin mid-turn. Claude Code stream-json input accepts extra user messages while a turn runs and folds them in at the next opportunity. Verify the exact semantics against the CLI version Muster targets.
- Stop = `control_request {subtype: 'interrupt'}`. Synthesize the interrupted markers as DSH does.
- Show quota notices only on live append, never on replay.

---

## 6. Approvals and user questions

### 6.1 Permission request path

1. The tool pipeline's `tools/pre-execute` waterfall returns `{kind:'ask', reason?, displayReason?}` (`packages/core/tools/src/index.ts:608-612`).
2. `serviceAsk` calls `approval.request({agent, toolName, callId, reason, displayReason, signal})` (`:1736-1774`).
3. `user-approval` (`packages/interaction/user-approval/src/index.ts`):
   - It requires an open turn (:219).
   - It logs `approval/asked` and `approval/decided` events (:225, 232). They are log-only, but replay can show them.
   - The `never` policy auto-rejects.
   - Otherwise it runs a scoped waterfall `'approval/request'` (:281-283). The outcomes are `'allowed-once' | 'rejected' | 'cancelled' | 'unavailable'` (`types.ts:32`).
4. `approval/request` is allowlisted for forwarding as a waterfall (`packages/api/remotes/src/remote-events.ts:28`).
5. Gateway Host (`packages/api/gateway/src/index.ts`):
   - It mints an `eventId` and sends a `waterfall` frame to **every attached client** (:622-679).
   - It **replays pending requests to newly attached clients** (:569-571), so a reload or a second window still sees the prompt.
   - **The first result wins** (:691-710). The others get `{type:'cancel', eventId}` (:734-745).
   - It is cancelled if the tool's signal aborts, for example on a turn cancel. There is no separate timeout.
6. Client gateway: it resolves the session Context, runs the local waterfall with an abort signal tied to the Host cancel, and POSTs `$events/result {clientId, eventId, outcome}` (`gateway/src/client/remote-events.ts:148-253`).
7. **UI** (`packages/client/ui-approval/src/client/index.ts`):
   - `ctx.remote.$on('approval/request', …)` creates a `PendingApproval` and registers it as the session's pending interaction. The highest precedence wins (`ui-session/src/client/index.ts:398-416`).
   - It **replaces the composer**: a priority-1 `conversation.composer` entry is selected when the pending interaction is an approval (:91-103).
   - `ApprovalPanel.tsx:12-88` shows the reason, or "Tool X requests privileged execution". A `conversation.approval.detail` slot keyed by callId lets Chat show the command parsed from the matching tool call's args (`ui-chat/src/client/apply.ts:332`; `chat/ApprovalCommand.tsx`).
   - Buttons: **Reject** (Esc) and **Allow once** (Enter). There is **no "always allow"**. Persistent trust is a permission *preset* (`workspace-write`+ask, `danger-full-access`+never, `auto`), switched with `/permission <preset>` (`packages/interaction/permission-presets/src/index.ts:81-92, 186-197`; `ui-permission-presets`).
   - The flow deliberately shows **no placeholder card** for a pending approval, because the composer takeover is the single surface (`ChatView.tsx:232-234`).
   - The sidebar shows `pendingInteraction: 'approval'|'plan-review'|'question'` on the row (`ui-workspace/src/client/tree.ts:410-412`).

### 6.2 User questions

- Tool `ask_user_question` (`packages/interaction/tool-ask-user/src/index.ts:39, 97-118`). Shape (`packages/interaction/user-questions/src/types.ts:10-69`):
  ```ts
  AskUserQuestionItem { id; question; detail?; header?; options?: {label, description?}[]; multiSelect?;
                        intent?: {kind:'plan-review', approve, callId?} }
  AskUserQuestionAnswer { answers: {id, selected: string[], custom?}[] }
  ```
- It goes through the same waterfall path (`'user-questions/request'`). `QuestionComposer` takes over the composer; plan-review has precedence 2 and plain questions 1 (`ui-user-questions/src/client/index.ts:371-400`).
- Two answer paths:
  1. **While the tool call is open**, the answer is the waterfall result and becomes the tool's result.
  2. **After a timed wait expired** (state `continued`), the client calls `userQuestions.answer(sessionId, callId, answer)`. The Host validates it and **steers** a `user-question-reply` message into the running turn (`user-questions/src/index.ts:164-213`).
- In the transcript: the `ask_user_question` tool row (`ui-tool/.../toolviews/ask-question-row.tsx`) shows the Q/A from its result or from the `userQuestions` projection. A late reply renders as a right-aligned `question-reply` node (`QuestionReplyView.tsx`).

**Port to Claude Code:** this maps almost one to one.

- A `control_request {subtype:'can_use_tool', tool_name, input, tool_use_id}` from the CLI becomes a PendingApproval keyed by `tool_use_id`. Show it as a composer takeover. Put the detail slot on the matching tool row, which is already streaming its input.
- Respond with `control_response {behavior:'allow', updatedInput} | {behavior:'deny', message}`.
- Copy "replay pending to a reattached renderer" and "first answer wins, cancel the others": keep pending requests in main, not the renderer.
- Unlike DSH, Claude supports `updatedPermissions`, so Muster can offer "always allow" directly.
- `AskUserQuestion` also arrives as `can_use_tool` with tool_name `AskUserQuestion`. Route it to a question composer and answer through `updatedInput` with the answers.
- Use precedence so plan-review (`ExitPlanMode`) beats plain questions, which beat approvals as DSH orders them, or choose your own order.

---

## 7. Plugin and slot architecture

### 7.1 ui-slots: typed registry

`packages/client/ui-slots/src/index.ts` (1673 lines, React-free):

- `interface SlotMap {}` (:26) is declaration-merged by each package. A row is `{kind, scope, owner?, keyProps?, hookContext?, inject?}` (:116-141).
- Kinds (:101): `single` (lowest priority wins), `list` (ordered by `order`, addressed by `id`), `keyed` (the owner passes `entryKey`; the matching cell renders), and `chain` (each entry's pure `select(owner)` runs in priority order and the first non-null wins).
- Scopes (:104): `root`, `session-maybe`, `session`.
- Component props are derived, never hand-typed: `ComposedProps = PropsRuntime & PropsRenderSlots & PropsRenderFactories & PropsStore & InjectFace & matched & locale` (:605).
- `register()` (:1209-1316):
  - It throws for an undeclared slot.
  - The same priority in the same cell is a clash. A different priority shadows (the lowest live entry wins).
  - `children` both declares child slots and authorizes the entry to render them; rendering an undeclared child throws.
  - A disposer removes the entry and recursively collapses its children (the "ledger", :1590-1613).
- `ctx.slots.inject(key, cb)` (`ui-renderer/src/client/registry.ts:209-262`) runs `cb` for each lifetime of the target slot's declaration. Load order between packages doesn't matter, and contributions come back if the parent remounts.

### 7.2 ui-renderer

- The `SlotOutlet` (`ui-renderer/src/client/scoped-slots.tsx:1069`) subscribes to the slot version through uSES and wraps its output in `<div data-slot={key} style="display:contents">`.
- Each entry is wrapped in an `SlotErrorBoundary`. A crashing renderer *abdicates* and the next priority takes over (:1103-1250).
- `boundRenderSlot` is cached per entry, and inject results are cached per entry and binding, so props keep their identity and `memo` holds (:66-88, 162-164, 544, 640).

### 7.3 Tool renderers per tool name

- Slot `'tool.call.toolview': {kind:'keyed', scope:'session', owner: ToolCallOwnerProps}` (`ui-tool/src/client/contract/slots.ts:26-44`). The key is the wire tool name.
- Dispatch (`ui-tool/src/client/tool/ToolCallTree.tsx:19-56`):
  ```tsx
  renderSlot('tool.call.toolview', owner, { entryKey: toolName, fallback: <GenericToolCard {...owner} t={t}/> })
  ```
  `ToolCallBranch` recurses into `subCalls`.
- Owner props (:60-88): `callId, toolName, cwd, home, openFile, loadImage, inspect?, useDisclosure`, plus a phase union `{phase:'preparing', block} | {phase:'start', block} | {phase:'result', block}`.
- `ToolRow` (`components/ToolRow.tsx:31-124`, `memo`) is the shared chrome: variant, icon, title, summary, `state: preparing|running|ok|error|stopped`, and an optional card body (`terminal | diff | read | image | search | web | details | askQuestion`).
- Pure *model* functions feed both the generic card and the specific views:
  - `toolRowModel`
  - `classifyTool` (`models/tool-call-model.ts:129`)
  - `diffCardModel` (`models/diff-card-model.ts:100`): a live diff from `old_string`/`new_string` while running; the server `meta.diffs` once settled; capped at 9 lines
  - `terminalCardModel`: parses the exit status, so a non-zero exit counts as an error (`terminal-card-model.ts:293`)
- Registered keys:
  - in ui-tool: `bash`, `read`, `read_image`, `edit`, `write`, `grep`, `glob`, `web_search`, `web_fetch`, `todo_write`, `ask_user_question`, and goal/schedule/workflow details
  - elsewhere: `skill` (ui-skill), `present` (ui-deliverables), `cordis_*` (extensions)
- One spec checks that an unknown tool `mystery` falls back to the generic card (`ui-tool/tests/toolview-slot.client.spec.tsx:113-126`).

### 7.4 Chat node renderers

`conversation.chat.node` is a keyed slot on `node.kind` (`ui-chat/src/client/apply.ts:218`). It has a slot-level inject that gives every occupant constrained hooks: `useTurnData(key)`, `useDisclosure` and `useGroupAction` (`contract/slots.ts:204-206`). A new business feature registers one Definition plus one renderer (`docs/subsystems/conversation.md:78-244` has a full "review job" example).

**Port to Claude Code:** skip the Cordis machinery and keep the two seams.

- `Map<nodeKind, Component>` for rows.
- `Map<toolName, {component, priority}[]>` for tools, with a generic fallback and an error boundary per renderer.
- Key MCP tools by full name (`mcp__server__tool`) with a prefix fallback.
- Keep tool views fed by pure model functions so they can be unit-tested.

---

## 8. Session list and sidebar

`ui-sidebar` is only the frame (slots `sidebar.panellist`, `sidebar.workspaces`, …). The list itself lives in `packages/client/ui-workspace` (`tree.ts`, `rows/WorkspaceBrowser.tsx`, `rows/Rows.tsx`) over `api/workspace-controller`.

- **Grouping:** `'workspace' | 'workspace-tree' | 'flat'` (`ui-workspace/src/client/stores.ts:17`). Workspace membership comes from the server (`WorkspaceView.sessionIds`). Sessions outside any workspace go into "Ungrouped" (`tree.ts:18, 26`). There is **no date grouping**; rows show relative times (`Rows.tsx:137`).
- **Ordering:** `'manual' | 'updated'` (`tree.ts:65`). Recency sorts by `updatedAt` descending. Manual order is stored in the browser and reconciled with membership; a fork is placed before its source (`tree.ts:143, 168`).
- **Pinned and archived** are global id sets on the server (`workspace-controller/src/commands.ts:182-226`). Pinned rows lead their section. Archived rows are greyed, can't be opened, and are filtered by `ArchivedFilter = default|show|only`.
- **Running and unread:** `SessionStatus {running, pendingInteraction, completionUnread}` (`ui-session/src/client/index.ts:60-67`). `completionUnread` is set when a session moves from running to stopped while it isn't the main view, and cleared when it's opened (:490-497). The row shows a spinner, a done dot, and an approval, question or plan badge.
- **Titles** are generated on the server (`packages/session/session-title`). The first eligible human message, then an optional async LLM title, then an explicit rename, which pins the title against automatic renaming.
- **Search** combines a client substring match on title and workspace with a server content search over `user/message` and `assistant/message` (`session.search`). The server search is debounced at 250ms, uses an AbortController, and caps queries at 500 characters (`WorkspaceBrowser.tsx:51-53, 1150-1185`). Local hits come first, then de-duplicated content hits.

**Port to Claude Code:** the `completionUnread` rule (running→stopped while not focused) and the pending-interaction badge are cheap and high value. Search can run in main over the JSONL transcripts with the same debounce and abort pattern.

---

## 9. Testing approach

`docs/testing.md:7-15` defines the tiers:

1. Unit tests. Every registry needs a test that disposes the plugin and checks cleanup.
2. A 100% per-file coverage gate.
3. Real-API e2e tests, which skip when no key is set.
4. Expected-output tests.
5. Benchmarks.
6. Snapshot replay of recorded `session.vN.jsonl`.
7. Web browser snapshots in Chromium (`DSH_SNAPSHOT=replay pnpm run test:web`).

The rule is to mock only the LLM, network and clock.

Client spec conventions (`packages/client/AGENTS.md`, Testing): the first line is `// @vitest-environment jsdom`. Specs assert user-visible behavior, not class names or render counts, and feed realistic props directly.

- **Pure component specs.** `ui-chat/tests/chat-view.client.spec.tsx` builds a fake chat source (`makeChatSource`, :142) from `chatSnapshotFixture({nodes, partial, runningCalls, …}, previous)` (`tests/chat-snapshot-fixture.client.ts:304`). The fixture reuses previous stores so identities stay stable. The spec binds the source with the real `bindSnapshotSelector` and renders `ChatView` and `ChatFlow` with no server.
- **Real mini-runtime.** `SlotTestRuntime` (`packages/test-support/client-runtime/src/index.ts:220`) combines a real Cordis Context, the slot registry and renderer, and fake sessions. Example: `runtime.sessions.add({events})`, `runtime.mount({apply})`, `runtime.renderRoot()` (`ui-tool/tests/toolview-slot.client.spec.tsx:77-110`).
- **Assembler specs.** `ui-conversation/tests/conversation-assembler.client.spec.ts:175` calls `replaceWindow`, `append`, `flush` and asserts O(1) work per event. The verification checklist is `docs/subsystems/conversation.md:288-299`: replace equals history plus append; prepend keeps keys; at most one publish per frame.
- **Scroll specs.** `chat-scroll.client.spec.tsx`, `chat-viewport.client.spec.ts`, `scroll-follow.client.spec.ts` and `fold-follow.client.spec.ts` use fake timers. `afterEach` asserts `vi.getTimerCount() === 0`, so leaked timers fail the test.
- **Virtualization spec.** `turn-navigator.client.spec.tsx` renders 1000 turns with a fake ResizeObserver whose layout getters **throw**, which proves the rail never forces a layout read. It also asserts that fewer than 40 buttons are mounted.
- **Type-chain specs.** `views-type-chain`, `toolview-type-chain` and `ui-slots/tests/type-chain` are `@ts-expect-error` contracts.
- **Browser snapshots.** `snapshots/web/<case>/snapshot.yml` points at a recorded session JSONL. The expected `ui.expected.md` is a Playwright ARIA snapshot with `{{clock}}` placeholders.
- **Performance.** `ui-conversation/tests/history-transport.perf.client.ts` serves about 416K events over a local http server and measures parsing and assembly.

**Port to Claude Code:** record real Claude stream-json sessions to fixture files and replay them through the assembler. Assert that the final snapshot is identical whether you (a) replace with the whole file or (b) replace with a prefix and then append the rest line by line. Add Playwright ARIA snapshots for the rendered transcript, and a fake-timer leak check on the scroll hooks.

---

## 10. What ports cleanly to Claude Code stream-json

| DSH concept | Claude Code stream-json equivalent | Fit |
|---|---|---|
| `StreamChunk` deltas | `stream_event` with `content_block_start/delta/stop` (`text_delta`, `thinking_delta`, `input_json_delta`) | Direct |
| `assistant/live-chunk` transient, retired on settle | partials keyed by `message.id`, retired when the full `assistant` line arrives | Direct |
| `assistant/message` per step | `assistant` line (one per model call; may split content across lines with the same `message.id`, so merge by id) | Direct, needs merge |
| `tool/call` + `tool/result` keyed by callId | `tool_use.id` in assistant content plus `tool_result.tool_use_id` in the `user` line | Direct |
| `PartialArguments` lazy reader | `input_json_delta.partial_json` | Direct, high value |
| sub-calls (`parentCallId`) | `parent_tool_use_id` on lines from `Task` subagents | Direct |
| `turn/start` / `step/start` boundaries | none; synthesize from stdin write and `message.id` changes | Synthesize |
| `turn/end {reason}` | `result {subtype, is_error, …}`; interrupt via `control_request interrupt` | Direct |
| `llm/retry` | `system` api_retry-type messages where the CLI emits them | Partial |
| approval waterfall | `control_request can_use_tool` → `control_response` | Direct (plus "always" via updatedPermissions) |
| ask-user-question waterfall | `can_use_tool` with `AskUserQuestion` | Direct |
| queue / steer inbox | hold in Muster vs write to stdin mid-turn | Direct (verify CLI semantics) |
| `rpcId` echo for optimistic bubbles | `--replay-user-messages` uuid echo | Direct |
| follow snapshot + revisioned deltas | main→renderer IPC contract | Direct |
| `turnOutline` projection | compute in main from the JSONL | Easy |
| Cordis plugin graph, typed SlotMap algebra | overkill for Muster; keep plain registries | Skip |
| per-event durable seq | assign a monotonic seq in main per parsed line | Easy |

### The 8 most portable ideas, ranked

1. **Definitions that fold by stable id.** One small state machine per concept (assistant step by `message.id`, tool call by `tool_use.id`, turn footer, retry chain). Use `match → start/update → buildViewNode`. Append touches one Context, and replay equals live.
2. **Durable vs transient entries.** Live partials are transient rows with fractional seqs. They are retired when the durable `assistant` line lands, so reload, reconnect and live streaming all produce the same state.
3. **Ordered keys plus per-key sources.** `order[]` changes identity only on structural change, and each row subscribes to its own key through a cached `useSyncExternalStore` selector. A token re-renders one row.
4. **Publication cadence per event.** Streaming deltas coalesce over rAF (DSH waits three frames). Structural events (`tool_result`, `result`) flush immediately and cancel the pending frame.
5. **A lazy partial-JSON argument reader** with "re-render only if a field you read changed". Combine it with **incremental markdown** that freezes all but the last two blocks.
6. **A revisioned snapshot-then-delta contract** between main and renderer: subscribe before reading, use `replace | prepend | append | settle`, and fall back to a full replace on any revision gap. Pending approvals live in main and replay to a reattached renderer.
7. **Approvals and questions as a composer takeover**, keyed by `tool_use_id`, with precedence across plan-review, question and approval. The detail comes from the already-rendered tool row. "First answer wins", plus a sidebar badge.
8. **Intent-based stick-to-bottom.** Only wheel, touch, pointer and scroll keys release follow; layout clamps never do. A 24px threshold, a forced follow on own send, per-session anchor memory (`anchorKey` + offset), and anchor preservation when older history prepends.

Runners-up: the keyed tool-renderer registry with a generic fallback and per-renderer error boundary (section 7.3); whole-turn process folding with category titles (section 3.3); `completionUnread` dots; quota and error toasts only on live append; a tool still running when its step closed becomes "Interrupted"; and replay-equivalence tests over recorded stream-json.
