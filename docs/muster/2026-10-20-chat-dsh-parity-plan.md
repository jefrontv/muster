# Chat DSH parity: Code mode on the new surface, and a full polish pass

Branch: `feature/chat-refactor`. Follows `2026-10-19-chat-mode-refactor-plan.md`, which left Code mode's chat out of scope. This plan brings it in and raises both modes to DeepSeek Harness (DSH, `687f282e`, MIT) level for the composer, tool rows, diffs, question and approval cards, and prose.

Measured gap list (DSH values against ours, with file:line on both sides) came from a read of the DSH clone and is summarised per phase below.

## 1. Decisions

1. **Code mode keeps its data pipeline and swaps its view.** Code mode chat sits on a live terminal agent: transcript JSONL plus hooks in, PTY keystrokes out (`TerminalPane.tsx:2879-2925`, `use-native-chat-live-session.ts`, `native-chat-runtime-send.ts`). It serves Claude, OpenClaude, Codex and Grok, runs over SSH (`native-chat-runtime-owner.ts:12-24`), and each tab toggles terminal and chat on the same PTY (`TerminalPane.tsx:643-659`). The stream-json engine is Claude-only and local-only, so moving Code mode onto it would break all four. Instead an adapter maps Code mode's `NativeChatMessage` timeline into `ChatEngineTurn[]`, writes it into the existing `chat-engine-thread-store` under a `code:<paneKey>` thread id, and Code mode renders `ChatThreadSurface`. Same rows, folds, stacks, diffs and cards in both modes; every agent, SSH and the toggle keep working.
2. **Mobile stays as is.** It has its own `mobile/src/session/mobile-native-chat-*` and imports nothing from the renderer.
3. **Chat-scoped tokens, not app-wide.** New values go in `main.css` under the existing `--chat-*` family and in `STYLEGUIDE.md`: raised surface (dark `rgb(44,44,46)` for composer and takeover cards), code-block fill, hairline steps l1 to l4, the 160ms motion curve, lighter dark ambient shadow. Code mode's terminal, sidebars and other panels don't change.
4. **Send button colour.** Recommendation: DSH's blue fill (`#4176E6` light, `#7AAAFF` dark) as a chat accent token, also used for the caret, links and the running label. The alternative is keeping Muster's ink-black button. This is the one choice that changes the app's look most; flag it in review if you want ink.
5. **Markdown changes are chat-only.** `CommentMarkdown` also renders sidebar comments, so chat gets its own element variants instead of restyling the shared renderer.

## 2. Phases

Estimates assume one agent with tests and screenshots in light and dark after each phase.

### Phase A: foundations (half a day)

1. Tokens from decision 3 and 4, documented in `STYLEGUIDE.md`.
2. Shimmer rewrite: an overlaid higher-contrast copy of the label swept by a 105° mask, 1.5s with the sweep ending at 66% so each cycle pauses. Today ours dims the label and never pauses.
3. Shared 2px keyboard-only focus ring for chat controls.

### Phase B: composer (1 day)

1. Card 32px wider than the text column (16px each side), raised surface in dark, DSH padding model: 8 top, editor `4 8 0 14`, toolbar `2 8 6`, 12px between editor and toolbar. Editor min height 36 (52 in the hero), max 336.
2. Attach as a 28px filled circle. Model chip 28px tall, 13/20, secondary ink, caption-coloured effort, chevron rotating over 120ms. Toolbar gap 12 (8 when narrow).
3. Send and Stop: 34px circle in the chat accent, custom arrow and a 10x10 rounded stop square, disabled at 0.4, 100ms colour change.
4. Queue as a frosted tab tucked 3px under the card: 16px top radius, 36px rows, 28px round actions. Replaces the separate bordered box.
5. Back-to-bottom aligned to the column's right edge, 16px above the composer.

### Phase C: tool rows, stacks and diffs (1.5 days)

1. Rows: open rows show an up chevron at all times, closed rows show a down chevron on hover; no colour change when open. Caption-coloured 2x2 dot with 8px sides. Paths in the 13px sans summary font with a dotted underline.
2. Expanded bodies in a 16px-radius card on the code-block fill with a 0.5px hairline, 11/16 mono, sticky IN and OUT labels, sections scrolling on their own (150px each, terminal output 224px).
3. Groups: verb labels ("Read files", "Ran commands", live "Reading files"), live labels held at least 150ms, 24px fades at scroll edges, 8px under an open header. Step stacks (landed in `d9e4dd6ea0`) keep their 5-row cap.
4. Diffs: code card with a banner (file, language, wrap toggle, copy with a check for 1s), 11/19 mono, no wrap by default. Changed lines get coloured text, a 3px left marker and 8% (12% dark) tint. Long diffs show the first 8 and last 8 lines with a reversible fold in the middle. Line numbers stay, in a right-aligned tertiary gutter.

### Phase D: question, approval and plan review takeovers (1.5 days)

1. Question card: 20px radius, raised surface, height cap `min(60vh, 520px)` with header and footer fixed. Title 16/22/500 that wraps, minimise and close buttons. Options as 40px rounded rows with a 1px gap and a bordered selected state, 20px number badge, descriptions that wrap. Real 14px checkboxes for multi-select. "Other" as an auto-growing field (Shift+Enter for a new line). Footer with pager, error line, Skip and Next/Submit at 36px. The tab strip goes; the pager replaces it.
2. Approval as its own card replacing the composer: amber border, "Waiting" strip with a state dot, 15/24 headline, 13/20 mono command, right-aligned 36px actions. Enter allows and Esc rejects outside text fields.
3. Plan review card for ExitPlanMode: title, two-line description, Discuss and Approve. Today it goes through the generic approval.
4. Code mode drives the same cards from its hook-reported interactive prompts, answering through the PTY as it does now.

### Phase E: prose and turn chrome (1 day)

1. Chat markdown: 14/24 body, 16px block rhythm, headings 21/19/18 with 32px above, links in the accent with a dotted underline on hover, inline code pill with a hairline, tables with horizontal hairlines only and 10x16 cells, code blocks on the code-block fill with a sticky banner and a lowercase mono language label.
2. Reasoning body as compact markdown; while streaming, preview the latest finished paragraph with the fade on the trailing edge; sticky header when open.
3. User bubble: chat-tinted fill, width `min(70.2% of column, 82%)`, 6px to its actions. Hover actions 28px with 8px gaps.
4. Fold header: mono digits, "Stopped" and "Failed" variants, a polite live-region announcement, 16px around it. Running line at 12/22 in the accent shimmer.

### Phase F: Code mode cutover (2 days)

1. Adapter `native-chat-engine-turns.ts`: `NativeChatMessage[]` plus hook status into `ChatEngineTurn[]`, with tool names mapped per agent (Codex `apply_patch` and shell, Grok tools) into the tool registry's names. Unit tests per agent from recorded transcripts.
2. Feed the adapter output into `chat-engine-thread-store` keyed `code:<paneKey>`, with structural sharing so a streaming token re-renders one row.
3. Mount `ChatThreadSurface` in the `TerminalPane` chat portal, keeping `onSwitchToTerminal`, the session gate and the per-tab `viewMode`. Composer: `NativeChatComposer` with `seat: true` inside the surface's seat.
4. Remove Code mode's old row components once nothing imports them (`NativeChatMessageList`, `NativeChatMessageRow`, `NativeChatWorkRow`, `NativeChatWorkLog` and their tests).
5. E2E on the fake CLI: Code mode chat renders a Claude and a Codex transcript, toggles to terminal and back, answers a question card.

## 3. Done when

1. Chat mode and Code mode chat render the same rows, cards and composer, checked side by side in light and dark.
2. Every value in the gap list is matched or has a written reason in `STYLEGUIDE.md`.
3. Code mode works for Claude, OpenClaude, Codex and Grok, over SSH, with the terminal toggle.
4. The full test suite shows no new failures beyond the documented environmental ones.
5. You sign off in the dev app.

## 4. Out of scope

- The mobile app.
- Moving Code mode onto the stream-json engine (decision 1).
- DSH features with no Muster equivalent (branching, inspect pill, whale mark).
