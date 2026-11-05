# UX loop, round 1 fix plan

Source: `docs/muster/2026-11-05-ux-review-round-1.md` (35 findings, scores 5 to 7). Goal: every category at 9 or 10 after round 2 or later rounds. Fixes follow `docs/STYLEGUIDE.md`; when it is silent, the decision below goes into the style guide so the next round can check against it.

I spot-checked the reviewer's counts against the code: `text-[10px]` 344 (exact), 9px and 9.5px 34, raw palette classes 638 to 709 depending on the pattern, "..." in 170 strings, em dashes in 112. The cited lines for the pnpm hint and the toggle focus ring are correct.

## Phase A: tokens and primitives (about 3 h)

Small changes in shared places that lift many screens at once.

1. **Focus ring (COL-1, A11Y-1).** Add a `--focus-ring` token (#525252 light, #a3a3a3 dark), 2px at full opacity with a 1px offset, and use it in `ui/button.tsx`, the other `ui/` primitives and `ChatModeToggle.tsx:135`.
2. **Mode toggle ring hidden (FB-1).** Buttons `relative z-10`, the sliding pill `z-0` in `ChatModeToggle.tsx:128-156`.
3. **Global reduced motion (A11Y-4).** One `prefers-reduced-motion: reduce` rule in `main.css` covering `*, ::before, ::after`, with spinners exempt so loading still shows.
4. **Hit areas (A11Y-2).** A `hit-area` utility (inset pseudo-element reaching 24px) applied to icon buttons under 24px: titlebar back and forward, close tab, status-bar items, refresh rate limits, live ports, floating workspace. Visual size stays the same.
5. **Idle sidebar icons (COL-2).** `/30` to `text-muted-foreground` in `SidebarNav.tsx`.
6. **Shadow tokens (VIS-2).** `--shadow-lift` and `--shadow-floating`; map every bespoke `shadow-[...]` and `shadow-md/lg/2xl` to hairline, lift or floating.
7. **Status tokens (VIS-1 prep).** Add `--status-danger` and `--status-info` beside the existing success and attention tokens, in both themes.

## Phase B: layout (about 4 h)

1. **Bots band (LAY-1, LAY-2, RESP-3).** Remove the full-width toggle band in `BotsPage.tsx:80-85`; put the mode toggle at the top of the left column with the same inset Code uses, so switching modes no longer shifts the layout. Bots then has two bars above content instead of three.
2. **Sites at narrow widths (RESP-1, LAY-3).** List shrinks to a 240px floor, detail gets a minimum width, and under 960px the Sites page shows list or detail, not both (master-detail with a back control).
3. **Sites back control (NAV-4).** Ghost back icon in the Sites header; tooltip names the Esc shortcut.
4. **Terminal at narrow widths (RESP-2).** Check live at 800px; if the canvas overflows, refit on container resize.

## Phase C: sweeps with codemods and a guard (about 7 h)

Each sweep is a script plus a ratchet check (same shape as the max-lines ratchet) so new code can't reintroduce the pattern. Each lands as its own reviewable diff.

1. **Raw colours (VIS-1).** emerald and green to success, amber and yellow to attention, rose and red to destructive or danger, sky and blue to info, zinc to muted. Hex literals in `.tsx` get the same mapping where they mean a state. Anything decorative that has no token is listed for a decision instead of guessed.
2. **Small text (TYPE-1, TYPE-2).** Nothing below 11px. Add one `text-2xs` (10px) token for numeric counters only, documented in the style guide. Snap 10.5, 11.5, 12.5, 13.5 and 14.5px to the scale. Sidebar status badges go to 11px.
3. **Pills (VIS-3).** Chips and badges to `rounded-full`; document one list-row radius (`rounded-lg`) and apply it to `SiteRow.tsx` and its siblings.
4. **Weight (TYPE-3).** `font-bold` outside markdown to `font-semibold`.
5. **Copy (COPY-1, 2, 4, 5).** Sentence case for every UI label except the native macOS menu bar (`menu.*` keys). "..." to "…". Remove "please", "simply" and the one exclamation mark. Rewrite the 112 em dashes with a full stop or colon. Runs on `en.json` only; other locales are regenerated the usual way.

## Phase D: content and structure (about 9 h)

1. **Icon meanings (NAV-1, VIS-4, LAY-4).** In the muster-bots repo: bot settings and integrations get their own glyphs and names ("Bot settings", "Bot integrations") so the gear and puzzle keep one meaning across Muster. Footer icons match Muster's 24px ghost icons. Composer chips: label all three or none.
2. **Settings grouping (NAV-2).** Group the 20+ panes under five headings: App, Agents, Workspaces, Integrations, Advanced. Linear moves into Integrations.
3. **Onboarding (NAV-3).** The default-view step lists the modes that are switched on, including Bots.
4. **Errors (EMPTY-1, 2, 3).** Bots "missing" state shows "Muster Bots isn't part of this build." with the pnpm hint only in dev. The four "Something went wrong" errors name the operation, show the error in a disclosure, and offer Retry and Copy details. Bots failed state adds Copy error and Open logs.
5. **Status bar (COPY-3).** Visible label says what is measured; the tooltip names each limit and when it resets.
6. **Tablists (A11Y-3).** Arrow-key navigation and roving tabindex via Radix Tabs, ToggleGroup for the mode switch.
7. **Icon button names (A11Y-5).** aria-label on the 69 icon buttons without one, starting with the browser pane and find bars.
8. **Settings loading (FB-2).** Confirm live first; if real, render the nav at once and a skeleton in the pane.

## Then

Run the targeted tests, typecheck, lint, format and ratchets after each phase. Then start a fresh reviewer for round 2 with the same 10 categories, a full live pass in light and dark at about 1560 and 800px, and the round 1 report for comparison. Fix and rescore until every category is 9 or 10.

Nothing is committed until you ask. Total before round 2: about 23 h.

## Decisions for you

- Sentence case everywhere except the macOS menu bar, including Settings labels such as "SSH hosts" and "Stats and usage".
- A 10px `text-2xs` token allowed for numeric counters only.
- Settings regrouped under five headings.
- Under 960px, Sites shows list or detail, not both.
