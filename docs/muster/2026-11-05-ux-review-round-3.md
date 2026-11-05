# UX review, round 3

Reviewer: independent sub-agent. Evidence is live CDP measurement of the running dev build (computed radius, fill, height, font size, icon size and stroke for every control in a region; contrast maths on composited colours; screenshots at 1560px and 800px) plus a code sweep against `docs/STYLEGUIDE.md`. Live passes covered Code view (sidebar, titlebar, tab bar, Explorer, Source Control, Agents history, Tasks, Checks, Site, quick commands menu), the Tasks page, Sites list and a LocalWP site detail, Settings (General, Appearance, Extensions, Browser, Remote Muster servers, Experimental, Setup guide, the Projects group), the Help, Workspace options and worktree context menus, the Ports and Resource manager popovers, the Command palette and the Jump palette, Chat, and Bots (host and webview).

Round 3 emphasis was cohesion: the same role should use the same recipe on every surface.

Limits of this pass, so the scores are read correctly:

- The app window was minimized for most of the pass (`document.visibilityState === "hidden"`; page timers and `requestAnimationFrame` did not fire at all). Screenshots and DOM measurements still work in that state. Once the user restored the window, everything that depends on rAF or timers was rechecked live: palette exit animations, the narrow-window collapse, the Bots theme sync and LocalWP detection. Those results are in the "Visible-window recheck" section and supersede the hidden-window notes.
- The user runs the terminal-matched theme in dark, which writes every token inline on `<html>`. Light was simulated by removing those inline tokens and the `dark` class (canonical `main.css` light tokens), then restoring the exact attribute.
- The renderer reloaded twice during the session (HMR). After the first reload `activeWorktreeId` was null; the aidc worktree (active before the reload) was re-activated at the team lead's request and is active at the end of the pass. Terminal count was unchanged (17 PTYs throughout) and nothing inside the worktree was changed.
- A dev-only `react-grab` overlay sits over the left of the status bar. It is not a finding.

## Scores

| # | Category | Round 1 | Round 2 | Round 3 |
|---|---|---|---|---|
| 1 | Visual consistency | 6 | 7 | 8 |
| 2 | Typography and readability | 6 | 8 | 8 |
| 3 | Color, contrast and theming | 7 | 7.5 | 8.5 |
| 4 | Layout, spacing and alignment | 6 (p) | 7.5 | 8 |
| 5 | Navigation and information architecture | 6 | 7.5 | 8.5 |
| 6 | Interaction feedback and states | 7 (p) | 7.5 | 8.5 |
| 7 | Empty, error and onboarding states | 7 | 8 | 8.5 |
| 8 | Copy and microcopy | 6 | 8 | 8.5 |
| 9 | Accessibility | 5 | 7.5 | 8 |
| 10 | Responsiveness and polish | 5 (p) | 7.5 | 8.5 |

No category reaches 9 yet. Responsiveness moved from 8 to 8.5 after the visible-window recheck confirmed RESP-4. The floating surfaces are now one family: every popover, menu and palette measured 12px or 16px, opaque `bg-popover-solid`, no blur, and both palettes share one shell and one row recipe. What keeps Visual, Type and Layout at 8 is a second tier of shared components that still carry the pre-Bots recipe (the Settings segmented control, `CommandInput`, the tab bar menus) and the switch track, which fails non-text contrast in both themes.

## Top findings

Ranked by score impact.

1. **VIS-15** (new) The Settings segmented control is still the old recipe. `SettingsSegmentedControl` draws an 8px bordered track (`settings/SettingsFormControls.tsx:162`, `rounded-md border border-border bg-background/50 p-0.5`) holding 4px segments with a `bg-accent` selection (`:182`, `:186`). Live in Appearance, the Theme picker (System / Dark / Light) is a 34px track with 4px segments at 14px, and "Left sidebar appearance" two rows lower is a 26px track at 12px; neither inverts the selection. Every other segmented control in the app (mode switch, Explorer Names/Contents, Agents history scope, Workspace options Group by, Extensions Tools/Skills) is a pill track with an inverted pill. It has 27 call sites, so it shows up on most Settings panes. Fix: rebuild it on `ToggleGroup variant="segmented"` (`ui/toggle-group.tsx:45`), keeping the generic value API; map `size="sm"` to the 28px track. VIS +0.5, TYPE +0.1.
2. **A11Y-7 / COL-7** (new) The switch's off state fails non-text contrast. `ui/switch.tsx:20` paints the off track `bg-muted-foreground/30` with a `bg-background` thumb. Measured against the card behind it: 1.53:1 in light (#d1d1d1 on #ffffff) and 1.89:1 in dark (#4d4d4b on #212121); WCAG 1.4.11 needs 3:1. In the General pane screenshot the first switch ("Confirm before deleting a workspace", off) is close to invisible, and the same `SwitchTrack` is used by the Workspace options filter rows. Fix: off track `bg-foreground/25` (or a 1px `border-foreground/40` ring) so the track edge reaches 3:1, and give the thumb a hairline border so it reads on both fills. A11Y +0.5, COL +0.25, FB +0.25.
3. **LAY-8** (new; LAY-6 persists) Mixed control heights in one row. The Extensions toolbar track is 32px but its segments are 36px and overflow it by 2px top and bottom: `toggleVariants({ variant: 'segmented' })` adds the default size `h-9` after `h-full` (`settings/ExtensionsPane.tsx:132`, `ui/toggle.tsx:15-19`). The same toolbar has a 32px search, a 36px select and a 32px refresh. Settings General puts a 32px "Browse" next to a 36px path field; Remote Muster servers a 36px select next to a 32px refresh; Experimental uses a 32px key field and 32px Save/Remove where General and Sites use 36px. Fix: pass `size` through to the segments (or drop `h-9` from the segmented variant), and use one control height per Settings row (36px fields, 36px buttons beside them). LAY +0.5.
4. **TYPE-6** (new; TYPE-5 persists) Font size drifts inside one control type. 21 `SelectTrigger`s force `text-xs` (12px) while the primitive is 14px; in Appearance "Monaco Dark" is 12px two rows below a 14px "Geist", and in General "Client default" is 12px under a 14px "Most recent" (`settings/EditorAppearanceSection.tsx:53`, `settings/WorkspaceDirectorySetting.tsx:178`, `settings/BrowserSearchEngineSetting.tsx:55`, `settings/BrowserDefaultZoomSetting.tsx:50`). TYPE-5 is unchanged: the Settings search is still 13px, and the Tasks "Labels" and "Projects" triggers are still 11px beside a 14px filter in a 28px bar. Source Control "Create PR" and "Stage all" are 11px. Search fields come in six size pairs: 28/12 (right sidebar `SEARCH_FIELD_SHELL`), 28/14 (Tasks), 32/13 (left sidebar), 32/14 (Extensions), 36/13 (Settings), 36/14 (Sites). Fix: drop the `text-xs` overrides on `SelectTrigger`, 14px in fields and 13px minimum on button labels, and two search sizes only (`SEARCH_FIELD_SHELL` for panels, `Input` for pages). TYPE +0.5, VIS +0.1.
5. **VIS-16** (new) `CommandInput` still defaults to the divided header row: `border-b border-border bg-muted/30`, `rounded-md`, 40px (`ui/command.tsx:103`, `:112`). The palettes look right only because `CommandDialog` restyles it with descendant selectors (`ui/command.tsx:76`). About 20 pickers render the default, for example the Tasks project picker, which wraps it in a `rounded-md border bg-background` box (`right-sidebar/tasks-panel-project-picker.tsx:22-24`), plus `RepoCombobox`, `AgentCombobox`, `ProjectCombobox` and the automation pickers. The Workspace options and sidebar filter menus hand-style it as a 7px bordered box at 12px (`sidebar/SidebarRepositoryFilterSection.tsx:171`, `sidebar/SidebarFilter.tsx:268`). Fix: make the pill search (`rounded-full`, 0.05 fill, no border, 14px) the `CommandInput` default and delete the per-site `wrapperClassName` overrides. VIS +0.25, TYPE +0.1.
6. **VIS-17** (new) Tab bar menus bypass `MENU_ROW`. The quick commands menu measured 7px rows at 12px, 20px square row buttons at 4px radius and a 5px "Command" row, all inside a 12px sheet whose other menus use 8px rows at 14px. Sources: `tab-bar/QuickLaunchButton.tsx:182`, `:201`, `:218` and `tab-bar/TabBar.tsx:612`, `:629`, `:639` (`rounded-[7px] text-[12px]`), `tab-bar/TabBarQuickCommandsMenu.tsx:391` (`rounded-[5px] text-[12px] hover:bg-muted`). The repo has 47 `rounded-[5px|6px|7px]` literals, 19 of them in `browser-pane/BrowserPane.tsx`. The worktree context menu also overrides its label to 11px (`sidebar/WorktreeContextMenu.tsx:784`) where `MENU_LABEL` is 12px. Fix: remove the className overrides so `MENU_ROW`/`MENU_LABEL` apply; use `Button size="icon-xs"` for row actions. VIS +0.25, TYPE +0.25.
7. **COPY-9** (new; COPY-6 partly fixed) Title Case and mixed nouns in the command palette. `shared/keybindings.ts` has 17 Title Case titles that the Command palette and Shortcuts pane show as-is: "Command Palette" (`:211`), "Open Settings" (`:227`), "Force Reload" (`:236`), "Delete Workspace" (`:295`), "Open Workspace Board" (`:314`). The palette also lists "Create worktree", "Switch worktree" and "Previous worktree" beside "Delete Workspace", and the Landing page says "Move up workspace" (`Landing.tsx:188`). The round 2 residuals are all still in `en.json` ("Copy Rel. Path to Line", "Toggle Chat UI", "Open Chat", "Blank Markdown", "New Markdown", "Option as Alt", "Append Enter"). The worktree row menu is fixed. Fix: sentence case the keybinding titles, pick "workspace" for user-facing commands, and rename "Move up workspace" to "Previous workspace". COPY +0.5.
8. **COL-8** (new) Placeholder text is below AA. `Input`, `Textarea` and `SEARCH_FIELD_INPUT` all use `placeholder:text-muted-foreground/60` (`ui/input.tsx:13`, `:30`; `ui/textarea.tsx:13`). "Search sessions" measures 2.36:1 in light and 3.49:1 in dark. Fix: full `text-muted-foreground` for placeholders (4.55:1 on the light sidebar, measured on the "Optional" badge). COL +0.25, A11Y +0.25.

## Findings by category

### 1. Visual consistency (8)

- **VIS-15**, **VIS-16**, **VIS-17**: see Top findings.
- **VIS-11** (partly fixed) The titlebar toggles and back/forward are round now, but still bespoke CSS classes rather than `Button`: `.sidebar-toggle` is 28px with a 16px icon and `.sidebar-toggle-compact` is 24px with 12px arrows, side by side in one titlebar (`App.tsx:2056`, `:2078`, `assets/main.css:1152`). The quick commands split button is `rounded-md` (8px) (`tab-bar/TabBarQuickCommandsMenu.tsx:218`, `:269`) while the Sites "Add to sidebar" split button is a pill. Status bar items are 4px rectangles for hover and focus. Fix: `Button size="icon-sm"` for all titlebar icons at one icon size; pill the quick commands split. VIS +0.25.
- **VIS-4** (partly fixed; muster-bots repo) Bots footer icons are now 24px round (16px glyph, 1.75 stroke) against Code's 24px round (14px, 2). The header icons are still 32px round with 18px glyphs at 1.5, against Code's 24px header icons at 14px/2, and the bot row action ("Actions for Bob") is 28px with a 4px radius. Bot rows are 12px against 8px worktree rows. VIS +0.25.
- **VIS-18** (new, small) The Setup guide marks the current step with a left bar plus a fill and uses 10px rows; every other list in the app marks selection with the fill alone on 8px rows. VIS +0.1.
- **VIS-1** (unchanged) 263 raw palette classes in 46 files by this pass's regex (round 2 counted 235 with its own method); the largest are `sidebar/workspace-status.ts` (28) and `TerminalSearch.tsx` (17). VIS +0.1.
- **VIS-2** (partly fixed) 20 bespoke `shadow-[…]` remain in 13 files, none in `ui/`. VIS +0.1.
- Icon strokes: Code sidebar nav rows draw at 1.75 and Settings nav rows at 2; the mode switch draws 2.25 active and 1.75 inactive (`chat-mode/ChatModeToggle.tsx:115`). Small, but it is the one place both nav lists sit side by side in the same window.

### 2. Typography and readability (8)

- **TYPE-6**: see Top findings (includes TYPE-5, which is unchanged).
- Palette group headings are 11px uppercase (`ui/command.tsx` heading recipe, measured "ACTIONS"); menu labels are 12px sentence case (`MENU_LABEL`). Two label styles for floating surfaces. TYPE +0.1.
- **TYPE-2** fixed (no `text-[17px]` or `text-[26px]`). **TYPE-3** fixed (the two `font-bold` left are rendered Markdown headings in `sidebar/comment-markdown-element-renderers.tsx:104`, which the guide allows). **TYPE-4** fixed with VIS-12.

### 3. Color, contrast and theming (8.5)

- **COL-7** and **COL-8**: see Top findings.
- **COL-4 / COL-5** fixed. Light Settings nav has no text under 4.5:1; "Optional" 4.55:1, "Update available" 5.66:1, "Installed" 5.73:1.
- **COL-6** fixed: no text under 4.5:1 in dark Source Control, Explorer (except below), Site or Agents history.
- **COL-1** fixed for focus. The 10 `ring-ring/NN` left are drag-over, queued and selected states, not focus rings.
- **COL-3** fixed, confirmed live with the window visible. Switching the host to light made the webview's own sync flip it within 1.5s (body `#ffffff`, `color-scheme: light`), and restoring flipped it back to `#1e1e1e`. The selected bot row, reply chips, model pill, composer and footer all render on light surfaces with no mid-grey blocks.
- Small: gitignored Explorer rows are 3.22:1 (light) and 3.31:1 (dark); the Source Control "master" ref chip is 4.32:1 at 11px in light; Tasks "No due date" is 3.02:1 at 11px in light. COL +0.1.

### 4. Layout, spacing and alignment (8)

- **LAY-8**: see Top findings.
- **LAY-5** fixed: Explorer rows sit 7px inside the panel with 8px corners; Ports rows are inset `rounded-md` (`status-bar/ports-status-popover-rows.tsx:220`).
- **LAY-7** fixed: Source Control filter and overflow are both 28px round.
- **LAY-6** partly fixed: the Open workspace dialog was not rechecked; the Settings rows above still mix 32px and 36px.

### 5. Navigation and information architecture (8.5)

- **NAV-1** fixed (Bots Apps uses `lucide-plug`, Bot settings `lucide-sliders-horizontal`).
- **NAV-5** fixed in substance: the Settings nav shows 28 buttons with "Projects 256" collapsed. Expanded, it lists every project inline (284 nav buttons) under a "Filter projects" field. A Projects pane with its own list would keep the nav short in both states. NAV +0.25.
- **NAV-6** fixed: the Help menu has Keyboard shortcuts, Send feedback, Setup guide, GitHub and Check for updates; one way into onboarding.
- **NAV-7** (new, small) When the Chat page is open, the mode switch shows "Bots" as the active segment. If Chat stays reachable it needs its own state in the switch; if it is retired, its entry points should go. NAV +0.1.

### 6. Interaction feedback and states (8.5)

- **FB-5** fixed: no `focus-visible:ring-1` or `focus-within:ring-1` left; 179 `focus-visible:ring-2`.
- **FB-3** fixed in code: the scroll container ring is suppressed once a row holds the cursor (`sidebar/WorktreeList.tsx:4240`), and worktree rows ring the card surface only (`:739`). Not exercised with a live keyboard walk this round.
- **FB-4** fixed. With the window visible, 117pacific resolved in under 3s ("Local environment · Stopped" with Start and Restart), so the 30s+ hang from round 2 did not reproduce. The slow path is in code: `use-site-stack-status.ts:86` sets `slow` after `DETECT_SLOW_MS` (8000ms, `:25`) and `SiteLocalStackCard.tsx:66` swaps the skeleton for `SiteStackDetectionNotice` with Retry. (The 16s pulse seen earlier was the minimized window, where page timers did not fire at all.)
- The switch off state (A11Y-7) is also a state-feedback problem: on and off differ mostly by thumb position.

### 7. Empty, error and onboarding states (8.5)

- **EMPTY-4** partly fixed. Agents history previews and the Bots sidebar preview are plain text now. The Bots handoff reply chips still show raw Markdown ("**Pepper's three statements:**"), and the expanded reply body renders it as pre-wrapped text (muster-bots `src/components/HandoffReply.tsx:31`, `:34`). Fix: strip Markdown in `result.preview` and render `result.more` with the Markdown renderer. EMPTY +0.25.
- **EMPTY-6** (new) The Resource manager says "Nothing running right now" directly above a "MUSTER 2.5% 479.3 MB" row, because the message keys on workspace repos only (`status-bar/ResourceUsageStatusSegment.tsx:1474`). Fix: "No workspace processes running". EMPTY +0.1.
- **EMPTY-7** (new, small) The Checks tab's empty state ("On the default branch") is top-left text, while Explorer, Sites and Landing centre an icon, a title and a line of help. EMPTY +0.1.
- Skeletons (VIS-14) are fixed: Sites action placeholders are pills (`96x32 rounded-full`), text placeholders are 12px pills.

### 8. Copy and microcopy (8.5)

- **COPY-9**: see Top findings.
- **COPY-6** partly fixed: the row menu now reads "Edit details", "Set parent workspace…", "Delete workspace". The palette and Landing still mix the nouns (COPY-9); `en.json` has 259 strings with "worktree" and 573 with "workspace".
- **COPY-7** fixed: "Edit details", and the Tasks prompt reads "Choose the ActiveCollab project for this repo. Every workspace in it uses the same one." "Remove project from Muster" fits on one line in a 240px menu.
- **COPY-8** fixed: "Optional", "Beta" and "Dev" are sentence case, 20px, like "Update available" and "Installed".
- Chat uses "Search..." and "Start a chat..." with three dots where the rest of the app uses "…". COPY +0.1.

### 9. Accessibility (8)

- **A11Y-7**: see Top findings (switch off track 1.53:1 and 1.89:1).
- **COL-8** placeholders also count here.
- **A11Y-2** fixed: `hit-area` is on the sidebar ports trigger (`sidebar/WorktreeCardPorts.tsx:45`), `GitHistoryPanel` and the Ports row buttons; "Generate commit message" now measures 24x24.
- **A11Y-6** (round 2 roll-up) fixed for COL-4/5 and FB-3.

### 10. Responsiveness and polish (8.5)

- **RESP-5** fixed: Tasks label chips size to their content ("COMPLETED ON LOCAL" in full) and the title truncates.
- **RESP-4** fixed, confirmed live with the window visible: at 800px the right sidebar closed, at 1560px it reopened, and it stayed open at the real 1710px width. (The earlier failure to reopen was the minimized window.) `right-sidebar/narrow-window-collapse.ts`.
- No horizontal page scroll at 800px in Code (`scrollWidth` 800), Sites or Settings. Sites shows the list or the detail with a back control. Chat's composer fits at 800px.
- Bots at 800px could not be judged: the webview guest keeps its own viewport under host emulation, so the screenshot clips its right side. Check with a real narrow window.

## Visible-window recheck

Run after the user restored the window (`visibilityState` "visible", rAF firing).

- Exit animations: the Command palette closed and left no dialog in the DOM after 1.2s. The stuck closed-state overlay seen earlier was the minimized window, not an app bug.
- Narrow collapse (RESP-4): 800px closed the right sidebar, 1560px reopened it, 1710px left it open.
- Bots theme sync (COL-3): host light reached the webview within 1.5s, and host dark brought it back.
- LocalWP detection (FB-4): 117pacific resolved in under 3s.
- New, small (muster-bots repo): in one light capture the Bots model pill read the raw id `claude-opus-5-5` where the earlier capture read "Claude Opus 5.5" with its icon. It looks like the pill renders the id before the model list loads. Fix: keep the last known display name, or show a skeleton until the list arrives. COPY +0.1.

## Round 2 findings verified

Fixed (checked live or in code, evidence above): VIS-5 (all popovers 12px, opaque, no blur; Ports and Resource manager match the menus), VIS-6 (Command and Jump palettes share the 16px opaque shell, pill search and 14px rows), VIS-7 track look (pill, inverted), VIS-8 primitives (`ui/textarea.tsx`, pill Explorer "Find files", Agents history search, filled `rounded-xl` commit message), VIS-9 (one `ui/switch.tsx`; the 4 remaining `role="switch"` rows reuse `SwitchTrack`), VIS-10 (no hand-rolled badge spans; all nav badges 20px sentence case), VIS-12 (Workspace options rows 30-32px at 14px with 12px labels), VIS-13 (cards and banners `rounded-xl`), VIS-14, TYPE-2, TYPE-3, TYPE-4, COL-1 (focus), COL-4, COL-5, COL-6, LAY-5, LAY-7, NAV-1, NAV-5, NAV-6, FB-5, COPY-7, COPY-8, A11Y-2, RESP-5.

Fixed and confirmed live with the window visible: COL-3, FB-4, RESP-4.

Fixed in code, not exercised live: FB-3 (needs a keyboard walk through the worktree list).

Partly fixed: VIS-2 (20 bespoke shadows left), VIS-4 (Bots header and row action), VIS-7 heights (LAY-8), VIS-8 (search fields in six size pairs, `CommandInput` default, VIS-16), VIS-11 (titlebar classes, quick commands split), LAY-6 (LAY-8), EMPTY-4 (Bots reply chips), COPY-6 (palette and Landing).

Still open: VIS-1 (raw palette count not reduced), TYPE-5 (Settings search 13px, Tasks triggers 11px), the residual Title Case strings listed under COPY-9.

## Already good (don't regress)

- One floating surface: every menu, popover and select content measured 12px, `bg-popover-solid` at alpha 1, `border-border/50`, no backdrop blur; palettes and dialogs 16px.
- The segmented look outside Settings: mode switch, Explorer Names/Contents, Agents history scope, Workspace options Group by, Extensions Tools/Skills, Sites environment chips.
- Badges: one 20px pill, sentence case, AA in both themes.
- Settings section cards, extension cards, Sites banners and right sidebar site cards all `rounded-xl`.
- Light Bots and light Code read as the same app: same sidebar, same pills, same inverted selection.
