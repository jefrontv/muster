# `annotate_plan` — in-app plan review for agents

2026-09-02. Add a tool to the muster-sites MCP server that opens a markdown plan in a Muster modal, lets the user annotate it, and returns those annotations to the calling agent as the tool result.

Every file reference below was read against the current tree. Where something does not exist, it says so.

## Why this, when Plannotator exists

Plannotator already does document annotation well, and this plan deliberately copies its contract rather than inventing one. It has one structural limit, from its own docs:

> Plannotator does not keep a completed OSS review session attached to the original agent across multiple feedback rounds.

That falls out of its shape: CLI spawns a temp server, opens a browser, exits. Each round is a new session.

An MCP tool call does not have that problem. The call is still open while the user annotates, so the agent is mid-turn with full context when the result lands. Multi-round review is the normal case rather than a reconnection problem, and Muster already knows which site, environment and branch a plan targets.

So: build the part Plannotator structurally cannot, copy the part it already got right, and skip the rest.

**Not building:** image markup, HTML annotation, code/PR review, archive browser, team sharing, `--gate`/`--hook` equivalents. The blocking tool call *is* the gate.

## The round trip

```
Agent ──tools/call──▶ MCP proc (plain Node, ELECTRON_RUN_AS_NODE=1)
                          │
                          │ POST /plan/annotate  (loopback HTTP + bearer token)
                          ▼
                     GUI main ── holds ServerResponse open ──┐
                          │                                   │
                          │ IPC push { requestId, doc }       │
                          ▼                                   │
                     Renderer modal ── user annotates         │
                          │                                   │
                          │ IPC respond { requestId, result } │
                          ▼                                   │
                     GUI main ─────────────────────────────────┘
                          │ 200 { decision, annotations, edits }
                          ▼
                     MCP proc ──▶ tool result ──▶ Agent
```

Both halves of this already exist separately and neither is being invented:

| Need | Exists as | Reuse |
| --- | --- | --- |
| Tool shape `{name, description, inputSchema, run}` | `site-mcp-context.ts:100-105`, example `site-mcp-discovery-tools.ts:168-178` | copy |
| Cross-process request/response | `SiteWriteBridgeServer`, `site-write-bridge-server.ts:76-129` | add a route |
| Block on a human answer | `chat-connector-confirm.ts:25-56` — Promise map by `requestId` | template |
| IPC-pushed modal outside `activeModal` | `ChatConnectorConfirmDialog.tsx:20-37` | ~70% |
| Notes → agent-readable text | `formatMarkdownReviewNotes`, `markdown-review-notes.ts:206-224` | as-is |

## The contract

Copied from Plannotator, because agents (and the user) already know it.

```jsonc
{
  "decision": "annotated" | "approved" | "approved_with_notes" | "dismissed",
  "round": 2,
  "plan_path": "/abs/path/plan.md",   // null when the plan was passed inline
  "feedback": "<agent-readable markdown>",
  "annotations": [
    {
      "kind": "comment" | "delete" | "looks_good" | "label" | "global",
      "quote": "the exact selected text",
      "start_line": 42,
      "end_line": 44,
      "body": "why this is wrong",
      "label": "scope"          // kind === "label" only
    }
  ],
  "edits": {                      // present only when the user edited directly
    "unified_diff": "@@ …",
    "applied_to_disk": true
  }
}
```

Notes on the shape:

- **`decision` drives control flow.** Returning only annotations, as the first draft of this plan did, leaves the agent guessing whether to revise or proceed.
- **`quote` is the durable anchor; line numbers are a hint.** Lines drift the moment the plan is rewritten between rounds. `MarkdownReviewNote` (`markdown-review-notes.ts:8`) already carries `selectedText` alongside `lineNumber`/`startLine`, so this is the existing shape, not a new one.
- **`round` and revision diffing are the differentiator.** Keyed by absolute plan path per agent session, so round 2 can show what changed since round 1.
- **`applied_to_disk`** tells the agent not to re-apply an edit the user already saved.

## Work

### 1. Bridge route that does not reply immediately

`src/main/sites/site-write-bridge-server.ts`

`handle()` (`:76-129`) is a flat dispatcher where every branch calls `reply()` synchronously. Add `POST /plan/annotate` which instead parks the `ServerResponse` in a `Map<requestId, ServerResponse>` and returns without replying.

**Gotcha:** Node 18+ defaults `server.requestTimeout` to 300s. A plan review runs longer. Set `requestTimeout = 0` on this server and rely on an explicit application-level timeout instead, so the deadline is ours and is visible in one place.

Token check at `:87` applies unchanged.

### 2. MCP-side client without the 5s abort

`src/main/sites/mcp/site-mcp-plan-bridge.ts` (new)

`postToBridge` (`site-mcp-store-bridge.ts:36-63`) aborts at `BRIDGE_REQUEST_TIMEOUT_MS = 5_000` (`:13`) — correct for a site write, fatal here. New client, no abort, or a very high ceiling.

**No headless fallback.** Site writes fall back to a direct disk write when no GUI is running; there is no equivalent for "ask the user". When the bridge file is missing or the port is dead, fail with a clear message: no Muster window is running, so the plan cannot be reviewed.

### 3. The tool

`src/main/sites/mcp/site-mcp-plan-tools.ts` (new, one array, matching the per-domain convention)

```ts
{
  name: 'annotate_plan',
  description: '…',
  inputSchema: objectSchema({
    path: { type: 'string', … },     // preferred
    content: { type: 'string', … }   // fallback for an unwritten plan
  }),
  async run(context, args) { … }
}
```

Register in the spread at `site-mcp-tools.ts:21-30` (34 tools today → 35). Files sit well under the 300-line cap in `.oxlintrc.json:80`, which is shrink-only, so a new file is the right move over growing an existing one.

Read and validate the path in the MCP process — it already has disk access — and send the content, not the path, so the renderer never needs to resolve a path it may not be able to see.

**`path` or `content`, exactly one required.** A path is strongly preferred and the description should say so: it gives the review a stable identity across rounds (so revision diffing works), it lets a direct edit be saved back to disk, and it survives the agent's context being compacted. Inline `content` exists for a plan that has not been written yet — it still reviews fine, but `plan_path` comes back null, there is nothing to save an edit into, and round-over-round diffing falls back to comparing submitted text.

### 4. Main-side pending registry

`src/main/sites/plan-annotation-requests.ts` (new)

Straight port of `chat-connector-confirm.ts:25-56`: `Map<requestId, { resolve, timer }>`, a `request…()` that returns a Promise and pushes over IPC, and a `respond…()` that clears the timer and resolves. Broadcast via `webContents.send` as `src/main/ipc/chat-connector.ts:113-115` does.

**Concurrent requests queue; none are dropped.** Two agents each spawn their own `--site-mcp` process, so two reviews can land on the same GUI at once — and once the dispatcher change in §8 lands, a single agent can too. Every pending request keeps its own parked `ServerResponse` and its own promise, so the registry is already a map rather than a single slot; the modal shows one at a time and pops the next on submit. A plan arriving mid-review waits its turn instead of replacing the open one.

Ordering is FIFO by arrival. Each queued entry starts its own timeout clock **when it reaches the front**, not when it arrived, so a plan sitting behind a slow review is not penalised for the wait.

Timeout much longer than the confirm dialog's `CONFIRM_TIMEOUT_MS = 120_000` — a plan review is 10+ minutes. **Decision: 30 minutes**, resolving `{ decision: 'dismissed', reason: 'timeout' }` rather than rejecting, so the agent gets a usable answer. A ceiling rather than none, because a forgotten modal would otherwise hold both the agent and everything queued behind it indefinitely.

### 5. Preload channel

`src/preload/index.ts` + `src/preload/api-types.ts`: `onAnnotatePlanRequest` / `respondAnnotatePlan`, mirroring `chatConnector.onConfirmRequest` / `.respondConfirm`. Stub in `src/renderer/src/web/web-preload-api.ts`.

### 6. The modal

`src/renderer/src/components/plan-annotation/` (new)

Always-mounted, queue-backed, subscribing to the IPC channel — the `ChatConnectorConfirmDialog.tsx:20-29` shape. **Not** a new `ModalId` in the `activeModal` switchboard: that slice has zero IPC-driven producers (`store/slices/ui.ts:1508-1513`), and the codebase already routes agent-initiated dialogs around it.

Renderer choice is the one real fork:

- `MarkdownPreview.tsx:110-125` is the good renderer — GFM, math, mermaid, TOC, and an existing line-anchored note layer — but it is bound to a real worktree file (`sourceFileId`, `sourceWorktreeId`), and `addDiffComment` keys notes by worktree + filePath. A plan at an arbitrary path has neither.
- `CommentMarkdown.tsx:222-296` is worktree-free but has no anchoring at all.

**Decision: line-anchored notes, purpose-built viewer.** A viewer reusing `react-markdown` with the same plugin set, plus a note collector keyed by `requestId`, reusing `DiffCommentCard.tsx:34-53` for note rendering. Avoids bending the file/worktree model around an ephemeral document.

Whole-document notes were the cheaper option and are rejected: line anchoring is the entire reason to build this rather than ask the user in chat. The review of *this* plan is the evidence — four of the five comments came back anchored to specific lines, and those were the actionable ones; the single general comment was the one that needed the most interpretation.

The queue is the same FIFO the registry keeps (§4): show one plan, pop the next on submit, and surface a count so the user knows another is waiting.

Also required, cheap, and high-trust: an export preview so the user sees exactly the markdown the agent will receive before sending.

### 7. Draft persistence

The one place this design is currently *worse* than Plannotator: a crash mid-review loses the notes **and** strands the held HTTP response. Persist drafts keyed by `requestId` and restore on reopen.

### 8. Unblock the dispatcher

`site-mcp-server.ts:126-129` chains dispatch through `tail = tail.then(work)`, so one in-flight call blocks the next from even starting. While a plan sits open, every other muster-sites tool from that agent stalls — `list_sites` included. `run_ssh_command` already blocks up to 5 minutes (`site-mcp-ssh-tools.ts:29`), so long calls have precedent, but a human reading a plan is an order of magnitude longer.

In scope, per review. Let a tool opt out of the serialization chain and run concurrently, then mark `annotate_plan` as such. Contained to that dispatcher, and it is what makes the queue in §4 reachable from a single agent rather than only from two.

The ordering guarantee the chain exists to provide still holds for every other tool; only tools that explicitly opt out run off it.

## Consequences to accept

**Not the chat-connector.** That server runs in-process with the blocking pattern already wired, which would delete work items 1 and 2 entirely. It does not fit: `chat-connector-server.ts:1-4` scopes tokens per chat-mode thread and serves Muster's native chat, not a terminal agent. The real caller is an agent in a Muster terminal, so muster-sites is the channel.

**A native modal over a browser tab.** Plannotator's browser UI is shareable and survives Muster restarting. This does neither: the review lives and dies with the app window. That is the trade for keeping the agent attached across rounds.

## Tests

- `site-mcp-plan-tools`: schema validation, `path` xor `content`, missing/unreadable path, no-GUI failure message.
- Bridge route: parks without replying; replies on respond; token rejection; timeout resolves `dismissed`.
- Pending registry: resolve, double-respond is a no-op, timeout path.
- **Queue: two concurrent requests both resolve, in arrival order, with neither dropped** — the failure this is guarding against is a lost review, so it gets a test per transport (two bridge POSTs) and one in the modal (two queued, submit each).
- Queued entry's timeout starts at the front of the queue, not on arrival.
- Modal: decision buttons emit the right payload; export preview matches what is sent.
- Dispatcher: a long `annotate_plan` does not block a concurrent `list_sites`; every non-opted-out tool still runs in arrival order.

## Decisions from review

1. **Timeout: 30 minutes**, resolving `dismissed` with `reason: 'timeout'`. A ceiling beats none — a forgotten modal would hold the agent and the whole queue.
2. **Dispatcher change is in scope** (§8), landing with this rather than after.
3. **Line-anchored notes**, not whole-document (§6). The cheaper option loses the only thing that makes this better than asking in chat.
4. **Accept `path` or `content`, exactly one** (§3). Path preferred and documented as such: stable identity across rounds, savable direct edits, survives compaction.
5. **Requests queue rather than collide** (§4, §6). Raised in review; two agents already produce two MCP processes, so this was reachable before the dispatcher change made it reachable from one.
