# DSH vs Muster chat surface: visual gap list

Companion to `2026-10-20-chat-dsh-parity-plan.md`. DSH root: the read-only clone of `deepseek-ai/deepseek-harness` at `687f282e`, path `packages/client/` (written `<dsh>/` below). Ours: `src/renderer/src/`. Chat tokens added in phase A (`--chat-accent`, `--chat-raised`, `--chat-code`, `--chat-inline-code`, `--chat-hover`, `--chat-line-1..4`, `ease-chat`) cover the DSH surfaces named here.

## 0. Foundations

- Radius scale: xs 4, sm 8, md 12, lg 16, xl 20, panel 28 (`<dsh>/ui-theme/src/styles/base.css:18-23`).
- Motion: `cubic-bezier(0.4,0,0.2,1)`; hover colour 100ms; folds 160ms.
- Elevation: 0.5px stroke first. Panel `0 3px 8px rgba(0,0,0,.03), 0 0 16px rgba(0,0,0,.02)`; soft `0 4px 16px .03, 0 0 24px .03`; same in dark.
- Type: body 14/24; process tier 13; headings 21/30/700, 19/28/700, 18/26/700, h4 14/24/600; tables 13/22; code block 11/19; inline code 12/19 at 0.875em; tool-card code 11/16. Mono `'SF Mono','JetBrains Mono','Fira Code',Consolas`.
- Focus: 2px accent ring, keyboard only.

## 1. Composer

DSH (`<dsh>/ui-conversation/src/client/skeleton/InputBar.module.css`):
- Card: column, gap 12, padding-top 8, radius 28, raised fill, soft shadow, 14/24. Width = content width + 32 (16px wider than the text column each side; `ConversationRoot.module.css:388`). Text cap 336px.
- Editor: min 36 (52 in the empty-state hero), padding `4px 8px 0 14px`, accent caret, caption placeholder (one line, ellipsis). No focus ring on the card.
- Toolbar: padding `2px 8px 6px`, gap 12 (8 under 560px), wraps; model chip goes icon-only when cramped.
- Attach: 28px circle, filled (rgb(245,246,247) / rgb(53,54,56)), 14px plus in primary ink, disabled 0.5.
- Model chip (`<dsh>/ui-model-selection/src/client/ModelSelect.module.css:9-29`): h 28, padding `0 4px 0 8px`, radius 8, transparent, secondary ink, 13/20/400; effort text caption-coloured and truncates first; chevron caption-coloured, rotates 180° over 120ms; hover fill.
- Send/Stop (`InputBar.module.css:377-405`, `InputBar.tsx:491-513`): 34px circle, accent fill, hover swaps to accent-hover, white glyph, 100ms background transition, disabled 0.4. Custom 16px arrow path; stop is a 10x10 rx3 rounded square.
- Fade above composer: fixed 36px band, page colour.
- Queue (`<dsh>/ui-conversation/src/client/queue/QueueDock.module.css`): tab inset 8px each side, tucked 3px under the card, 16px top radius, square bottom, frosted (`blur(40px) saturate(150%)`), 0.5px line-1 hairline without bottom edge. Header 36px, `4px 12px`, count 13/24/500. Rows min 36, `4px 5px 4px 12px`, inset line-1 divider. Actions 28px round, tertiary, hover fill. List cap 180px.
- Back-to-bottom (`<dsh>/ui-chat/src/client/chat/ChatView.module.css:249-299`): 34px round, panel elevation with line-3 stroke, right-aligned on the column edge, 16px above the composer.

Ours: card `rounded-chat-composer bg-background p-2 shadow-chat-soft` (`native-chat/NativeChatComposerField.tsx:164-166`), same width as text column, textarea min 48 / max 256 `px-3 py-1`, toolbar gaps 2/4, attach 32px ghost (`NativeChatStashMenu.tsx:82-89`), model chip ghost xs 24px 12px (`NativeChatSessionOptionPickers.tsx:108-119`), send ink fill 0.5 disabled with lucide icons (`NativeChatComposerActions.tsx:196-218`), queue as a separate bordered `max-w-3xl` box with uppercase header (`NativeChatQueueStrip.tsx:181-202`), back-to-bottom centred (`chat-thread/ChatThreadSurface.tsx:36-38`).

## 2. Tool rows

DSH:
- Row (`<dsh>/ui-primitives/src/DisclosureRow.module.css`): 24px, tertiary, secondary on hover (100ms). 16px leading box, 14px glyph, 6px right margin. Closed: icon, crossfades to a down chevron on hover. Open: up chevron replaces the icon at all times. Title 13/24/400. Rows do not change colour when open.
- Dot (`<dsh>/ui-tool/src/client/tool/components/ToolRow.module.css:26-33`): 2x2, radius 1, margin `0 8px`, caption colour. Shimmers with the label.
- Summary 13/24 truncating; file path same sans font with 1px dotted underline offset 3px, click target ends at the text.
- Diff totals: mono 11px, margin-left 10, coloured only on hover or open.
- Error: summary shows first failure line in error colour; exit badge is a 4px red dot plus label; stopped uses warn colour.
- Expanded IN/OUT card (`ToolRow.module.css:181-247`): margin `4px 0 4px 4px`, 0.5px line-1 border, radius 16, code fill, 11/16 mono. Sections `12px 16px`, max 150px each, scroll independently, sticky caption "IN"/"OUT" labels, 0.5px line-2 divider, secondary text, error text in error colour. Terminal output max 224px; other bodies 260px.
- Group header (`<dsh>/ui-chat/src/client/chat/ChatGroupSeat.module.css`, `ChatGroupSeat.tsx:92-129`): 14px tertiary, secondary on hover; icon crossfades to chevron on hover, focus or open; 8px bottom padding when open; body cap `min(400px,50vh)`, stable gutter, 24px fade masks on the edge that can scroll; fold animates margin 160ms. Labels: live "Reading files", "Editing files", "Running commands"; settled "Read files", "Edited files", "Ran commands" (`ui-chat/src/client/locale.ts` from line 205). Live titles stay at least 150ms (`ChatGroupSeat.tsx:28`).
- Shimmer: covered by phase A.

Ours (`chat-thread/`): open rows rotate a right chevron only on hover and turn secondary (`ChatDisclosureRow.tsx:27-41`); dot `bg-current opacity-60` with 6px gap; object in 12px mono (`ChatToolRow.tsx:70-75`); bodies `rounded-md border font-mono text-xs leading-5` with `pre px-3 py-2` max-h-48/64 (`ChatBashBody.tsx`, `ChatGenericToolBody.tsx`); group says "N steps" with no edge fades (`ChatToolGroupRow.tsx:51-71`).

## 3. Diffs (Edit / Write / MultiEdit)

DSH:
- Card (`<dsh>/ui-primitives/src/CodeCard.module.css`): code fill, radius 16, 11/19 mono, 4px left indent inside the row.
- Banner: `10px 18px 8px 22px`, 11/18 sans, language in tertiary mono; 24px wrap and copy buttons with 14px icons and hover fill; copy shows a check for 1000ms.
- Body (`<dsh>/ui-primitives/src/DiffBlock.module.css`): `6px 0 20px`, lines `0 22px`, `pre` by default, wrap toggle switches to `pre-wrap`.
- Deleted: `- ` prefix, text rgb(236,19,19) / rgb(242,90,90), background red 8% / 12%, inset 3px left marker in the same red. Added: `+ `, text rgb(34,197,94), green 8% / 12%, 3px marker. Context in secondary ink. Path line secondary 500. Gap `⋯` tertiary.
- Truncation (`DiffBlock.tsx:12, 189-217`): 16 lines, first 8 and last 8, fold button in the middle (tertiary, secondary on hover), reversible.
- Line numbers (from the full review view, `<dsh>/ui-deliverables/src/client/FileDiff.module.css`): 3.5em right-aligned tertiary gutters.

Ours (`chat-thread/ChatDiffBody.tsx`, `chat-tool-diff-model.ts:10, 67-73`): bordered `rounded-md` 12/20, no banner/copy/wrap, always wraps, foreground text with 10% background tint and 28% word highlights, first 9 lines only, cannot re-collapse. Keep our line numbers and word highlights.

## 4. Question takeover

DSH (`<dsh>/ui-user-questions/src/client/QuestionComposer.module.css`, `QuestionComposer.tsx`):
- Replaces the composer at content width. Card radius 20, raised fill, panel elevation, `max-height min(60vh,520px)`, 10px bottom padding, minimisable to its header.
- Header `20px 16px 0 24px`; eyebrow 11/16 tertiary with 5px below; title 16/22/500, wraps; 24px round minimise and close buttons, tertiary to primary with hover fill.
- Options: list `4px 12px`, gap 1. Rows min 40, `8px 12px 8px 8px`, 1px transparent border, radius 12; hover or selected = hover fill, selected adds line-2 border; 120ms. Number badge 20x20 radius 4, overlay fill, secondary 12/18/500, aligned to first line. Multi-select: 14x14 checkbox radius 4, 0.5px line-4 border, checked = primary ink fill with check in background colour. Label 14/24/500; description 14/24 tertiary, wraps.
- "Other": same row shape, selected look when focused or drafted, pencil icon, auto-growing textarea capped at 6 lines (144px), accent caret, Shift+Enter newline, Enter continues. Option-less questions get a 64px min field, 0.5px line-4 border, radius 16, accent border on focus.
- Footer `margin-top 12, padding 0 10 0 18`: pager on the left (24px chevrons, "1 / 3" 14/24/500), 11/16 error line, Skip (outline) and Next/Submit (primary). Buttons 36px, radius 12, 14/22, outline border 0.5px line-3.

Ours (`native-chat/NativeChatQuestionCard.tsx`): tab strip above card, header 14px semibold truncated, dividers between rows, 24px radius-6 badges, 12px truncated descriptions, single-line Other input with the action button inside it, "1/3" below the card.

## 5. Approval and plan review

DSH approval (`<dsh>/ui-approval/src/client/ApprovalPanel.module.css`, `ApprovalPanel.tsx:46-83`): replaces the composer. 1px warn border rgb(247,173,49), radius 20, raised fill, shadow `0 4px 12px .02, 0 2px 8px .04`. Strip `10px 16px`, warn tint (rgb(254,245,231) / rgb(39,36,31)), warn text 13/18, state dot plus "Waiting…". Body `12px 16px 0`, gap 6, max 336; headline 15/24/500; command mono 13/20 tertiary, break-all. Actions right, gap 8, `14px 16px`; Reject outline turning red on hover; "Allow once" primary. Enter allows, Esc rejects, unless focus is in a text field, IME composing or a modifier is held.

DSH plan review (`<dsh>/ui-user-questions/src/client/PlanReviewPanel.module.css`, `PlanReviewPanel.tsx:62-85`): same frame, radius 20, panel elevation with line-2 stroke; warn strip `12px 16px` 14/20; summary `14px 16px 12px`, title 15/22/500 one line, description 14/24 secondary clamped to 2 lines; footer `8px 16px 12px` space-between: error line, "Discuss" (outline, 14px edit icon) and "Approve" (primary).

Ours: approval inside the composer card above a disabled textarea (`NativeChatComposerField.tsx:169, 251`; `NativeChatApprovalPanel.tsx`), 32px radius-6 buttons, no plan review card (ExitPlanMode goes through the generic approval).

## 6. Prose and turn chrome

- Reasoning (`<dsh>/ui-chat/src/client/chat/ReasoningRow.*`): body is compact markdown 13/20 tertiary, indented 22, `4px 0`; streaming preview shows the first line of the latest completed paragraph with a 48px fade on the trailing edge; header sticky when open. Ours: plain pre-wrap text, first line, fade on the left (`chat-thread/ChatItemRows.tsx:44-86`).
- Fold header (`<dsh>/ui-chat/src/client/chat/TurnProcessNodeView.*`): h 33, `0 0 8px`, 0.5px line-2 border, 14px tertiary to secondary; "Completed in 12s" with mono tabular digits; "Failed" / "Stopped" / "Completed" fallbacks; 14px chevron rotating 180° over 100ms; polite live region; 16px around it. Ours: `ChatTurnView.tsx:116-140`, "Worked for", sans digits, `border-border`, 12px around.
- Running status (`ChatView.module.css:142-219`): 12/22, accent-tinted text with matching shimmer, 0.5px divider (`8px 0 10px`) only when the last row is output. Ours: 13/22 tertiary grey.
- User bubble (`<dsh>/ui-chat/src/client/chat/MessageItem.module.css:3-40`): max `min(content width x 0.702, 82%)`, rgb(237,243,254) light / rgb(44,44,46) dark, radius 20, `10px 16px`, 14/22, actions 6px below. Ours: 70%, #f2f2f3 / #222224, 4px gap.
- Hover actions (`MessageIconActions.module.css`): row 28, gap 8, buttons 28px radius 8 with 6px padding, tertiary to secondary with hover fill, 15px glyphs (17px on the assistant row), 80ms fade on hover devices; assistant actions 16px below the reply, -6px left. Ours: gap 4, 75ms.
- Markdown (`<dsh>/ui-primitives/src/markdown/MarkdownText.module.css`, `CodeBlock.module.css`): 14/24, 16px block rhythm, paragraphs `16px 0`, h1-h3 `32px 0 16px`; links accent at 500, no underline at rest, dotted underline offset 3 on hover; lists `16px 0`, padding-left 18, 6px between items, secondary markers; hr 0.5px line-2 `32px 0`; blockquote 2px caption border, 14px indent; inline code 0.875em, inline-code fill, 0.5px line-1 border, radius 8, `0 5px`; tables without outer frame, cells `10px 16px`, head 13/22/500 with 0.5px line-3 bottom, body 13/22 with 0.5px line-2 bottom, no outer padding on first/last column, 4+ columns break out to transcript width; code block code fill, radius 16, `16px 0`, sticky banner `9px 14px` 11/18 with lowercase mono language, `pre` 16px padding 11/19, wraps by default, no height cap. Ours (`components/sidebar/comment-markdown-element-renderers.tsx:195-296`, `comment-markdown-code-block.tsx:91-135`, `chat-thread/ChatMarkdown.tsx`): `my-2`, headings 18/16/15 semibold, solid-underlined ink links, bordered table grid, `bg-accent` code with hover-only 20px actions and uppercase 10px language, max-h-80.
- Flow: 6px between process rows, 12px around the reply, 16px around the fold header.
