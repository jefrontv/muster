# DSH chat UI: visual design system and layout

Source: DeepSeek Harness (DSH) clone at `scratchpad/ref/deepseek-harness`. Every path below is relative to `packages/client/` unless it starts with `docs/` or `.agents/`. Line numbers are from the cloned revision. I only read the code. Nothing was built or run.

Stack facts that shape everything else:

- The styling is CSS Modules plus `clsx`. There is no Tailwind and no third-party component kit. Primitives live in `ui-primitives/src/`.
- Tokens are CSS custom properties. The prefixes are:
  - `--dsw-static-*`: raw palette
  - `--dsw-alias-*`: semantic roles
  - `--dsw-specific-*`: per-component roles
  - `--dsw-font-*`: font shorthands
  - `--dsw-radius-*`
  - `--dsw-elevation-*`
- Light tokens are set on `body`. Dark overrides live under `body[data-ds-dark-theme]`, and macOS overrides under `html[data-platform='darwin']`.
- `docs/web-styling.md` forbids literal colors in feature CSS: tokens only. `packages/client/AGENTS.md` points every agent at that doc.
- `BRAND_GUIDELINES.md` covers naming only (call it "DSH" and keep the trademark out of project names). It says nothing about visuals.

---

## 1. Tokens

### 1.1 Type stacks, easing, radii (`ui-theme/src/styles/base.css`)

| Token | Value | Line |
|---|---|---|
| text font | `-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', ..., Arial, sans-serif` | L7 |
| brand font | Montserrat (logo wordmark only) | L8-9 |
| code font | `'SF Mono', 'JetBrains Mono', 'Fira Code', Consolas, 'Liberation Mono', Menlo, Courier` | L11 |
| `--ds-ease-in-out` | `cubic-bezier(0.4, 0, 0.2, 1)` | ~L13 |
| durations | default 0.2s, fast 0.1s, slow 0.3s | ~L14-16 |
| `--dsw-radius-xs` | 4px | L18 |
| `--dsw-radius-sm` | 8px | L19 |
| `--dsw-radius-md` | 12px | L20 |
| `--dsw-radius-lg` | 16px | L21 |
| `--dsw-radius-xl` | 20px | L22 |
| `--dsw-radius-panel` | 28px | L23 |

#### Radius rules (`docs/ui-radius.md`)

| Radius | Used for |
|---|---|
| xs 4 | small details under 20px tall (number badges, tiny tags) |
| sm 8 | controls 20-28px tall (icon buttons, selects, tooltip) |
| md 12 | controls 32-40px (menu items, sidebar rows, New Session button) |
| lg 16 | large controls and grouped content: code blocks, diffs, preview cards (L43), menus |
| xl 20 | cards and message bubbles (user bubble, approval card, question card) |
| panel 28 | composer, dialogs, panels |

- Nested-radius rule (L71): a standard menu is R16 outside with 4px padding and R12 items. A compact menu is R12 outside with R8 items. The inner radius equals the outer radius minus the padding, rounded to the scale.
- `ui-theme/src/styles/corner-shape.css`: `* { corner-shape: superellipse(1.5) }` inside `@supports`. Full-round shapes (pills, circles) reset to `corner-shape: round` (`docs/web-styling.md` L24). This is a big reason the corners look soft rather than geometric.

### 1.2 Static palette (`ui-theme/src/styles/design-platform.css` L5-82)

The neutral "bluish" ramp has a faint blue cast, so grays never look muddy.

| Step | RGB |
|---|---|
| 00 | `#fff` |
| 50 | `rgb(249,250,251)` |
| 60 | `rgb(245,246,247)` |
| 75 | `rgb(241,243,245)` |
| 100 | `rgb(235,238,242)` |
| 150 | `rgb(233,236,242)` |
| 200 | `rgb(225,229,238)` |
| 300 | `rgb(207,211,214)` |
| 400 | `rgb(173,178,184)` |
| 500 | `rgb(151,157,166)` |
| 600 | `rgb(129,133,140)` |
| 700 | `rgb(97,102,107)` |
| 750 | `rgb(67,69,74)` |
| 800 | `rgb(53,54,56)` |
| 850 | `rgb(44,44,46)` |
| 875 | `rgb(35,35,36)` |
| 900 | `rgb(27,27,28)` |
| 950 | `rgb(21,21,23)` |
| 1000 | `rgb(15,17,21)` |

| Brand blue ("deepseek") | RGB |
|---|---|
| 50 | `rgb(237,243,254)` |
| 100 | `rgb(228,237,253)` |
| 200 | `rgb(211,226,255)` |
| 400 | `rgb(122,170,255)` |
| 450 | `rgb(86,134,254)` |
| 500 | `rgb(65,118,230)` |

There are also green, red and amber ramps. The ones in use are green-500 (success), red-600 light / red-400 dark (error) and amber-500 (warn).

### 1.3 Semantic aliases, light vs dark (`design-platform.css` light L166-282, dark L284-398)

| Role | Light | Dark |
|---|---|---|
| `bg-base` (page) | `#fff` | bluish-950 |
| `bg-layer-1` | `#fff` | bluish-875 |
| `bg-layer-2` | `#fff` | bluish-850 |
| `bg-layer-3` | `#fff` | bluish-800 |
| `border-l1` | `rgba(0,0,0,.04)` | `rgba(255,255,255,.06)` |
| `border-l2` | `rgba(0,0,0,.10)` | `rgba(255,255,255,.12)` |
| `border-l3` | `rgba(0,0,0,.12)` | `rgba(255,255,255,.16)` |
| `border-l4` | `rgba(0,0,0,.16)` | `rgba(255,255,255,.20)` |
| `label-primary` | bluish-1000 | bluish-50 |
| `label-secondary` | bluish-700 | bluish-300 |
| `label-tertiary` | bluish-600 | bluish-400 |
| `label-caption` | bluish-400 | bluish-600 |
| `label-dimmed` | bluish-200 | bluish-750 |
| `interactive-bg-hover` | `rgba(38,49,72,.06)` | `rgba(255,255,255,.08)` |
| `interactive-bg-active` | `rgba(38,49,72,.10)` | `rgba(255,255,255,.14)` |
| `interactive-bg-hover-solid` | bluish-75 | bluish-800 |
| `interactive-bg-hover-danger` | `rgba(236,19,19,.05)` | (red tint) |
| `link` / `state-business-primary` | deepseek-500 | deepseek-400 |
| `state-business-tertiary` | deepseek-100 | (dark blue tint) |
| `button-info-fill` (send) | deepseek-500, hover deepseek-400 | deepseek-400 |
| markdown code-block bg | bluish-50 | bluish-900 |
| code-block banner bg | bluish-50 | bluish-850 |
| inline-code bg | neutral-50 `rgb(250,250,250)` | neutral-800 |
| `--dsw-specific-bubble` (user bubble) | deepseek-50 | bluish-850 |
| `input-major` (composer fill) | `#fff` | bluish-850 |
| sidebar fill | bluish-50 | bluish-900 |
| selector fill ("+" button) | bluish-60 | bluish-800 |
| menu surface fill | `rgba(248,249,250,.58)` | `rgba(67,69,74,.45)` |
| tooltip bg | bluish-850 | bluish-750 |
| toast bg | bluish-800 | (dark) |
| turn trigger bg | same as code-block bg | same |
| diff added | green-500 @ 8% | same mix |
| diff deleted | red-600 @ 8% | same mix |
| success / error / warn | green-500 / red-600 / amber-500 | green / red-400 / amber |

- macOS menu fill (`design-platform.css` L402-408) rises to .94 opacity, because vibrancy already blurs behind it.
- Light mode keeps every layer at `#fff` and separates them only with shadows and hairlines. Dark mode steps the layers up the ramp (950 page, 875/850/800 raised).
- The running-status color `label-deep-diving` is a blue mix defined in the chat CSS (see 4.4).

### 1.4 Shadows and elevation (`ui-theme/src/styles/gradient-shadow-text.css`)

| Token | Value |
|---|---|
| `shadow-lv1` | `0 2px 4px rgba(0,0,0,.05)` |
| `shadow-lv2` | `0 4px 12px rgba(0,0,0,.02), 0 2px 8px rgba(0,0,0,.04)` |
| `shadow-lv3` | `0 0 1px rgba(0,0,0,.2), 0 0 4px rgba(0,0,0,.02), 0 12px 32px rgba(0,0,0,.08)` |
| `--dsw-elevation-stroke` (L33) | `0 0 0 0.5px var(--dsw-elevation-stroke-color, var(--dsw-alias-border-l4))` |
| `--dsw-elevation-panel` | stroke + `0 3px 8px rgba(0,0,0,.03)` + `0 0 16px rgba(0,0,0,.02)` |
| `--dsw-elevation-prominent` | stroke + `0 3px 8px rgba(0,0,0,.04)` + `0 0 20px rgba(0,0,0,.05)` |
| `--dsw-elevation-soft` (L39) | stroke + `0 4px 16px rgba(0,0,0,.03)` + `0 0 24px rgba(0,0,0,.03)` |
| menu backdrop | `blur(40px) saturate(150%)` |

Rules (`docs/web-styling.md` L25 and L29):

- Elevated surfaces set `border: 0` and take one elevation token. The first shadow layer is a 0.5px spread ring, so the outline is drawn by the shadow and never moves the layout.
- Each surface can rebind `--dsw-elevation-stroke-color`. The composer uses `border-l2`; menus use `border-l1`.
- Every neutral border and separator is **0.5px**: rules, table borders, code-card borders, tree rails. On a 2x display that is one device pixel.
- Ambient shadow opacity never goes above 0.08. The shadows read as a soft lift with no hard drop.

### 1.5 Typography tokens (`gradient-shadow-text.css` L56-275)

UI scale (`--dsw-font-*` shorthands; each has a `-strong` variant at weight 500):

| Token | Weight size/line |
|---|---|
| xl | 600 24/32 |
| l | 500 20/28 |
| m-18 | 500 16/28 |
| base | 400 16/24 |
| s-14 | 400 14/22 |
| xs-13 | 400 13/20 |
| xxs-12 | 400 12/18 |
| xxxs-11 | 400 11/14 |

Markdown scale:

| Element | Weight size/line |
|---|---|
| h1 | 700 21/30 |
| h2 | 700 19/28 |
| h3 | 700 18/26 |
| h4 | 600 14/24 |
| body | 400 14/24 |
| strong | 600 |
| table cell | 400 13/22 |
| table head | 500 13/22 |
| small | 12/20 |
| inline code | mono 12/19 |
| code block | mono 11/19 (user "code size" setting, default 11) |
| code block small | mono 11/16 |

Weight discipline (`.agents/skills/dsh-client-ui-ux/SKILL.md`): feature CSS never goes above weight 500. The only 600/700 weights are markdown headings, strong text and the logo wordmark. 13px is the standard row size. Hierarchy comes from ink color, through the primary, secondary, tertiary and caption steps, not from weight.

User-adjustable content size:

- `--dsh-content-font-size` defaults to 14px, range 10-22.
- `--dsh-content-font-delta` is the difference from 14. Line heights and some icon sizes add it, as in `calc(24px + var(--dsh-content-font-delta))`.
- `--dsh-content-font-size-secondary` (default 13px) feeds every process row: tool rows, reasoning, group headers, pills.

### 1.6 Other global sheets

- `focus.css`: a 2px ring in `state-business-primary`. Rings are hidden while the user is clicking with a pointer and shown for keyboard use.
- `scrollbar.css`: a 5px WebKit bar with a pill thumb and a transparent track. The thumb is `border-l1` on base surfaces and `border-l2` on raised ones.
- `shiki.css` syntax palette:

| Token | Light | Dark |
|---|---|---|
| constant | `#1c7ed6` | `#4dabf7` |
| string | `#2f9e44` | `#69db7c` |
| comment | `#868e96` | `#adb5bd` |
| keyword | `#d6336c` | `#faa2c1` |
| parameter | `#e8590c` | `#ffa94d` |
| function | `#6741d9` | `#b197fc` |
| punctuation | `#495057` | `#ced4da` |

- Links (`docs/web-styling.md` L30): `--dsw-alias-link` at weight 500 with no underline at rest. On hover they get a dotted underline with a 3px offset.

---

## 2. Layout

### 2.1 App frame (`ui-layout/src/client/AppFrame.module.css`, `ui-layout/src/client/columns.ts`)

The frame is a three-track grid: `[sidebar | center | rightbar]`.

| Track | Values |
|---|---|
| sidebar | default 280, min 264, max 420, collapsed rail 56; auto-collapses below a 1024px viewport |
| center | min 400 |
| rightbar | min 300, default 45% of viewport, max 70% |

- Track widths animate over 0.3s ease-in-out, but only for an explicit toggle (`data-animating`). Window resizes and drag-resizes are instant, so nothing lags behind the pointer.
- Drag handles are invisible 8px hit strips on the track edges.
- The sidebar has a 0.5px `border-l3` right edge.
- macOS:
  - The frame is transparent so window vibrancy shows through.
  - The sidebar carries a faint blue wash gradient (L115-124).
  - The center column is opaque with a 0.5px left border.
  - The traffic-light seat sits at top 11px, left 88px. Top clearance is 48px.

### 2.2 Sidebar (`ui-sidebar/src/client/SidebarRoot.module.css`)

- Padding is 6px vertical and 12px horizontal. The top strip is 52px and the logo row 60px. The brand name is 18px, weight 600, letter-spacing .04em.
- Icon buttons are 28px R8 with a hover fill. On the collapsed rail they are 36px R12.
- New Session button (L396-480):
  - 38px tall, R12, 0.5px `border-l3`, elevated button fill.
  - On macOS the fill is `rgba(255,255,255,.55)` (hover .3). In dark mode it is .15 (hover .2).
  - The keyboard shortcut appears only on hover. As it slides in, the label gets a 16px right fade mask (L468), so the text fades out instead of being cut off.
- Panel rows: min height 36, R12, padding 7px 8px, 4px gap.
- Collapse runs in two stages: a 150ms fade, then a 150ms rail-in (`translateX(49px)`).
- `quietBars`: the scrollbar thumb stays transparent until the pointer enters the sidebar.

### 2.3 Conversation column (`ui-conversation/src/client/skeleton/ConversationRoot.module.css`)

- Header (L15-23): 76px tall with tabs, padding `10px 28px 0 20px`, and a 0.5px `border-l3` bottom rule.
  - Breadcrumbs are 14/20 tertiary with an R12 hover fill. The current crumb is weight 500 primary. The `/` separator uses the caption color.
  - Tabs (L193-238) sit 36px apart at 13/16, weight 500, tertiary. The active tab is business blue with a 2px bar at `bottom: -1px`, so it sits on top of the header rule.
- **Shared width axis** (L384-390):
  ```css
  --dsh-chat-content-width: var(--dsh-chat-user-width, clamp(680px, calc(<column> * 0.64), 920px));
  /* composer card max = content width + 32px; side clearance 16px; dock inset 8px */
  ```
  The transcript column, composer, approval card, question card and turn navigator all use this one variable. The user can also set an override width.
- Width resize handles (L259-318) are 10px strips placed 24px outside the column. On hover they show a 72px glow that follows the pointer vertically.
- Scroll body: `margin-right: 2px`, `scrollbar-gutter: stable`, track margin 2px. The column never shifts when a scrollbar appears.
- Composer seat (L430-453):
  - `position: sticky; bottom: 0; z-index: 7`.
  - A fixed **36px** fade band (transparent to `bg-base`) sits above the composer. The band height stays fixed as the composer grows, so text dissolves into the seat at a steady rate.
  - The composer text area caps at 336px (14 lines). The stack gap is 6px.
- Phases:
  - Hero phase (L507-518) centers the composer vertically with `padding-bottom: 32px`, at the same width as the docked composer.
  - Settling phase hides the seat with `visibility: hidden` while it moves, so you never see it jump.
- The ConversationRoot publishes `--dsh-conversation-viewport-height` and `--dsh-composer-height` on the scrollport. The turn navigator and the back-to-bottom button use both.

### 2.4 Transcript scroll (`ui-chat/src/client/chat/ChatView.module.css`)

- Scroll padding is 16px vertical and `side-clearance + 16px` horizontal. The column is `max-width: var(--dsh-chat-content-width); margin: 0 auto`.
- Flow gaps (L68-121):

| Between | Gap |
|---|---|
| process rows (tool, reasoning, group) | 6px |
| around an assistant response | 12px |
| after the turn header | 16px |
| turn tail items | 16px (`TurnTailNodeView.module.css`) |

- When a fold changes spacing, `margin-top` animates over 160ms `cubic-bezier(.4,0,.2,1)`. Gaps ease and never snap.
- Back-to-bottom button: a 34px circle with a floating fill and `elevation-panel`. It is sticky at `bottom: calc(var(--dsh-composer-height) + 16px)`, so it rides just above the composer whatever the composer's height.

---

## 3. Message rendering

### 3.1 User message (`ui-chat/src/client/chat/MessageItem.module.css`)

- The row is right-aligned. `.userStack` (L10) has `max-width: min(calc(var(--dsh-chat-content-width) * 0.702), 82%)`.
- `.bubble` (L22):
  - background `--dsw-specific-bubble`: pale blue in light mode, bluish-850 in dark
  - R20, padding `10px 16px`, 14/22, `white-space: pre-wrap`
  - no border and no shadow
  - a single line measures exactly 42px (22 + 2×10)
- Attachments render above the bubble (see 5.3).
- File card: 240×64, R16, 0.5px `border-l2`.

### 3.2 Message actions (`ui-chat/src/client/chat/MessageIconActions.module.css`)

- `.action` (L63): 28px, R8, tertiary ink, 15px glyph. Glyphs at the assistant tail are 17px (L84).
- Hover reveal (L42-59), inside `@media (hover: hover)` only:
  - Rows for older user messages, and rows marked `data-actions-reveal='hover'`, start at `opacity: 0`.
  - They fade to 1 over **80ms** on `:hover` or `:focus-within`.
  - The latest user message always shows its actions.
  - Touch devices always show everything.
- Disabled actions use `opacity: .4` (L97).
- The time label is 13px tertiary. At the assistant tail it is 1px smaller.

### 3.3 Assistant message (`ui-chat/src/client/chat/AssistantMarkdown.module.css`)

- Assistant text is **bare prose** on the page background, with no bubble and no avatar. It is 14/24 with a 16px block gap.
- `.actions` (L74) sit 16px below the text with `margin-left: -6px`. That puts the first icon's glyph on the text's left edge, not its button box.
- Wide tables (4+ columns) break out of the reading column to the transcript width. L27-35 compute this with `100cqw` (the ChatView scroll container is a size container):
  ```css
  --dsh-table-spare: max(0px, calc((100cqw - var(--dsh-chat-content-width)) / 2));
  --dsh-table-lead: calc(var(--dsh-table-spare) + min(var(--dsh-chat-content-width), 100cqw) - 100%);
  ```
- `.stopped` (L63) is the "Stopped" tag on interrupted replies: 11/18 in an R8 pill with a hover-fill background.

### 3.4 Markdown body (`ui-primitives/src/MarkdownText.module.css`)

| Element | Style |
|---|---|
| h1-h3 | margin `32px 0 16px` |
| h4 | margin `16px 0` |
| p | margin `16px 0` (first/last trimmed by the container) |
| ul/ol | padding-left 18, li gap 6, nested lists 4, markers in secondary ink |
| hr | 0.5px `border-l2`, 32px vertical margin |
| blockquote | 2px caption-color left border, 14px left padding |
| inline code | 0.875em mono, inline-code bg, 0.5px `border-l1`, R8, padding `0 5px` |
| th | padding `10px 16px`, 0.5px `border-l3` bottom, 13 weight 500 |
| td | padding `10px 16px`, 0.5px `border-l2` bottom, 13/22 |
| first/last cells | no outer horizontal padding, so tables line up with the text edge |
| column width | min 100, max `min(30vw, 320px)` |
| table scrollbar | hidden until hover |
| links | transparent border added as a hit pad, so the hover target is bigger than the glyphs |

- The compact variant (used for thinking text) is 13/20 tertiary.
- Streaming has no per-token fade. An incremental parser appends text, so new tokens simply appear and nothing flickers.

### 3.5 Code blocks (`ui-primitives/src/CodeBlock.module.css`)

- R16 with the code-block background and no border. Code blocks sit flat on the page, set apart only by the tinted fill.
- Banner (L24):
  - `position: sticky; z-index: 6`. The language label and copy button stay pinned while a long block scrolls past.
  - padding `9px 14px`, 11/18, mono info string on the left, copy button on the right
- `pre`: 16px padding, 11/19 code type. The bottom radii live on `pre` and the top radii on the banner, so the sticky banner keeps its rounded top.
- Margin is 16px, or 11px when the block is not the last child.
- CodeCard (preview cards): header padding `10px 18px 8px 22px`, body `6px 22px 20px`.

### 3.6 Diffs (`ui-primitives/src/DiffBlock.module.css`)

- Line padding is `0 22px`.
- Added and deleted lines get the 8% tint plus `box-shadow: inset 3px 0 0 <color>`, a gutter bar that takes no layout space.
- Lines carry `+ ` and `- ` prefixes.

### 3.7 Compaction and errors (`MessageItem.module.css` L53-160)

- The compaction row is 24px tall. `.compactionLeading` (L124) holds a context icon that swaps to a disclosure chevron on hover (L141-142).
- When expanded, the row becomes sticky (L87-108), so the header stays visible while you read the summary.
- The turn error row is a 10px state dot plus a weight-600 title in the error color.

---

## 4. Turn structure

### 4.1 Turn trigger and header

- `TurnTriggerNodeView.module.css`: the triggering prompt card used for automation and scheduled turns. R20, 0.5px `border-l1`, padding `12px 16px`, code-block background, 12px timestamp right-aligned.
- `TurnProcessNodeView.module.css` is the settled turn header:
  - 33px tall, `padding-bottom: 8px`, 0.5px `border-l2` bottom rule, tertiary ink, 14px
  - the label reads "Completed in 12s"
  - durations are mono with `font-variant-numeric: tabular-nums` (L52)
  - the chevron turns 180° over 100ms (L38)
- Once a turn settles, its process rows (reasoning, tools, groups) fold under this header. The answer stays visible below it, so a finished turn reads as one line of summary plus the answer.

### 4.2 Disclosure row primitive (`ui-primitives/src/DisclosureRow.module.css`)

Every process row is built on this primitive:

```
[16px leading box, 14px glyph] 6px [title 13/24] ...
height 24px, color tertiary -> secondary on hover (100ms)
```

- On hover, the idle icon fades out and a chevron fades in over the same spot (100ms crossfade). The row gains the expand affordance with no change in width.
- While the row is running, its title goes through `TextShimmer`.

### 4.3 Reasoning (`ui-chat/src/client/chat/ReasoningRow.module.css` and `.tsx`)

- The title is "Think", with a think icon.
- Collapsed: the title, a 2×2 dot separator, then a one-line summary of the thinking at 13/20. While it streams, the summary gets a 48px right fade mask, so new words arrive into a soft edge.
- Expanded: the body is indented 22px (16 box + 6 gap, so it lines up under the title) and the header goes sticky.

### 4.4 Tool rows (`ui-tool/src/client/tool/components/ToolRow.module.css`)

```
[16 leading] 6 [title 13/24] 8 [2x2 dot] 8 [summary, ellipsized]   height 24
```

- `.summary` (L35) ellipsizes. `.summarySuffix` (L50) keeps a trailing count such as `+3` outside the ellipsis, so the count stays visible.
- Diff stats (`+12 -3`) are mono at −2px. They stay tertiary at rest and only turn green and red on `:hover` or when expanded (L71-75). The row stays monochrome until you engage with it.
- File paths in summaries get a persistent dotted underline (L79).
- Error summaries use the error color. Stopped summaries use the warn label color.
- Inspect pill (L126-164): 11/16 with a 0.5px border. It starts at `opacity: 0` and appears on row hover or focus-visible.
- Expanded body:
  - margin `4px 0 4px 4px`
  - body scroll max 260px (L173); terminal output max 224px
  - IO card: R16, code-block bg, 0.5px `border-l1`, sticky "IN" and "OUT" caption labels, a 0.5px `border-l2` divider, max 150px per section
  - in-card scrollbar thumbs have a 2px transparent border, which makes them look thinner and inset
- `ToolCallTree.module.css`: sub-agent calls indent 22px, then add `padding-left: 8px` and a 0.5px `border-l2` left rail.
- `ExitCodeBadge.module.css`: a 4px error dot.
- `StateDot.module.css` (ui-primitives): a 6px solid dot inside a 10px slot. Colors: done green, warning amber, error red, idle neutral. The ongoing state is a spinner ring at 25% opacity with a solid arc, turning every 1.5s.

### 4.5 Grouping (`ui-chat/src/client/chat/ChatGroupSeat.module.css` and `.tsx`)

- Consecutive tool calls collapse into one group row with a summarised verb label. Settled examples: "Read files, Searched code". Live examples: "Reading files…". All copy is in `ui-chat/src/client/locale.ts` L2-60.
- The header's activity icon crossfades to a chevron on hover, the same way DisclosureRow does.
- Expanded body:
  - `max-height: min(400px, 50vh)` (L88), scrolling internally
  - 24px top and bottom fade masks (L102-110), each applied only when there is more to scroll in that direction
- Individual tool rows sit inside the group at the same 24px rhythm.

### 4.6 Running status, "Deep diving" (`ChatView.module.css` L142-219)

- The line sits at the bottom of the running turn: font size −2px, line height 22, color `label-deep-diving` (a blue mix), with a shimmer.
- Copy reads "Deep diving for {duration} ···". The duration uses tabular-nums, so the counter does not jitter.
- A 0.5px divider (8px above, 10px below) appears only when the previous row is output text. Below tool rows there is no rule.
- The whale is a 14px icon. Its shape is a `running-whale@2x.png` APNG (a 28×28 gray+alpha whale tail) used as a **mask** over `currentColor`, so the animation takes on the theme color. Under `prefers-reduced-motion` a static SVG tail path replaces it.
- TextShimmer (`ui-primitives/src/TextShimmer.module.css`):
  - a gradient mask at 105° in `label-shimmer`
  - `1.5s steps(48)` after a 0.3s delay, infinite
  - the 48 steps keep repaints cheap while still looking smooth
  - turned off under reduced motion

### 4.7 Turn navigator (`ui-chat/src/client/chat/TurnNavigator.module.css`)

- A minimap rail of ticks on the right edge of the transcript, one tick per turn.
- Placement:
  - `.slot` is sticky, has zero height and `z-index: 7` (above the code-banner z6) (L2-19)
  - `.frame` is vertically centered in the visible band, which is the viewport minus the composer height (L26-45)
  - `right: 12px; width: 28px`; max height `min(band - 64px, 420px)`
  - the inner scroller hides its scrollbar, uses `overscroll-behavior: contain`, and has 24px fade masks on whichever ends can still scroll (L50-78)
- `.mark` is a 10px hit row. `::before` draws the tick: a 20×2px R2 bar anchored to the right edge (L84-109).

| State | Tick |
|---|---|
| rest | `border-l4`, `scaleX(.6)` |
| unloaded turn | `scaleX(.4)`, opacity .6 |
| preview (hovered) | `scaleX(.9)`, tertiary |
| busy (running turn) | opacity pulse 1 → .35 → 1, 1s |
| active (in view) | `scaleX(1)`, primary ink |
| keyboard focus | `scaleX(1)`, brand blue, 1px outline inset -1px |

- Transitions are `transform` and `background-color` over 140ms. The bar scales from its right edge, so ticks grow toward the content.
- Preview card (L154-194): a hover card to the left of the rail, `width: min(300px, 100cqw - 120px)`, max height 100, padding `10px 12px`, R16, `bg-layer-1`, `elevation-panel`.
  - The first line is the prompt (13 strong, clamped to 1 line). Below it is the response (12 caption, clamped to 3 lines).
  - It enters with `dsh-turn-preview-enter`: 120ms ease-out, opacity 0 → 1 with `translateX(4px → 0)`. Moving between ticks glides `top` over 140ms `cubic-bezier(.2,.8,.2,1)` and the card is not rebuilt.
- The rail hides below a 900px container width (L207). All of its motion turns off under reduced motion.

### 4.8 Turn usage pills (`TurnUsagePanel.module.css`, `StatsPills.module.css`)

- The turn-tail icon row holds a data icon plus a token total, followed by a time pill.
- Trigger: `calc(28px + delta)` tall, padding `6px 8px`, R8, tertiary, `secondary-size - 1px` text, tabular-nums, 15px glyph. Hover gives the hover fill.
- Two adjacent pills use `margin-left: -6px` (L12-14). This cancels part of their padding so they read as one cluster while keeping 2px between their hover backgrounds.
- Below a 480px width the pills shrink to 28px icon circles and drop their labels. The dialogs keep the words.
- Clicking opens a stat dialog (`stat-dialog.module.css`) on the menu surface.
- The composer stat pills (`StatsPills.module.css`) are `padding: 1px 8px`, R8, tertiary, 14px glyph and tabular-nums, with secondary ink on hover. Only the button form gets hover states; static spans stay passive. The separator is `separator-primary` with 6px margins.

---

## 5. Composer

### 5.1 Card (`ui-conversation/src/client/skeleton/InputBar.module.css`)

- `.card` (L45-77):
  - R28 (`--dsw-radius-panel`, L61), `input-major` fill, `border: 0`
  - `--dsw-elevation-stroke-color: border-l2` with `--dsw-elevation-soft`
  - `padding-top: 8px; gap: 12px`, 14/24
- Draft (`.input`, L169):
  - padding `4px 8px 0 14px`, min height 36 (52 in the hero)
  - `caret-color` business blue
- Placeholder (`.placeholder`, L218): caption ink, single line, ellipsized.
  - docked: "Message or run a task, / commands, @ files or sessions"
  - hero: "Describe what you want to build, / commands, @ files or sessions"
- The scroll area (L128) has `margin-right: 4px` and a scrollbar track margin-top of 8px, so the thumb clears the R28 corner.
- With no workspace chosen (`.cardWorkspaceTrigger`, L82-93), the card gets an inset 1px dashed outline in `currentColor`. It turns blue on hover, and clicking the card opens the workspace picker.
- `.pending` (L151): a dot that pulses every 1s while a send is in flight.
- `.dock` (L13) sits under the card and holds the ContextMeter.

### 5.2 Toolbar (`InputBar.module.css` L256-405)

- `.row`: padding `2px 8px 6px`, gap 12 (8 below a 560px container width).
- Left (`.tools`, `.modes`):
  - `.add` (L319): a 28px circle (`border-radius: 999px`) with the selector fill. It opens the command menu.
  - `.select` (L344): mode and permission selects, 28px tall, R8, 13/20, weight 500, secondary ink, 12px chevron.
- Right (`.trailing`):
  - ModelSelect, then the primary button
  - `.primary` (L377): 34px circle in `button-info-fill` (blue), white arrow SVG, `transform: translateY(-2px)` for optical alignment with the text baseline, `opacity: .4` while the draft is empty (L403)
  - Stop is the same circle holding a rounded square (`<rect x=3 y=3 width=10 height=10 rx=3>`). Send and stop share position and size, so swapping them never shifts the toolbar.
  - `.retry` (L407): R8.
- `.activityExpanded` lets a live-activity strip take over the trailing area during a run.

### 5.3 Attachments

- Image thumbnails are 64px squares, R20, with a 0.5px border.
- The remove button is an 18px circle. It fades in on hover (0.2s) and is always visible on coarse pointers.
- File cards are 240×64 R16, matching the transcript file card.
- The rail scrolls horizontally with no visible scrollbar. Floating arrow buttons appear when it overflows.

### 5.4 Triggers: `/` commands and `@` mentions (MenuView)

- The menu is anchored at `bottom: calc(100% + 4px)` above the card, at the card's full width. Max height 400, padding 4.
- Items: 34px, R12, 13/20. Section titles: 11/16, weight 500, tertiary. Descriptions: 12px tertiary, right-aligned.
- A `Tab` keycap hint shows only on the active row.
- A 16px bottom fade mask appears when more items sit below.
- Scrollbar: a 6px rail, 2px visual thumb, 12px track margin (it clears the R16 corners).
- While results load, skeleton rows pulse over 2s.
- Inline references in the editor (`composer-editor.module.css`) are business blue text with a business-tertiary hover fill. ReferenceChip caps at 240px wide.

### 5.5 Model picker (ModelSelect)

- Trigger: 28px, 13/20, secondary, R8. The effort suffix ("high") is caption ink with `flex-shrink: 1000`, so it gives up its width before the model name does.
- The menu is portaled, 240-420px wide, with 34px R12 options and a 14px check mark on the selected one.

### 5.6 Context meter and queue

- ContextMeter trigger: 13px tabular-nums with a small SVG progress ring. Its panel uses the menu surface (R16, blur, `elevation-prominent`) with a 4px segmented bar.
- QueueDock (queued follow-up messages):
  - attached to the **top** of the card: R16 on the top corners, square bottom, tucked 3px under the card edge
  - uses the menu material
  - rows are 36px with an inset 1px `border-l1` separator
  - it reads as a tab growing out of the composer, not a separate panel

### 5.7 Approval takeover (`ui-approval/src/client/ApprovalPanel.module.css`)

- It registers into the `conversation.composer` slot and **replaces** the composer while approval is pending. It takes the same seat at the same width (max `--dsh-chat-content-width`).
- Card: R20, a real **1px** `warn-secondary` border (the only colored border in the system), `shadow-lv2`.
- Warning strip: `warn-tertiary` background, padding `10px 16px`, 13/18, with a StateDot.
- Headline 15, weight 500. The command is mono 13 tertiary.
- Action row padding `14px 16px`: Reject (outline button, danger hover) and Allow (primary ink button).
- Keyboard: Enter allows, Escape rejects.

### 5.8 Question takeover (`ui-user-questions/src/client/QuestionComposer.module.css`)

- It also takes over the composer seat. Plan review uses the same flow (`ui-user-questions/README.md` L42).
- Card: R20, `elevation-panel`, `max-height: min(60vh, 520px)`.
- Header padding `20px 16px 0 24px`. The eyebrow is 11/16; the title is 16/22, weight 500.
- Options:
  - 40px rows, R12, with a 1px transparent border that turns `border-l2` when selected, 120ms transitions
  - number badge 20px R4 on `bg-overlay`
  - 14px checkboxes with an ink fill when checked
  - a "Recommended" badge at 11px, weight 600
- Custom answer: an R16 block whose border turns blue on focus.
- The footer holds a pager (question n of m) and the actions.

### 5.9 Shared primitives

| Primitive | Spec |
|---|---|
| Menu | padding 4, `elevation-prominent` with `border-l1` stroke, items 34px R12 13/20, 14px icons, group labels 11/15 tertiary, 0.5px `border-l2` separators, submenu 10px offset with an invisible hover bridge |
| MenuSurface | R16, `blur(40px) saturate(150%)`, translucent menu fill |
| Tooltip | padding `3px 7px`, R8, 13/20, tooltip bg, 150ms fade-in |
| Button md | 36px, R12, 14/22 |
| Button sm | 28px, R8, 12/18 |
| Button variants | primary (ink fill, not blue), ghost, outline (0.5px `border-l3`) |

Blue fill is used only for Send. Every other primary action uses an ink fill.

---

## 6. Motion

| What | Timing | Source |
|---|---|---|
| global ease | `cubic-bezier(.4,0,.2,1)` | `base.css` |
| hover color (rows) | 100ms | DisclosureRow |
| icon-to-chevron crossfade | 100ms | DisclosureRow, ChatGroupSeat |
| hover-revealed actions | 80ms opacity | MessageIconActions L48 |
| turn chevron | 180° rotate, 100ms | TurnProcessNodeView L38 |
| fold (collapse) | opacity out 70ms, then height + margin 110ms after a 50ms delay | `ui-chat/.../flow-motion.ts` |
| reveal (expand) | height + margin + opacity 110ms after 50ms | `flow-motion.ts` |
| flow gap change | margin-top 160ms | ChatView L68-121 |
| shimmer | 1.5s steps(48), 0.3s delay, infinite | TextShimmer |
| spinner dot | 1.5s rotation | StateDot |
| pending dot | 1s pulse | InputBar L151 |
| nav tick | 140ms transform/bg; busy 1s pulse | TurnNavigator L108, L123 |
| nav preview | 120ms enter (fade + 4px slide), 140ms `top` glide | TurnNavigator L173-174 |
| tooltip | 150ms fade | Tooltip |
| option select | 120ms border/bg | QuestionComposer |
| sidebar collapse | 150ms fade, then 150ms rail slide | SidebarRoot |
| column toggle | 0.3s, explicit toggle only | AppFrame |
| skeleton | 2s pulse | MenuView |
| fish logo | 1.6s rotate keyframes + SMIL path morph, hover only | HeroShell |

Principles:

- Everything is short. Nothing in the transcript runs longer than 160ms. Collapse fades out first and then shrinks height, so text is never squashed.
- `flow-motion.ts` adjusts the scroll position on the same animation frame as the height change. Content above the reader's position folds without moving what they are looking at.
- Every animated surface has a `prefers-reduced-motion` branch: the shimmer is hidden, the whale becomes a static SVG, and navigator transitions are removed.
- Streaming text has no fade-in.

---

## 7. Empty state (`ui-conversation/src/client/skeleton/HeroShell.module.css`, `EmptyHero.tsx`)

- The hero phase centers the stack vertically. The composer is the same width as when docked and sits at `padding-bottom: 32px` (ConversationRoot L507-518).
- Headline:
  - a 34px fish logo plus "Into the Unknown" at 26/32, weight 500, 10px gap
  - a "Preview" badge: a mono pill on the business-tertiary background
- On hover the fish swims: CSS rotate keyframes over 1.6s combined with an SVG SMIL path morph of the body. It is the one playful moment in the UI, and it plays only on hover.
- Workspace chip below the headline: folder icon, label, chevron, 13/20, weight 500, transparent at rest with a hover fill. It opens the workspace picker.
- The hero placeholder is the "Describe what you want to build…" text. The draft min height grows to 52px.
- There are no suggestion cards, prompt chips or feature tiles. The empty state is the logo, one line of type, a chip and the composer.
- When the first message sends, the seat enters the settling phase (`visibility: hidden` while it moves) and reappears docked at the bottom.

---

## 8. Polish details worth copying (cross-cutting)

1. **0.5px hairlines, drawn inside the shadow.** Elevated cards have no CSS border. Their outline is the first shadow layer (`0 0 0 0.5px`), so outlines never take layout space and the stroke color can be rebound per surface.
2. **Superellipse corners** on everything that is not a full circle or pill.
3. **Opacity-only reveals.** Hover actions, inspect pills, remove buttons and shortcut hints all keep their space at rest. Nothing reflows on hover.
4. **Icon-to-chevron crossfade** on every collapsible row, so the expand affordance appears only when you can use it.
5. **A fixed 36px fade band** above the sticky composer, plus `scrollbar-gutter: stable`.
6. **Asymmetric message styling.** The user gets a tinted R20 bubble capped near 70% width. The assistant gets bare prose at the full column. Actions sit 6px to the left for optical alignment.
7. **One 13px process tier.** All tool, reasoning and group rows are 24px tall with 13px text in tertiary ink, rising to secondary on hover. Color stays muted until hover (diff stats, for example).
8. **Running state through motion only.** The text shimmer, the masked APNG whale and tabular-nums clocks mark a running turn, with no spinners in the text column.
9. **Fade masks wherever content clips.** Scroll edges (24px), streaming summaries (48px), menus (16px), the New Session label (16px) and the composer seat (36px).
10. **One width variable** (`clamp(680px, 64%, 920px)`) shared by the transcript, composer, takeovers and turn navigator, so swapping the composer for an approval or question card never changes width.

Smaller details:

- The send button sits 2px high on purpose.
- Stop has the same shape and size as Send.
- A wide table reaches past the column, but the text stays at its width.
- The code banner is sticky, so copy stays reachable on long blocks.
- The diff gutter bar is an inset shadow, not a border.
- The model effort label truncates before the model name does.
- Paired pills use negative margins to look like one cluster.
- In light mode every layer is `#fff` and depth comes only from shadows. Dark mode steps layers up the ramp.
- Blue is used sparingly: links, Send, the caret, the active tab, focus rings and references. Primary buttons are ink.
