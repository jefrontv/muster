# UX review, round 4

Reviewer: independent sub-agent. Evidence is live CDP measurement of the running dev build (computed radius, fill, height, font size, icon size and stroke per control; contrast maths on composited colours; screenshots at 1710px, 1560px emulated and a real 800px window) plus a code sweep against `docs/STYLEGUIDE.md`. Live passes covered Code view (titlebar, tab bar, left sidebar and worktree list, Agents history, Explorer, Source Control, Checks, Tasks), the quick commands, new tab, worktree, Workspace options and Help menus, the Add project dialog, the Ports and Resource manager popovers, the Command palette, Settings (Appearance, General, Extensions, SSH hosts, Setup guide, the Projects group), Sites, Chat, and Bots (host and webview, both themes).

Round 4 emphasis was cohesion: the same role should use the same recipe on every surface.

Limits of this pass:

- The window was hidden for the first part of the pass. Static checks ran then; everything that depends on rAF or timers (palette exit, Bots theme sync, real resize, keyboard walk) ran after the team lead brought the window forward (`visibilityState` "visible").
- Light was simulated the same way as round 3: inline terminal-matched tokens and the `dark` class removed, then restored exactly. The Bots webview followed through its own sync, so light Bots was checked with the window visible.
- The real resize used `window.resizeTo`. The window came back at 1710x989 but at x=0 instead of x=31 (macOS kept the widened window on screen); `moveTo` is ignored by Electron. Everything else was restored: Code view, right tab "vault", right sidebar open, aidc active, dark.
- A keyboard walk through the worktree list switched the active workspace to muster-ui (see A11Y-8); aidc was re-activated straight away. No terminal received input.
- `ux.mjs` and round 3's `run.mjs` are both usable, but the restore step in `run.mjs` copied `theme-transition-disabled` back onto `<html>` when the class was captured mid-theme-change on a hidden window. The copy in `scratchpad/r4/run.mjs` strips it.

## Scores

| # | Category | Round 1 | Round 2 | Round 3 | Round 4 |
|---|---|---|---|---|---|
| 1 | Visual consistency | 6 | 7 | 8 | 8.5 |
| 2 | Typography and readability | 6 | 8 | 8 | 8.5 |
| 3 | Color, contrast and theming | 7 | 7.5 | 8.5 | 8.5 |
| 4 | Layout, spacing and alignment | 6 (p) | 7.5 | 8 | 8.5 |
| 5 | Navigation and information architecture | 6 | 7.5 | 8.5 | 9 |
| 6 | Interaction feedback and states | 7 (p) | 7.5 | 8.5 | 8.5 |
| 7 | Empty, error and onboarding states | 7 | 8 | 8.5 | 9 |
| 8 | Copy and microcopy | 6 | 8 | 8.5 | 8.5 |
| 9 | Accessibility | 5 | 7.5 | 8 | 8.5 |
| 10 | Responsiveness and polish | 5 (p) | 7.5 | 8.5 | 8 |

Navigation and Empty states reach 9. The primitives round 3 called out are fixed and measured: the Settings segmented control is the pill track with an inverted selection, the switch off track clears 3:1 in both themes, placeholders clear 4.5:1, the Extensions toolbar is one height, selects are 14px, the titlebar icons are one recipe, and the palettes and menus share one sheet. Responsiveness drops half a point because the narrow-window restore fails under a real resize (RESP-6). What holds the rest below 9 is a short list of surfaces that never moved to the shared recipes: the right sidebar activity bar, the worktree list's keyboard model, the mode switch's inactive label, Chat's sidebar, and a handful of hand-styled search fields and buttons.

## Top findings

Ranked by score impact.

1. **RESP-6** (new; RESP-4 regressed under a real resize) The right sidebar does not come back after a real narrow-and-widen. Two plain cycles with `window.resizeTo(800)` and back: the first reopened, then closed again at 1710px within a second; the second never folded or reopened. A store trace shows the close comes from `hydratePersistedUI` (`store/slices/ui.ts:1605`), called by `window.api.ui.onStateChanged` (`hooks/useIpcEvents.ts:1322-1323`). The renderer persists `rightSidebarOpen: false` when it folds at 800px; main echoes that state back after the controller has already restored the sidebar, so the restore is overwritten. Because the hydrate is not a change the controller made, `onOpenChanged` treats it as a user toggle and clears `autoClosed` (`right-sidebar/narrow-window-collapse.ts:48-56`), which is why the next cycle does nothing. A second path loses the restore too: the hook lives in `right-sidebar/index.tsx:73`, so opening Settings, Sites or Bots while narrow remounts it with no memory of the fold. Fix: don't persist (or don't re-hydrate) `rightSidebarOpen` while the auto-fold owns it, for example keep the auto-close as a separate non-persisted flag that the layout ORs with the user's choice, and move the controller up to `App.tsx` so it survives full-page views. Add a test that a `sync` hydrate between fold and widen doesn't cancel the restore. RESP +0.5, FB +0.1.
2. **A11Y-8** (new; FB-3 partly fixed) The worktree list's keyboard model fights the user. Arrowing onto a workspace row switches to that workspace and moves focus into its terminal, so a keyboard user cannot move past a row without leaving the list (`sidebar/WorktreeList.tsx:2684-2688`, the "selection-follows-focus" comment; live, the second ArrowDown from the AIDC header switched to muster-ui and focused `.xterm-helper-textarea`). Each workspace title is also its own Tab stop inside the tree (`sidebar/WorktreeTitleInlineRename.tsx:318`), so Tab after the tree visits every name (3 extra stops here, one per workspace in a real list). FB-3 itself: the scroll container no longer rings (fixed), but the active card gets a 1px outline at 50% foreground whenever the tree has focus (`assets/main.css:1433-1438`), while the cursor uses a 2px `outline-ring` (`WorktreeList.tsx:735-739`). After one ArrowDown both are visible at once. Fix: move the cursor without activating (Enter or Space activates), take the title spans out of the tab order (rename stays on double-click, F2 and the menu), and drop the 1px active-card outline so the 2px cursor ring is the only focus mark. A11Y +0.5, FB +0.25.
3. **VIS-19** (new) The right sidebar activity bar still uses the pre-Bots tab recipe. Its six buttons are 36px squares with 16px icons and mark selection with a 2px underline (`right-sidebar/activity-bar-buttons.tsx:126-127`, `:145`), where every other selector in the app uses a fill or the inverted pill. Inactive icons are `text-muted-foreground/60`: 2.47:1 on #fafafa in light (fails 1.4.11) and 3.74:1 in dark. They have no `focus-visible` styles, so focus shows the browser's 1px fallback outline; the active tab has no `aria-pressed`/`aria-selected`. Fix: 28px round `Button variant="ghost" size="icon-sm"` with a `bg-foreground/[0.07]` selected fill (or the segmented pill), full `text-muted-foreground` for inactive icons, `aria-pressed` on the active one. VIS +0.25, COL +0.25, A11Y +0.25.
4. **COL-9** (new) Inactive labels in the mode switch and Chat's sidebar fall below AA. The mode switch paints inactive segments `text-foreground/55` (`chat-mode/ChatModeToggle.tsx:142`): "Bots" measures 4.2:1 on the light track at 13px, and it sits at the top of every view. The shared segmented recipe uses `/70` (`ui/toggle.tsx:15`), so the two switches also differ. Chat's sidebar region labels "Workspaces" and "Chats" are `text-muted-foreground/60` at 11px, 2.47:1 (`chat-mode/chat-sidebar-hierarchy.ts:12`), idle thread rows are `/75` at 3.29:1 (`chat-mode/ChatThreadRow.tsx:214`), and the composer's "Medium" effort label is 2.52:1. Fix: use the `toggleVariants` segment colour in the mode switch; full `text-muted-foreground` for Chat labels and idle rows (they already differ from active rows by fill). COL +0.25, A11Y +0.25.
5. **COPY-10** (new; COPY-9 partly fixed) The palette still mixes nouns. The Title Case is gone, but `shared/keybindings.ts` keeps "Switch worktree" (`:245`), "Previous worktree" (`:257`), "Next worktree" (`:265`), "Rename worktree" (`:281`) and "Focus worktree list" (`:449`) beside "Delete workspace" (`:295`) and the quick action "Create workspace" (`cmd-j/quick-actions.ts:138`); the palette shows them in one list. "Resume in worktree" (Agents history), the tree's `aria-label="Worktrees"`, and "Create worktree" (`NewWorkspaceComposerModal.tsx:222`) are the same split. The round 2 residuals are still in `en.json` ("Copy Rel. Path to Line", "Toggle Chat UI", "Open Chat", "Blank Markdown", "Option as Alt", "Append Enter"). The palette also shows "Global" as the description of every Commands row. Fix: "workspace" in all five titles and the three strings above; give command rows a real description or none. COPY +0.5.
6. **VIS-20** (new) The Add project dialog draws its primary option as a 60px two-line pill: `AddRepoStartAction` is a `Button`, so it inherits `rounded-full` (`sidebar/AddRepoStartSteps.tsx:265-277`), while the "Other ways to add" list right under it is a `rounded-md` bordered group (`:198`, `:210-211`). Both are option cards. Fix: `rounded-xl` for the primary option and the group, same border token. VIS +0.1.
7. **VIS-21** (new; VIS-16 and VIS-17 partly fixed) The last hand-styled search fields and menu sheets. The `CommandInput` default is the pill now, but four sites override it back: the Workspace options and sidebar filter boxes are still 7px bordered (`sidebar/SidebarRepositoryFilterSection.tsx:171`, `sidebar/SidebarFilter.tsx:268`), the quick commands search is a divided header row at 12px (`tab-bar/TabBarQuickCommandsMenu.tsx:331-332`), and the Tasks project picker keeps its `rounded-md border bg-background` wrapper with a 12px input (`right-sidebar/tasks-panel-project-picker.tsx:22`, `:25`). The new tab menu is an 11px sheet with 4px padding and `border-border/80` (`tab-bar/TabBar.tsx:1045`, also `tab-bar/BrowserTab.tsx:278`) and its search is a bare underlined 12px input with no icon (`tab-bar/TabBarCreateEntry.tsx:292`). Explorer's search-in-files field is `rounded-sm border bg-input/50` at 28px (`right-sidebar/SearchQueryRow.tsx:38`) directly above 36px pill filter inputs (`right-sidebar/SearchFilters.tsx:28`). Fix: delete the `wrapperClassName` and sheet overrides; `MENU_SHEET` for the new tab menu; `CommandInput` for its search; `SEARCH_FIELD_SHELL` for the Explorer query. VIS +0.25, TYPE +0.1.
8. **VIS-22** (VIS-4 partly fixed; muster-bots repo) The Bots sidebar header, footer and row action are 24px round with 16px glyphs at stroke 2, matching Code. The conversation header is not: "Bot's screen" and "More" are 32px with 18px glyphs (`src/components/ChatView.tsx:1131`, `:1136`; `src/components/ChatMoreMenu.tsx:220`, `:225`) where Code's tab bar uses 28px with 14px. Bot rows stay 12px corners against 8px worktree rows. The model pill still shows the raw id first after a reload (`["claude-opus-5-5", "Claude Opus 5.5"]` polled at 100ms), because `modelLabel` falls back to the id while the model list loads (`src/components/ModelPicker.tsx:41-43`). Fix: 28px round header buttons at 16px; keep the last known label (or a skeleton pill) until the list arrives. VIS +0.1, COPY +0.1.

## Findings by category

### 1. Visual consistency (8.5)

- **VIS-19**, **VIS-20**, **VIS-21**, **VIS-22**: see Top findings.
- **VIS-15** fixed: Theme, Terminal theme mode and Usage percentages are 36px pill tracks with 30px segments at 13px; "Left sidebar appearance" is the 28px `sm` track at 12px. All invert the selection (`#eeece2` on dark).
- **VIS-11** partly fixed: Toggle sidebar, Go back, Go forward, New tab and Toggle right sidebar all measure 28px round with 14px icons at stroke 2. Still open: the quick commands split is 8px corners (`tab-bar/TabBarQuickCommandsMenu.tsx:206-207`, `:218`, `:269`), against the pill Sites "Add to sidebar" split; status bar items are 4px rectangles.
- **VIS-23** (new, small) Two status chip recipes. Settings nav badges are the 20px `Badge`; the extension cards use `IntegrationStatusPill` (`integration-status-pill.tsx:30`, `py-0.5` with a dot) at 23px for the same words ("Update available" appears in both). The Resource manager's "Review inactive workspaces" is a hand-rolled `rounded-md` bordered button (`status-bar/ResourceUsageStatusSegment.tsx:1506`) beside a pill "Scan". VIS +0.1.
- **VIS-24** (new, small) Chat's composer is a different dialect: "No workspace" and the model/effort chips are 28px with 8px corners, and the send button is a blue fill (`#7aaaff` in dark) where Code and Bots send with the foreground pill. VIS +0.1.
- Icon strokes: the mode switch is 2 in both states now. The Code sidebar nav still overrides to 1.75 idle and 2.25 active (`sidebar/SidebarNav.tsx:181`, `:207`, `:235`; `sidebar/SidebarTaskNavButton.tsx:221`) against Settings nav at 2.
- **VIS-1** 261 raw palette classes in 46 files (263 in round 3). **VIS-2** 20 bespoke `shadow-[…]` in 13 files (unchanged). Odd `rounded-[5|6|7px]` literals are down from 47 to 35, 19 in `browser-pane/BrowserPane.tsx`.

### 2. Typography and readability (8.5)

- **TYPE-6** fixed in the main: no Settings `SelectTrigger` overrides `text-xs` (2 left, `TaskPage.tsx:8117` and `activity/ActivityPrototypePage.tsx:1776`); Appearance selects all measure 36px/14px. Search fields are down to three pairs: 28/12 for panels (Agents history, Explorer), 36/14 for pages (Settings, Sites), and Chat's 32/13.
- Palette group labels are 12px sentence case, matching `MENU_LABEL` (fixed).
- **TYPE-7** (new; residual of TYPE-5/6) 11px controls remain: Source Control "Stage all" (`right-sidebar/SourceControl.tsx:7212`) and "Create PR" (measured 24px/11px), the worktree menu label (`sidebar/WorktreeContextMenu.tsx:784`), Workspace options "Clear", and the Agents history host pill "Local Mac". Fix: 12px floor for button labels, `MENU_LABEL` for the menu label. TYPE +0.25.
- Chat's region labels use `tracking-[0.08em]` (`chat-mode/chat-sidebar-hierarchy.ts:12`) where the guide sets 0.05em for 11px uppercase labels.

### 3. Color, contrast and theming (8.5)

- **COL-7** fixed: switch off track 3.38:1 on #ffffff in light (`--switch-off`, `assets/main.css:280`) and 3.18:1 / 3.22:1 on the dark cards (`:429`); the thumb has `ring-1 ring-foreground/10` (`ui/switch.tsx:13`).
- **COL-8** fixed: no `placeholder:text-muted-foreground/NN` left. Light placeholders: "Search settings" 4.75:1, "Geist" 5.18:1.
- **COL-3** confirmed again with the window visible: host light reached the webview within 2s (body `#ffffff`, `color-scheme: light`), and dark came back after restore.
- **COL-9** and the activity bar contrast in **VIS-19**: see Top findings.
- Small: the Source Control untracked count "1" is 3.6:1 at 10px in light, and the `→` before "origin/master" is 2.95:1. Explorer, Checks, Tasks and Sites have no text under 4.5:1 in light.

### 4. Layout, spacing and alignment (8.5)

- **LAY-8** fixed: the Extensions toolbar is one 36px row (track, search, select, refresh), with 30px segments inside the track (`ui/toggle.tsx:24-25`).
- **LAY-6** fixed for General, Extensions, Remote Muster servers, Experimental, Browser, Git, Terminal, Quick commands and Task sources: no Settings row mixes control heights.
- **LAY-9** (new, small) SSH hosts rows put 28px/13px icon buttons (End remote terminals, Reset, Edit, Remove) beside 24px/12px "Test" and "Connect" buttons. LAY +0.1.

### 5. Navigation and information architecture (9)

- **NAV-5** fixed: the expanded Projects group shows 12 projects and "Show all 256" (`settings/settings-projects-nav.tsx:27-28`, `:68-70`), so the nav is 42 buttons instead of 284. The 12 are in insertion order, not by name ("aidc" is not among them although it sorts third).
- **NAV-7** fixed: on the Chat page the switch shows Chat, Bots and Code, with Chat selected.
- **NAV-6** confirmed: Help has Keyboard shortcuts, Send feedback, Setup guide, GitHub and Check for updates.

### 6. Interaction feedback and states (8.5)

- **A11Y-8** covers FB-3 (partly fixed): see Top findings.
- **FB-6** (new) Three focus treatments. Most controls use `focus-visible:ring-2`. The left sidebar nav (Sites, Tasks), the right sidebar activity bar and the Agents history group headers have no focus styles and show the browser's 1px fallback outline in `ring/50`. The worktree cards add the 1px/50% outline above. Fix: `focus-visible:ring-2 focus-visible:ring-ring` on those three, then remove the card outline. FB +0.25, A11Y +0.1.
- Palette exit with the window visible: Escape left no dialog in the DOM after 1.2s.

### 7. Empty, error and onboarding states (9)

- **EMPTY-4** fixed: handoff chips run through `plainPreviewText` and the expanded body renders `ChatMarkdown` (muster-bots `src/components/HandoffReply.tsx:29`, `:33`, `:36`); live, no `**` in the transcript.
- **EMPTY-6** fixed in code: "No workspace processes running" (`status-bar/ResourceUsageStatusSegment.tsx:1478`). Not seen live because a terminal was running.
- **EMPTY-7** skipped on purpose (Checks shares Source Control's left-aligned empty state and holds the create-PR form).
- **VIS-18** fixed: Setup guide rows mark the current step with the fill only (`bg` 0.07, no left border), 8px corners.
- Small: the only Agents history row is titled "Current time when this message was sent: Wednesda…", which is injected context rather than the user's request. EMPTY +0.1.

### 8. Copy and microcopy (8.5)

- **COPY-10**: see Top findings.
- **COPY-9** partly fixed: no Title Case titles left in `shared/keybindings.ts`; Landing says "Previous workspace" (`Landing.tsx:191`); Chat uses "Search…" and "Start a chat…".
- Palette: "New Markdown file" sits beside the description "Create an untitled markdown file…", and the title truncates ("New Markdown fi…") while the description keeps its full width.

### 9. Accessibility (8.5)

- **A11Y-7** fixed (switch, above). **COL-8** fixed (placeholders).
- **A11Y-8**, **VIS-19**, **COL-9**, **FB-6**: see above.

### 10. Responsiveness and polish (8)

- **RESP-6**: see Top findings. RESP-4's fold works under a real resize (closed at 800px every time); the restore is what fails.
- No horizontal page scroll at a real 800px window in Code, Sites, Settings or Bots (`scrollWidth` 800). Sites shows the list with a back control; Settings keeps its nav.
- **RESP-7** (new, small) Bots at a real 800px window keeps its 320px sidebar, leaving about 430px for the conversation; the 4-column game table wraps to one word per line and the header title sits over scrolled table text. The model pill does collapse to its icon. Fix: collapse the Bots sidebar to its avatar rail under about 960px, like the right sidebar fold. RESP +0.1.

## Round 3 findings verified

Fixed (checked live or in code, evidence above): VIS-15, VIS-18, LAY-8, TYPE-6 (2 trivial overrides left), A11Y-7 / COL-7, COL-8, NAV-5, NAV-7, EMPTY-4, palette group labels.

Fixed and confirmed live with the window visible: COL-3 (Bots theme sync), light Bots rendering, palette exit animation.

Fixed in code, not seen live: EMPTY-6.

Partly fixed: VIS-11 (titlebar fixed; quick commands split 8px, status bar items 4px), VIS-16 (`CommandInput` default is the pill; four call sites override it, VIS-21), VIS-17 (tab bar rows and row buttons fixed; new tab sheet 11px and its search, worktree menu label 11px), VIS-4 (Bots sidebar fixed; conversation header 32px, VIS-22), FB-3 (container ring gone; double outline and the selection-follows-focus switch, A11Y-8), COPY-9 (case fixed; nouns still mixed, COPY-10), LAY-6 (fixed except SSH hosts, LAY-9), the Bots model pill raw id (still flashes on load).

Regressed under a real resize: RESP-4 (fold works, restore is overwritten by the UI-state hydrate, RESP-6).

Skipped by decision: EMPTY-7.

Still open: VIS-1 (261), VIS-2 (20), the `en.json` Title Case residuals, the Code sidebar nav stroke override.

## Already good (don't regress)

- One floating surface: quick commands, worktree, Workspace options and Help menus, the Resource manager and Ports popovers all measured 12px, opaque `bg-popover-solid`, no blur; the palette and dialogs 16px.
- Segmented controls: one recipe at two sizes (36px and 28px tracks, inverted selection) across Settings, the mode switch, Agents history scope, Workspace options Group by and Extensions.
- Settings rows: 36px fields, selects and buttons, 14px text, 20px switches.
- Titlebar: five icon buttons at 28px round, 14px, stroke 2.
- Light Bots and light Code read as the same app with the window visible.
