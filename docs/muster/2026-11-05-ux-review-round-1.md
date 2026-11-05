# UX review, round 1 (partial)

Reviewer: independent sub-agent. Evidence is live DOM audits and a code sweep against `docs/STYLEGUIDE.md`. The visual pass stopped early (hidden window, then the context-mode hook blocked Bash), so (p) scores are provisional and may move up to 1 point.

## Scores

| # | Category | Score |
|---|---|---|
| 1 | Visual consistency | 6 |
| 2 | Typography and readability | 6 |
| 3 | Color, contrast and theming | 7 |
| 4 | Layout, spacing and alignment | 6 (p) |
| 5 | Navigation and information architecture | 6 |
| 6 | Interaction feedback and states | 7 (p) |
| 7 | Empty, error and onboarding states | 7 |
| 8 | Copy and microcopy | 6 |
| 9 | Accessibility | 5 |
| 10 | Responsiveness and polish | 5 (p) |

Target: every category at 9 or 10.

## Top findings

1. **LAY-1** `bots/BotsPage.tsx:80-85` puts the mode toggle in a full-width bordered band; Code keeps it in the sidebar (`sidebar/SidebarNav.tsx:166-168`). Switching modes shifts content about 60px, and Bots stacks three bars (about 125px) above the first message. Fix: drop the band, put the toggle at the top of the Bots left column with Code's inset. LAY +1, RESP +0.5.
2. **NAV-1** Six navigation systems in Code mode (mode toggle, sidebar nav rows, sidebar footer icons, titlebar back/forward, status-bar buttons, right activity bar). The Bots webview footer reuses the gear and puzzle icons for bot settings and integrations, which mean app Settings and Extensions elsewhere. Fix: one meaning per icon; use a different glyph (e.g. SlidersHorizontal, "Bot settings") or move bot settings into the bot header overflow menu. NAV +1.
3. **COL-1 / A11Y-1** Focus rings under 3:1. `--ring` is #a1a1a1 light (`main.css:229`); buttons use `ring-ring/50` (about 1.7:1 light, 2.2:1 dark); the mode toggle uses `ring-ring/60` (`chat-mode/ChatModeToggle.tsx:135`). Fix: a `--focus-ring` token (#525252 light, #a3a3a3 dark), full opacity, 2px, 1-2px ring offset, applied in `ui/button.tsx` and the other primitives. A11Y +1, COL +0.5.
4. **FB-1** The active mode tab's focus ring is painted over by the inverted pill overlay (`chat-mode/ChatModeToggle.tsx:128-156`). Fix: buttons `relative z-10`, overlay `z-0`, or ring the overlay when the active button is focus-visible. FB +0.5.
5. **VIS-1** 709 raw Tailwind palette classes (amber 117, emerald 105 text, and so on) and 154 hex literals in .tsx, though `--status-success` and `--status-attention` exist (`main.css:232-236, 367-370`). Fix: add `--status-danger` and `--status-info`, codemod emerald to success, amber/yellow to attention, rose/red to destructive, zinc to muted, and lint-ban raw palette classes in components. VIS +1.
6. **TYPE-1** Text below the 11px floor: `text-[10px]` 344 times, `text-[9px]` 29, `text-[9.5px]` 5. Hotspots: TaskPage.tsx (31), checks-panel-content.tsx (17), WorktreeJumpPalette.tsx (11), SourceControl.tsx (11). Every sidebar status badge is 9px (WorktreeList.tsx:747, WorktreeCardMetadataStatusBadges.tsx:23, WorkspaceKanbanStatusLane.tsx:142, WorktreeCardIssueDetailSection.tsx:138, WorktreeCardMeta.tsx:339, SidebarNav.tsx:277-278, WorktreeParentPickerPopover.tsx:85, SidebarRepositoryFilterSection.tsx:199, SidebarFilter.tsx:169 and :295). Fix: raise to 11px; if counters need 10px, one documented `text-2xs` token for numeric counters only; nothing at 9px. TYPE +1.
7. **COPY-1** 786 Title Case labels against 2,146 sentence case in en.json. Clusters: settings 385, right sidebar 95, sidebar 48, tab bar 39, editor 28, terminal 22, status bar 19, browser 18. The Settings nav and onboarding step labels mix both. Fix: sentence case everywhere except the native macOS menu bar (`menu.*` keys). COPY +1.
8. **RESP-1 / LAY-3** The Sites list is a fixed `w-80` (`sites/SitesPage.tsx:298`) beside the 325px sidebar; at 742px the detail pane renders off-screen. Fix: list shrinks to a ~240px floor, detail gets a min width, and under ~960px collapse the left sidebar on Sites or switch to master-detail. RESP +1, LAY +0.5.
9. **A11Y-2** 29 controls under 24px in Code view at 742px (Refresh rate limits 15x15, live ports 14x14, Close tab 16x16, titlebar Back/Forward 22x20, status-bar items 19-20px tall, Show Floating Workspace 20x20). Fix: keep the visual size and expand the hit area with an inset pseudo-element, or pad to 24px. A11Y +0.5.
10. **EMPTY-1** The Bots "missing" state (`bots/BotsPage.tsx:100-103`) shows "run pnpm fetch:muster-bots" to end users. Fix: "Muster Bots isn't part of this build." with a link to get the latest Muster; show the pnpm hint only in dev. EMPTY +0.5.
11. **A11Y-3** None of the 4 `role="tablist"` components (ChatModeToggle.tsx:120, ExtensionsPane.tsx, FeatureWallRail.tsx, github-markdown-composer-tabbar.tsx) handles arrow keys or roving tabIndex. Fix: Radix Tabs, or ToggleGroup for the mode switch. A11Y +0.5.

## Other findings

### Visual consistency
- **VIS-2** Shadow tiers multiply: shadow-sm 99, shadow-xs 92, shadow-lg 12, shadow-md 7, shadow-2xl 4, plus 8+ bespoke stacks (e.g. `shadow-[0_20px_44px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.04)]` x6). The Floating tier is spelled two ways (`rgba(0,0,0,0.18)` x7, `rgb(0_0_0/0.18)` x3). Fix: `--shadow-lift` and `--shadow-floating` tokens; map every call site to hairline, lift or floating. VIS +0.5.
- **VIS-3** Badges and chips use `rounded`, not pills: WorktreeCardMetadataStatusBadges.tsx:23, WorktreeParentPickerPopover.tsx:85, SidebarRepositoryFilterSection.tsx:199, SidebarFilter.tsx:295. List rows drift too (SiteRow.tsx:30 `rounded-md`). Fix: chips and badges `rounded-full`; one documented list-row radius. VIS +0.5.
- **VIS-4** The Bots webview has its own sidebar chrome, search pill and footer row (lightning, people, gear, puzzle) inside Muster's, so it reads as two products. Fix: let the webview own sidebar chrome in Bots, remove the Muster band (LAY-1), and match its footer icons to SidebarNav's 24px ghost icons. VIS +0.5. (muster-bots repo)

### Typography
- **TYPE-2** Off-scale sizes: 11.5px (12), 10.5px (11), 12.5px (6), 14.5px (5), 13.5px (3), 17px (3), 26px (3). Fix: snap to 11/12/13/14/15 or add a named token. TYPE +0.5.
- **TYPE-3** 28 `font-bold` uses outside markdown. Fix: semibold. TYPE +0.25.

### Color
- **COL-2** Idle sidebar nav icons use `text-worktree-sidebar-foreground/30` (SidebarNav.tsx around line 184): 2.0:1 light, 2.6:1 dark. Fix: /55 or `text-muted-foreground`. COL +0.25.
- **COL-3** Light theme not seen live. Round 2 needs light screenshots of Bots (does the webview flip?), Code and Sites before COL can go above 7.

### Layout
- **LAY-2** Three bars above Bots content (titlebar, LAY-1 band, webview header): about 125px on a 903px window. Fix: LAY-1, plus hide the titlebar app name in Bots or merge it with the webview header. LAY +0.5.
- **LAY-4** Bots composer: "Goal" has a text label, the shield and globe beside it don't; mic and chevron are separate. Fix: label all three or none; merge mic and chevron into one split button. LAY +0.25. (muster-bots repo)

### Navigation
- **NAV-2** Settings is a flat list of 20+ panes, and Linear sits apart from Integrations and Task Sources. Fix: group under 4-5 headings (App, Agents, Workspaces, Integrations, Advanced); fold Linear into Integrations. NAV +0.5.
- **NAV-3** The onboarding default-view step only offers Chat and Code (`onboarding/onboarding-step-copy.ts`), and is skipped only when Chat is unsupported (`use-onboarding-flow.ts:230`). Fix: build options from the enabled modes, including Bots. NAV +0.25.
- **NAV-4** Sites has no visible back affordance (`SitesPage.tsx:229`). Fix: ghost back icon in the header with an Esc hint in its tooltip. NAV +0.25.

### Feedback
- **FB-2** After `openSettingsPage()` the DOM showed only the status bar for over 4s, with no loading text or skeleton. May be caused by the hidden window; confirm in round 2. Fix if real: render the nav shell at once and a skeleton in the pane. FB +0.25.

### Empty and error states
- **EMPTY-2** Four errors say "Something went wrong" (WorktreeCreationPanel, WorktreeList groupDeleteFailedDesc, orca-profiles org members, chat-mode turnError.duringExecution). Fix: name the operation, show the error in a disclosure, add Retry and Copy details. EMPTY +0.5.
- **EMPTY-3** Bots failed state shows raw `status.error` and Restart only (`BotsPage.tsx:106-115`). Fix: add Copy error and Open logs. EMPTY +0.25.

### Copy
- **COPY-2** 174 strings use "..." and newer copy uses "…". Fix: codemod to "…". COPY +0.25.
- **COPY-3** Status bar "Session 21% · Week 59% · Fable 0%" doesn't say what is measured. Fix: a short visible label and a tooltip naming the plan limits and reset times (`status-bar/StatusBar.tsx`). COPY +0.25.
- **COPY-4** "Please" in 6 strings, "simply" once, one exclamation mark (TaskPage "You're all caught up!"). Fix: delete. COPY +0.25.
- **COPY-5** Em dashes in 105 UI strings. Fix: full stop or colon. COPY +0.1.

### Accessibility
- **A11Y-4** Reduced motion is opt-in: about 15 scoped blocks in main.css, no global rule; 89 `animate-pulse` and 20 `animate-in` uses uncovered. Fix: a global reduce rule on `*, ::before, ::after`, with `animate-spin` exempted. A11Y +0.25.
- **A11Y-5** 69 icon-size Buttons have no aria-label or Tooltip in code (BrowserPane.tsx 13, TaskPage.tsx 6, TerminalSearch.tsx 5, WorkspaceKanbanSettingsMenu.tsx 3, BrowserFind.tsx 3, PdfFind.tsx 3, and others). The live audit found none unnamed in Code, Sites and Settings, so check the browser pane and find bars first. Tooltip-only buttons need aria-label too. A11Y +0.25.

### Responsiveness
- **RESP-2** At 742px the terminal canvas spanned x=326-1369; possibly a missed refit while hidden. Verify at ~800px; if real, refit on container resize.
- **RESP-3** LAY-1 and LAY-2 cost about 14% of a short window's height. Fixed by LAY-1. RESP +0.5.

## Already good (don't regress)

- Monochrome palette that lets content lead; the Bots transcript and table card are calm and legible (15px body, generous leading).
- Text contrast passes in both themes in every sampled viewport.
- `ui/dialog.tsx` matches the modal spec (28px round close button with sr-only label, Floating tier).
- ChatModeToggle's sliding pill respects reduced motion (`ChatModeToggle.tsx:72`).
- `sites/SitesEmptyState.tsx` puts every way to get a first site on screen as buttons.
- `right-sidebar/checks-panel-empty-state.ts` uses process language and never overclaims.
- Bots intro copy (`bots/BotsIntroDialog.tsx`) is short and concrete.
- 874 aria-labels and only 7 title attributes; no unnamed visible controls in Code, Sites or Settings.
- Logical Tab order in the Code sidebar.
- No horizontal page scroll at 742px; only inner panes overflow.
- No leftover "Orca" in UI copy.

## Round 2 notes

- Needs Bash working and the window visible at about 1560 and 800 wide, in dark and light. Covers Code (terminal, file viewer, Source Control, Checks), Sites list, detail and setup dialog, every Settings pane, the plan review window, menus, toasts and dialogs. Provisional scores (LAY, FB, RESP) get confirmed or moved then.
- Focus checks: DOM and code only, or live only inside a dialog or settings pane the reviewer opened, with an `activeElement` check before every key. No keystrokes into terminals, editors or composers.
- Restore the app after: from the session scratchpad, `node ux.mjs localhost:5173 restore.json` returns it to Bots (aidc worktree, dark, right sidebar on the site tab).
- Reviewer helpers in the session scratchpad: `ux.mjs` (eval, screenshot, click, resize; refuses keys while a terminal or webview has focus), `a11y-audit.js`, `overflow-audit.js`, `contrast-audit.js`, `fontsizes.js`, `focus-walk.mjs`, `contrast.mjs`. The scratchpad is session-specific, so a new session must recreate them.
