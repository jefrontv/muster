# Chat mode on the Bots chat UI

Status: draft for review, 2026-10-30. Plan only; no code has changed.

Goal: Chat mode looks and behaves like the chat in the Bots tab: its layout, bubbles, activity pills, live turn presence, composer and sidebar, plus the conversation behaviours behind them.

Sources read for this plan:

- Muster: `docs/STYLEGUIDE.md`, `src/renderer/src/assets/main.css`, `docs/muster/2026-10-19-chat-mode-refactor-plan.md`, `docs/muster/2026-10-30-muster-bots-plan.md`, `docs/muster/research/muster-bots/*.md`, `src/renderer/src/components/chat-thread/`, `src/renderer/src/components/chat-mode/`, `src/main/chat-mode/`, `src/shared/chat-engine-types.ts`, `src/main/bots/`, `src/renderer/src/components/bots/`.
- Bots fork (`~/Sites/muster-bots`, HEAD `c0b783245`): `src/components/ChatView.tsx`, `Composer.tsx`, `ReplyBlocks.tsx`, `ConversationalReply.tsx`, `chat-bubble.ts`, `TurnPresence.tsx`, `RichTable.tsx`, `ChatHeadPill.tsx`, `ActivityRun.tsx`, `ToolActivity.tsx`, `TurnNarrationRun.tsx`, `ChatEmptyState.tsx`, `elevated.ts`, `Sidebar.tsx`, `SidebarThreadRow.tsx`, `src/lib/activity-runs.ts`, `formatted-reply.ts`, `interface-mode.ts`, `skins.ts`, `muster-host-theme.ts`, `shared/reply-style.ts`, `src/styles.css`, `server/drivers/claude.ts`, `server/system-prompt.ts`.

## Recommendation in brief

1. Take option (b): port the Bots conversation model and look onto Muster's existing chat engine. Do not run Chat mode on the Bots server.
2. Build it as a new Chat-mode-only surface, `src/renderer/src/components/chat-conversation/`, that reuses the engine store, scroll, paging, markdown pipeline and tool bodies from `chat-thread/`. Code mode keeps drawing on `chat-thread/` unchanged.
3. Colours need almost no new work: the Bots tab already paints itself from Muster's tokens. New tokens cover shape (column, bubble and prose widths, a 16px radius, a 15px text size) and one fill for assistant reply bubbles.
4. Engine changes are small: a reply-style line in the system prompt, plus UI for two control actions the engine already has (`setPermissionMode`, `rewind`).
5. Eight phases, about 11 working days for one agent, each reviewable alone.

## 1. What exists today

### Chat mode

- `ChatModePage.tsx:93-110` lays out `ChatModeSidebar` beside `ChatThreadView`, or the `ChatModeDraftHero` when no thread is open.
- `ChatThreadView.tsx:147-158` renders `ChatThreadSurface` (from `chat-thread/`) with `ChatThreadComposerSeat` as its footer.
- The transcript is turn-based. `ChatEngineTurn` (`src/shared/chat-engine-types.ts:120-133`) holds the user message, an `items[]` list (`text`, `thinking`, `tool`, `agent`, `notice`, `steer`, lines 83-106), status and timings. Main owns the model and sends a snapshot and then numbered patches.
- The look follows DeepSeek Harness: a `clamp(680px, 64%, 920px)` column, a pale user bubble, bare assistant prose at 14/24, 24px tertiary process rows, a 28px-radius composer (STYLEGUIDE lines 109-162).

Two shared seams matter for this plan:

- **Code mode draws on the same surface.** `NativeChatView.tsx:8` imports `ChatThreadSurface` and renders it at line 316 (commit `a08a5e52da`, "draw code mode chat on thread surface"). Restyling `chat-thread/` in place would change Code mode.
- **Code mode uses the same composer look.** `NativeChatView.tsx:275-276` sets `seat: true`, the same flag `ChatThreadComposerSeat.tsx:47` sets, and the seat classes in `native-chat/chat-seat-composer-classes.ts` and `chat-seat-takeover-classes.ts` are imported directly by the composer components.

### The Bots chat the user sees

- Inside Muster the Bots UI starts in Advanced mode (`src/lib/interface-mode.ts:26-27`: "Muster's Bots tab sits beside its Code view, so it starts in advanced mode"). This plan targets the Advanced look. Simple mode's joined iMessage-style bubbles (`chat-bubble.ts:32-137`) are out of scope unless review says otherwise.
- The Bots tab wears Muster's colours, not a Bots skin. `bots-host-theme.ts:4-24` sends Muster's tokens to the guest, and `muster-host-theme.ts:19-56` in the fork maps them onto the Bots skin variables over the Midnight or Daylight rules. So the look the user likes is Bots' layout, shapes, spacing and motion, painted in Muster's palette.
- One side effect: the guest maps `--color-card` (the assistant bubble) to Muster's `--card`, which is `#fff` in light mode, the same as `--background`. In light mode the assistant bubble in the Bots tab is white on white and reads as bare text. The port fixes this with a dedicated reply fill (section 5).

What makes the Bots chat feel different, by component:

| Bots piece | What it does | Source |
| --- | --- | --- |
| Transcript column | One centred column, max `60rem`, `px-5`, 12px row gap, transcript and composer share the cap | `styles.css:203-226`, `:1607-1614`; `ChatView.tsx:1180` |
| Header | Translucent bar that fades into the page; pill with avatar and thread title, rename in place, model picker, menu | `ChatView.tsx:1019-1167`; `ChatHeadPill.tsx` |
| User bubble | `bg-bubble-user`, `rounded-2xl` (16px), 15px text, `px-4 py-2.5`, long messages collapse after 600 characters or 8 lines | `ChatView.tsx:137-138`, `:466-481` |
| Assistant reply | A chat-line reply sits in a card bubble (`bg-card`). A reply with block markdown reads as bare prose at a prose width. Tables get a full-width card | `ChatView.tsx:473-479`; `src/lib/formatted-reply.ts:11-35` |
| Conversational replies | Optional reply style: a prompt line asks for short plain replies, and the reply splits on blank lines into staggered bubbles | `shared/reply-style.ts:13`; `ConversationalReply.tsx`; `server/system-prompt.ts:47` |
| Activity run | Finished tool steps fold into one rounded pill: check, "Read 3 files, ran 2 commands", chevron. Open, it lists each step | `ActivityRun.tsx`; `activity-runs.ts:168-188` |
| Tool step | A `<details>` card: status glyph, tool name in mono, summary; open shows input and output | `ToolActivity.tsx` |
| Turn fold | "Worked for 29s" pill over the turn's narration and steps | `TurnNarrationRun.tsx`; `activity-runs.ts:55` |
| Turn presence | Live line under the transcript: avatar, "Working · 1m 12s · Reading chat.ts" with a shimmer, phrases that rotate, a chevron that opens a card of the last steps | `TurnPresence.tsx:78-241`; `NowCard.tsx`; `src/lib/live-activity.ts` |
| Composer | `rounded-2xl` card on the composer fill with a 0.5px ring and a float shadow; plain page colour behind its lower half; queued messages with Steer, Edit and Cancel above it; approval panel docked above it | `Composer.tsx:752-798`; `elevated.ts` |
| Message actions | Hover tray: copy, reply (quote into the composer), retry, more menu | `MessageActions.tsx`; `ChatView.tsx:433-441` |
| Tables | Sortable, virtualised table card with copy, CSV download and an expand dialog | `RichTable.tsx` |
| Pills | One `.ui-pill`: 28px tall, full radius, hairline border, panel fill, 13px medium, secondary ink | `styles.css:1227-1248` |
| Run card | After a run of commands, a card offers to save them as a skill | `VerifyCard.tsx`; `src/lib/verify-steps.ts:200-264` |

## 2. What "the chat system" means (decision 1)

| | (a) Bots look on Muster's engine | (b) Bots look and conversation model on Muster's engine | (c) Chat mode runs on the Bots server |
| --- | --- | --- | --- |
| What changes | Colours, radii, spacing of the current `chat-thread` rows | New Chat-mode surface: bubbles, reply shaping, activity pills, turn presence, header, composer behaviours, sidebar rows; small engine additions | Chat mode becomes a view of Bots threads; the Bots server's Claude driver runs the CLI |
| Matches the Bots chat | Partly. No presence line, no reply cards, no pills, no quote reply | Yes, for everything Claude Code can supply | Exactly |
| SSH workspaces | Unchanged (engine host seam stays) | Unchanged | Lost. The sidecar runs locally; remote bots are listed under "Later" in the Bots plan |
| Folder workspaces | Unchanged | Unchanged | Muster's multi-folder workspaces have to be rebuilt as bot working folders |
| Windows | Hidden today, unchanged | Unchanged | Same (sidecar is off on Windows too) |
| Managed Claude account | Per launch, as today | Per launch, as today | The sidecar resolves Claude auth once when it forks (`src/main/bots/bots-agent-env.ts:41`), so switching account means restarting the sidecar |
| Engine tests | Kept (28 test files in `src/main/chat-mode/`) | Kept, plus new pure-function tests | Dead. The Bots driver's tests run under the fork's toolchain (Node 24, pnpm 10.33), not Muster's vitest |
| Muster-only chat features | Kept | Kept: workspace brief, muster MCP connector, ActiveCollab task strip and chips, search index, notifications, Tasks page, drafts, pin, unread, archive, drag order | Lost or reimplemented inside the fork |
| Code mode risk | High if rows are restyled in place (shared surface) | Low: separate folder, two class files touched | None |
| Size | 3 to 4 days | About 11 days | Small to wire, large to recover lost features |

**Recommendation: (b).** The engine was rebuilt two weeks ago to fix three sources of truth, and it is tested by replay. Option (c) throws that away to get pixels the Bots tab already shows, and Chat mode would then depend on an experimental 212K-line sidecar. Option (a) misses most of what the user named: the presence line, reply cards, activity pills and composer behaviours are structure, not colour. In (b) the Bots code is a reference and a source of small pure functions and component chrome; the data still comes from `ChatEngineSnapshot`.

What (b) ports from the Bots conversation model:

- Reply shaping: chat line in a card, document-shaped reply as prose, tables as cards, optional conversational split.
- Process display: activity-run pills over Muster's tool bodies, turn fold pill, tool cards.
- Turn presence: live line with timer, rotating phrases from the running tool, last-steps card.
- Message actions: copy, quote reply, retry, undo changes (through the engine's existing `rewind`).
- Composer: Bots card and dock, round accent Send and Stop, queued chips, docked approval panel, a + menu holding attach and permission mode.
- Header and sidebar rows.

What it leaves out: edit-and-branch of past messages (the engine has no branching; the Bots server builds it on its own checkpoint store, `server/checkpoints.ts`), reactions, read-aloud, pinned message banner, find bar, bot avatars and the mascot, rooms and teammates, the run card (see section 9).

## 3. Keeping Code mode untouched

1. All new transcript components go in `src/renderer/src/components/chat-conversation/`. Code mode never imports from it.
2. `chat-thread/` files change only to export something that already exists (a hook or model), with no behaviour change. Each phase's diff check lists them.
3. The composer stays the shared `NativeChatComposer`. Chat mode sets `data-chat-look="conversation"` on the seat wrapper (`ChatThreadComposerSeat.tsx`) and on the hero composer (`ChatModeDraftHero.tsx`). The two seat class files gain Tailwind ancestor variants such as `in-data-[chat-look=conversation]:rounded-chat-reply`. Code mode never sets the attribute, so its computed classes are identical. Confirm the `in-*` variant against Tailwind 4.2 docs (Context7) before phase 5; if it falls short, add a `look` field to `NativeChatSurfaceProvider`'s value and read it in the same two files.
4. A unit test renders the seat card in Code mode's configuration and asserts the class list matches today's, so a stray change shows up in CI.

## 4. Component mapping

New files are under `src/renderer/src/components/chat-conversation/` unless a path is given. "Port" means adapt the Bots code to Muster's types, tokens, `translate()` and naming; "rewrite" means build the Muster version against the Bots behaviour; "reuse" means call the existing Muster code as is.

| Bots | Muster file | How |
| --- | --- | --- |
| `ChatView.tsx` layout (scroller, `chat-column`, dock, `GlassScrollFrame`, `GlassBar`) | `ChatConversationSurface.tsx` (new); `chat-mode/ChatThreadView.tsx` switches to it | Rewrite the layout. Reuse `use-chat-scroll-follow.ts`, `use-chat-turn-paging.ts`, `use-chat-engine-thread.ts`, `use-chat-active-turn.ts`, `chat-thread-context.ts` |
| `GlassBar` top fade, `ChatHeadPill`, `RenameTitle`, `ChatHeaderMenu` | `ChatConversationHeader.tsx` (new) | Port the fade bar and pill. Avatar = workspace colour and icon (`RepoIconGlyph`, as in `ChatWorkspaceAppearanceSection.tsx`). Menu items reuse `ChatThreadRow.tsx`'s handlers (rename, pin, archive). Model picker stays in the composer |
| `ChatEmptyState.tsx` | `ChatConversationEmpty.tsx` (new); `ChatModeDraftHero.tsx` uses its column constant | Port: 64px workspace avatar, workspace name, workspace brief or a default line |
| `MessagesList` and `Bubble` (`ChatView.tsx:321-823`) | `ChatConversationTurn.tsx` (new), one per engine turn | Rewrite against `ChatEngineTurn`, keeping per-turn subscription (`useChatEngineTurn`) |
| Bubble, user branch | `ChatUserBubble.tsx` (new) | Port shape and long-message collapse. Reuse `chat-user-message-parts.ts` for images |
| Bubble, bot branch; `ReplyBlocks.tsx`; `formatted-reply.ts` | `ChatReplyBubble.tsx`, `chat-reply-shape.ts` (new, pure) | Port `isFormattedReply`, `formattedReplyWidth`, `splitReplyBlocks` into `chat-reply-shape.ts` with tests |
| `ConversationalReply.tsx`; `shared/reply-style.ts` | `ChatConversationalReply.tsx` (new); `chat-reply-shape.ts`; `src/main/chat-mode/chat-thread-stream-system-prompt.ts` | Port the split and stagger. Reply style becomes a workspace setting; main appends the prompt line through the existing `--append-system-prompt-file` |
| `ChatMarkdown.tsx` (763 lines) | `ChatConversationMarkdown.tsx` (new) | Reuse `chat-markdown-pipeline.ts` and `chatMarkdownComponents`; override text size and the `table` element only |
| `RichTable.tsx`, `src/lib/table-data.ts`, `table-fit.ts` | `ChatRichTable.tsx`, `chat-table-data.ts` (new) | Port. `@tanstack/react-virtual` is already a dependency |
| `MessageActions.tsx` | `ChatMessageTray.tsx` (new) | Port the opacity-only hover tray: copy (reuse `NativeChatCopyButton`), reply, retry (latest turn), undo changes |
| `ReplyQuote.tsx`, `ComposerReplyStrip` | `ChatComposerQuoteStrip.tsx` (new); `ChatThreadComposerSeat.tsx` | Rewrite: the strip shows the quoted reply; send prepends it as a Markdown quote |
| `ActivityRun.tsx`, `describeRun` | `ChatActivityRun.tsx` (new) | Port the pill. Summary from Muster's `toolGroupSummary` (`chat-turn-layout.ts:116-138`) |
| `TurnNarrationRun.tsx`, `workedLabel` | `ChatTurnFoldPill.tsx` (new) | Port. Fold data from `turnFold` (`chat-turn-layout.ts:151`); outcome text from `ChatTurnChrome.tsx:15-47` |
| `ToolActivity.tsx` | `ChatToolCard.tsx` (new) | Port the card chrome. The body inside is Muster's tool renderer from `chat-tool-registry.ts` (diff, Bash, todo, question, generic), so Muster keeps its richer bodies |
| Thinking (no Bots equivalent) | `ChatThinkingPill.tsx` (new) | Rewrite as a pill that opens to the reasoning text; reuse `chat-reasoning-preview.ts` |
| `ErrorRow`, `FailedTurnRow`, `CancelledTurnRow`, `StatusActivityRow` | `ChatTurnNotice.tsx` (new) | Port the look; data from turn `status`, `errorMessage` and `notice` items |
| `TurnPresence.tsx`, `NowCard.tsx`, `live-activity.ts`, `now-steps.ts`, `WorkingIndicator.tsx` | `ChatTurnPresence.tsx`, `ChatNowCard.tsx`, `chat-turn-phrases.ts` (new) | Port presence and rotating phrase hook. Rewrite the phrase table for Claude Code tool names on top of `chat-tool-row-model.ts`. Timer from turn `startedAt`, step time from tool `elapsedSeconds` |
| `BotAvatar` (mascot) | `ChatWorkspaceAvatar.tsx` (new) | Rewrite: workspace colour and icon, a soft pulse while working, static under reduced motion. No mascot |
| `DaySeparator`, `needsStamp` | `ChatDaySeparator.tsx` (new) | Port: a day line between turns from different days |
| `JumpToLatestButton.tsx` | inside `ChatConversationSurface.tsx` | Port the look; behaviour stays `scroll.follow` |
| `.ui-pill` | `ChatPill.tsx` (new) | Rewrite as a component with existing tokens |
| `Composer.tsx` shell and dock (`:790-798`), `elevated.ts` | `native-chat/chat-seat-composer-classes.ts` (conversation variants); `ChatThreadComposerSeat.tsx` (dock backdrop) | Restyle only; behaviour stays `NativeChatComposer` |
| Send and Stop round button | `chat-seat-composer-classes.ts` | Restyle `NativeChatSeatSendButton` through the variants: 32px circle, `bg-chat-accent` |
| `QueuedComposerMessages` | `NativeChatQueueStrip` via `chat-seat-composer-classes.ts` | Restyle; steer and cancel already exist |
| `PendingApprovalPanel` docked above the composer | `native-chat/chat-seat-takeover-classes.ts` | Restyle the takeover cards as a Bots panel (`rounded-chat-bubble`, hairline, no lift). Keep takeover behaviour, precedence and keys |
| `ComposerPlusMenu`, `ApprovalModeSelector` | `ChatComposerPlusMenu.tsx` (new), placed through the seat's existing slot | Port a + menu with attach and permission mode. Modes map to `ChatEnginePermissionMode` (`default`, `acceptEdits`, `plan`, `bypassPermissions`) and apply live through `setPermissionMode` (`chat-engine-control-actions.ts:34`, `:82-83`). "Approve for me" (Bots decision model) is dropped |
| `Sidebar.tsx` thread list, `SidebarThreadRow.tsx` | `chat-mode/ChatModeSidebar.tsx`, `ChatSidebarThreadSections.tsx`, `ChatThreadRow.tsx` | Restyle in place (Chat-only files): panel fill, 32px rows, `bg-secondary` current row, unread in `font-semibold`, tertiary byline, spinner while working. Bots folders inside a bot are not ported; workspaces already group threads |
| `TranscriptAnnouncer.tsx` | reuse `TurnOutcomeAnnouncement` (`ChatTurnChrome.tsx:49`) | No change |

Size rule: `pnpm lint` enforces 400 lines per `.tsx` and 300 per `.ts`. `ChatView.tsx` (1,313), `Composer.tsx` (1,020), `ChatMarkdown.tsx` (763) and `Sidebar.tsx` (1,927) must not be copied whole; the mapping above already splits them.

Attribution: each ported file carries a one-line header naming the source file in the muster-bots fork and Apache-2.0. The upstream project name and the mascot appear only in the third-party notices file, which the Bots plan phase 0 adds (`muster-ui` has only `LICENSE` today). Every phase runs `rg -i 'maus|openmaus|ogb|omb-' src/renderer/src/components/chat-conversation src/renderer/src/components/chat-mode` and expects no hits.

## 5. Token mapping

### Colours: Bots variable to Muster token

The right-hand column is what the Bots tab already uses through `muster-host-theme.ts:19-56`, except where noted. The Chat-mode port uses the Muster token directly.

| Bots | Muster | Note |
| --- | --- | --- |
| `--color-app` | `--background` (`bg-background`) | |
| `--color-panel` | `--sidebar` | Sidebar, pill fill |
| `--color-raised` | `--secondary` | Current sidebar row, chips |
| `--color-raised-hover` | `--accent` | STYLEGUIDE's hover row fill; the guest mixes 6% ink into `--secondary` instead |
| `--color-composer` | `--chat-raised` | Guest uses `--card`; `--chat-raised` is Muster's composer fill and lifts in dark |
| `--color-composer-ring` | `shadow-chat-hairline` | Bots draws a 0.5px ring at ink/10, the same idea as `--chat-hairline` |
| `--shadow-float` | `shadow-chat-soft` | No fourth elevation tier |
| `--color-card` (assistant bubble) | `--chat-reply` (new) | Fixes white-on-white in light mode |
| `--color-inset` | `--chat-code` | Tool input and output blocks |
| `--color-control` | `--secondary` | |
| `--color-hairline` | `--chat-line-2` | Bots draws borders at hairline/40 |
| `--color-menu` | `--popover` | |
| `--color-ink` | `--foreground` | |
| `--color-ink-secondary` | `--chat-ink-secondary` | |
| `--color-ink-tertiary` | `--chat-ink-tertiary` | Both meet 4.5:1 on their pages |
| `--color-accent`, `--color-accent-text` | `--chat-accent` | |
| `--color-focus` | `ring-chat-accent` | STYLEGUIDE: chat focus is a 2px accent ring |
| `--color-bubble-user`, `--color-bubble-user-ink` | `--chat-bubble`, `--foreground` | |
| `--color-success` | `--status-success` | |
| `--color-danger` | `--destructive` | |
| `--color-warning` | `--status-attention`; `--chat-warn-*` in approval panels | |
| `--font-sans` | `--app-font-family` (Geist) | Same family |

### New chat-scoped tokens

Added to `main.css` beside the existing chat tokens (`:root` at lines 284-318, `.dark` from line 411, `@theme inline` at lines 149-175), and documented in a new "Chat mode conversation look" subsection of STYLEGUIDE's "Chat surface". Used only in `chat-conversation/` and the conversation variants.

| Token | Value | Tailwind | Use |
| --- | --- | --- | --- |
| `--chat-column-max` | `60rem` | `max-w-(--chat-column-max)` | Transcript, header and composer column (Bots `--chat-column-max`) |
| `--chat-reply-max` | `min(35rem, 80%)` | `max-w-(--chat-reply-max)` | User bubble and reply card (Bots `--chat-bubble-max` and `--chat-bubble-pct`) |
| `--chat-prose-max` | `44rem` | `max-w-(--chat-prose-max)` | Document-shaped replies |
| `--chat-card-max` | `88%` | `max-w-(--chat-card-max)` | Table cards in a reply |
| `--chat-reply` | light `var(--secondary)`, dark `var(--card)` | `bg-chat-reply` | Assistant reply card |
| `--radius-chat-reply` | `16px` | `rounded-chat-reply` | User bubble, reply card, composer card, tool card. Muster's `rounded-2xl` is 18px (`main.css:180`), so it needs its own token |
| `--text-chat` | `15px`, line height `1.75` | `text-chat` | Chat-mode message text (Bots `.chat-text` and `.chat-md`) |

STYLEGUIDE edits that go with them:

- The chat surface section says Chat mode wears the conversation look and Code mode keeps the document look, and which tokens belong to which.
- Typography allows 15px in Chat-mode messages only.
- The "assistant gets bare prose" rule becomes: in Chat mode a chat-line reply gets a card; a document-shaped reply stays prose.
- The weight cap of 500 stays, with markdown headings and `strong` at 600 as today.
- Pills: one `ChatPill` component; no new pill classes.

Existing tokens the conversation look keeps: `--chat-bubble`, the ink levels, `--chat-accent`, `--chat-raised`, `--chat-code`, `--chat-hover`, `--chat-line-*`, `--chat-warn-*`, `--chat-hairline`, `--radius-chat-bubble` (approval panel and table card, which Bots draws at 20px), `--ease-chat`, `.chat-shimmer`.

## 6. Phases

Branch: `feature/chat-conversation-look` off current `muster` (fast-forward `muster` first; worktree agents start stale). Each phase is one reviewable commit series.

Every phase runs these checks before review:

1. `pnpm typecheck`
2. `pnpm exec oxlint` on changed paths, then `pnpm lint` at the end of the phase (max-lines ratchet, styled scrollbars, locale catalog and coverage)
3. `pnpm exec oxfmt --check` on changed files (oxfmt only; never prettier)
4. `pnpm exec vitest run --config config/vitest.config.ts src/renderer/src/components/chat-conversation src/renderer/src/components/chat-mode src/renderer/src/components/chat-thread src/renderer/src/components/native-chat src/main/chat-mode` (targeted; the full suite has known hangs)
5. Code-mode guard: `git diff --stat muster -- src/renderer/src/components/chat-thread src/renderer/src/components/native-chat` lists only the files the phase names, and a Code mode agent chat in `pnpm dev` looks the same as before (light and dark)
6. Trademark grep from section 4
7. Live check in `pnpm dev`, light and dark, as listed per phase. Say which build ran and whether caches were cleared

### Phase 0: groundwork (0.5 day)

1. Tokens and STYLEGUIDE subsection from section 5.
2. `chat-conversation/` folder with `ChatPill.tsx` and `chat-reply-shape.ts` (ported pure functions) plus tests: formatted vs chat-line detection, table splitting, conversational split never breaking a code fence.
3. Notices entry for ported code, coordinated with the Bots plan's notices work.

Live check: none beyond the build; nothing renders yet.

### Phase 1: surface, header and empty state (1 day)

1. `ChatConversationSurface.tsx`: 60rem column with `px-5`, 12px turn gap, top fade header, composer dock with page colour behind its lower half, jump-to-latest button, stable scrollbar gutter.
2. `ChatConversationHeader.tsx`, `ChatWorkspaceAvatar.tsx`, `ChatConversationEmpty.tsx`.
3. `ChatThreadView.tsx` and `ChatModeDraftHero.tsx` switch to the new surface and column. Turns still render through `ChatTurnView` from `chat-thread/` for now.
4. Turn navigator rail is not mounted in Chat mode.

Live check: open an empty thread, a long thread and a thread mid-turn; header title renames; scrolling up releases follow and the button returns to the bottom; the hero and the docked composer share one width.

### Phase 2: messages (1.5 days)

1. `ChatConversationTurn.tsx` replaces `ChatTurnView` in Chat mode.
2. `ChatUserBubble.tsx` with collapse; `ChatReplyBubble.tsx` with card, prose and table shapes; `ChatConversationMarkdown.tsx`; `ChatRichTable.tsx`; `ChatDaySeparator.tsx`.
3. `ChatMessageTray.tsx` with copy and retry (latest turn only). Reply and undo come in later phases.
4. Streaming text renders inside the reply card from the first token, so nothing swaps components when the turn settles.

Tests: reply shape selection per item; table data sort and CSV; user collapse thresholds.
Live check: a one-line answer, a long Markdown answer, an answer with a 40-row table (sort, copy, expand), a message with images, a multi-day thread.

### Phase 3: process display (1.5 days)

1. `ChatActivityRun.tsx`, `ChatToolCard.tsx` (Muster tool bodies inside), `ChatTurnFoldPill.tsx`, `ChatThinkingPill.tsx`, subagent rows as a run, `ChatTurnNotice.tsx` for error, stopped and notice states.
2. Running tools show a live card; finished consecutive tools fold into one pill; a finished turn folds behind "Worked for Ns" and starts open when it failed or was stopped, as today.

Tests: grouping of items into runs and folds (reuse `chatItemBlocks` and `turnFold` cases), pill labels for mixed tool kinds.
Live check: a turn with reads, an edit with a diff, a failing Bash command, a subagent, a stopped turn, an error turn with Try again.

### Phase 4: turn presence (1 day)

1. `ChatTurnPresence.tsx` with the rotating phrase hook, timer and shimmer; `ChatNowCard.tsx` with the last four steps; `chat-turn-phrases.ts` phrase table for Claude Code tools (Read, Edit, Write, Bash, Grep, Glob, WebFetch, WebSearch, Task, TodoWrite, MCP by prefix).
2. Reduced motion: no shimmer, no phrase fade, static avatar.
3. Presence hides as the first answer text arrives, as in Bots.

Tests: phrase selection per tool and input; rotation with fake timers and a timer-leak check; presence visibility across running, answering and settled.
Live check: a long Bash command (phrase and timer), a run of reads (phrases rotate), opening and closing the steps card with mouse and keyboard, Esc closes it.

### Phase 5: composer (2 days)

1. Conversation variants in `chat-seat-composer-classes.ts` and `chat-seat-takeover-classes.ts`; `data-chat-look="conversation"` on the Chat seat and hero.
2. Card, dock, round Send and Stop, queued chips and docked approval, question and plan panels restyled.
3. `ChatComposerPlusMenu.tsx`: attach and permission mode (live `setPermissionMode`).
4. `ChatComposerQuoteStrip.tsx` and the tray's reply action.
5. Guard test from section 3, item 4.

Tests: guard test; quote serialisation; permission mode menu dispatches the control action; existing `NativeChatSeat*` tests pass unchanged.
Live check: queue two messages while a turn runs and steer one; approve and reject a Bash call with Enter and Esc; answer an AskUserQuestion; switch to plan mode mid-thread; quote a reply and send; then open Code mode and confirm its composer is unchanged.

### Phase 6: sidebar (1 day)

1. Restyle `ChatModeSidebar.tsx`, `ChatSidebarThreadSections.tsx` and `ChatThreadRow.tsx` to the Bots thread list: panel fill, row height and radius, current and hover fills, unread weight, byline, working spinner, attention marker.
2. No behaviour change: drag order, pin, archive, search and the context menu keep their tests.

Live check: drag to reorder, pin, archive, unread after a background completion, search, a workspace with 30 threads.

### Phase 7: conversation extras (1.5 days)

1. Reply style per workspace: a setting in the workspace dialog ("Reply style": Default or Conversational), stored on `ChatWorkspace`; main appends the conversational line through `chat-thread-stream-system-prompt.ts`; `ChatConversationalReply.tsx` splits and staggers parts of replies that arrive while the thread is open.
2. Undo changes: a tray action on a finished turn that calls the engine's `rewind` (`chat-engine-control-actions.ts:56`, `rewind_files` at `:99-101`) with the turn's user `uuid`, behind a confirm dialog because it rewrites files.
3. Unread divider: a "New" line above the first turn that finished after the thread's `lastVisitedAt`.

Tests: workspace state parse with the new field (`chat-workspace-state-parse.ts`); system prompt args with and without the style; undo disabled when the user message has no `uuid`.
Live check: switch a workspace to Conversational and see split bubbles; undo an edit turn and confirm the file is restored; leave a thread, let a turn finish, return and see the divider.

### Phase 8: e2e and sign-off (1 day)

1. Extend `tests/e2e/chat-engine-thread.spec.ts` on `tests/e2e/fixtures/fake-claude-stream.cjs`: send, stream into the reply card, tool pill fold, approval panel, stop, reload mid-turn with presence still shown.
2. STYLEGUIDE screenshots or notes for the conversation look; side-by-side with the Bots tab in light and dark.
3. Remove anything in `chat-mode/` that only fed `ChatThreadSurface` and is now unused.

Done when: the targeted suites and `pnpm lint` pass, Code mode's agent chat is unchanged, and the user signs off in the dev app.

## 7. What to drop from the DeepSeek Harness plan

The DSH plan's mechanics all stay: one log and one reducer in main, fold by id, snapshot then patches, rAF cadence, partial JSON, intent-based scroll follow, paging, approvals owned by main, the SSH host seam, Chat hidden on Windows. Code mode keeps the DSH look in full.

For Chat mode, these DSH visual decisions are replaced:

1. The `clamp(680px, 64%, 920px)` column, by a 60rem column with 20px gutters.
2. Bare assistant prose for every reply, by the chat-line card and document prose split.
3. The 13px, 24px-tall tertiary process rows and turn fold header, by pills and tool cards.
4. The 20px user bubble and 28px composer radius, by 16px.
5. The same-width composer takeover look, by a panel docked above the composer. The takeover behaviour, precedence and keys stay.
6. The one-line empty state ("What should we work on?"), by avatar, workspace name and brief.
7. The turn navigator rail, which Bots does not have. It stays in Code mode and is one line to remount if missed.
8. The 14/24 prose size, by 15px at 1.75 line height.

Kept as DSH had it: motion at 160ms or less on `ease-chat` (Bots' 180ms message rise and 220ms bubble-in are shortened to fit; the 480ms mascot-tied answer grow is dropped), opacity-only hover actions, `.chat-shimmer` for running state, fade masks at scroll edges.

## 8. Risks

1. **Code mode regression through shared files.** Mitigated by the separate folder, the attribute-scoped variants, the guard test and the per-phase diff check. The composer class files are the one real shared edit.
2. **Light-mode reply card contrast.** `--secondary` (`#f5f5f5`) on `#fff` is a soft edge. Check it against the Daylight intent (`#f0f0f0` on `#fcfcfc`) in phase 2; adjust the token, not the component.
3. **Copying too much.** The Bots components carry rooms, teammates, phone layout, Simple mode, voice and cloud branches. Port behaviour, not files; keep each file under the line caps.
4. **Trademark and licence.** Mascot animations, `maus` variables and `omb-`/`ogb` identifiers sit next to the code being ported. The grep runs every phase; attribution lives in the notices file.
5. **Phrase table drift.** Bots phrases are written for its own tool names. Muster's table covers Claude Code tools and MCP by prefix, with a generic fallback so an unknown tool still reads well.
6. **Timers.** Presence rotation, the elapsed timer and the "last output" ticker add timeouts and intervals. Every one cleans up on unmount; tests check for leaks.
7. **Undo rewrites files.** It goes behind a confirm dialog and is disabled when the CLI gave no `uuid`. SSH workspaces are out of scope for chat today, so it runs locally only.
8. **The Bots tab and Chat mode can drift.** Both draw from Muster tokens, so colours stay together; layout changes made later in the fork do not flow into Chat mode. The port records fork commit `c0b783245` as its source.
9. **i18n.** New strings go into all five locale files (`en`, `es`, `ja`, `ko`, `zh`) or the coverage gate fails.

## 9. Out of scope and later

- Simple mode's joined bubbles and phone dock.
- Edit and branch past messages (needs an engine branching design; the Bots server's `server/checkpoints.ts` is the reference).
- The run card that saves a command run as a skill (`VerifyCard.tsx`). It could write a Claude Code skill into the workspace later.
- Reactions, read-aloud, pinned message banner, find bar, citations, rooms, teammates, routines, computers.
- SSH and Windows for Chat mode (unchanged from the DSH plan).
- Code mode and mobile.

## 10. Points to confirm in review

1. Target look is Bots Advanced mode, the default inside Muster. If the user has been using Simple mode, phases 2 and 5 change shape.
2. The turn navigator rail leaves Chat mode.
3. Undo changes ships in phase 7, or waits for edit and branch.
