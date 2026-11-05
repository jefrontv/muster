# UX review, round 2

Reviewer: independent sub-agent. Evidence is live CDP audits of the running dev build (DOM measurements, contrast maths, screenshots at 1561, 1710 and 800px, dark and a simulated light theme) plus a code sweep against `docs/STYLEGUIDE.md`. Live audits covered Code (sidebar, tab bar, every right sidebar tab), all 27 Settings panes plus one project pane, Sites list and detail, Tasks, Bots (host and webview), the worktree context menu, the Workspace options and Help menus, both palettes, the Open workspace dialog and the status-bar popovers.

Round 2 emphasis was consistency: container and child radii, hover and selected states against their container, hand-rolled controls against the primitives, mixed heights and icon sizes in one row, and menus or popovers with different recipes.

## Scores

| # | Category | Round 1 | Round 2 |
|---|---|---|---|
| 1 | Visual consistency | 6 | 7 |
| 2 | Typography and readability | 6 | 8 |
| 3 | Color, contrast and theming | 7 | 7.5 |
| 4 | Layout, spacing and alignment | 6 (p) | 7.5 |
| 5 | Navigation and information architecture | 6 | 7.5 |
| 6 | Interaction feedback and states | 7 (p) | 7.5 |
| 7 | Empty, error and onboarding states | 7 | 8 |
| 8 | Copy and microcopy | 6 | 8 |
| 9 | Accessibility | 5 | 7.5 |
| 10 | Responsiveness and polish | 5 (p) | 7.5 |

Target: every category at 9 or 10. No category is there yet. The biggest remaining gap is visual consistency: the primitives are now right, but several surfaces still bypass them or carry an older recipe.

## Top findings

1. **VIS-5** The `Popover` primitive still has the old glass recipe: `rounded-md`, `bg-[rgba(255,255,255,0.82)]` / `dark:bg-[rgba(0,0,0,0.72)]`, `backdrop-blur-2xl` (`ui/popover.tsx:101`). Menus use the opaque 12px sheet (`ui/menu-surface-classes.ts`, `MENU_SHEET`). The style guide says floating surfaces are opaque with no glass. Live: the Ports and Resource manager popovers (`status-bar/PortsStatusSegment.tsx:131`, `status-bar/ResourceUsageStatusSegment.tsx:1200`) measure 8px radius, 0.72 alpha, `blur(40px)`, and read darker than every menu beside them. 60 files use `PopoverContent`. The comment above the class says it "matches the dropdown-menu recipe", which is no longer true. Fix: give `PopoverContent` the `MENU_SHEET` surface (12px, `bg-popover-solid`, `border-border/50`, `shadow-floating`) minus the flex/gap/padding, and drop the blur. VIS +0.5, COL +0.25.
2. **VIS-6** Two command palettes, two recipes. `CommandDialog` (`ui/command.tsx:65`, used by the Command palette and Go to file) is 10px, `bg-background/96` with a 40px blur and a bespoke `shadow-[0_20px_60px…]`; its rows are `rounded-sm` (4px, `ui/command.tsx:209`), the search is a divided header row and group labels are sentence case. The Jump palette (`WorktreeJumpPalette.tsx:1577`) is 16px and opaque, its rows are `rounded-xl` (14px, `:1694`), its search is a filled pill and its group labels are uppercase. Fix: one palette shell (16px, opaque, Floating tier), one row recipe (inset rows, radius = shell padding rule), one search field and one label style; move `CommandDialog` onto it. VIS +0.5.
3. **VIS-8** Text fields come in at least five looks. The pill `Input` is the rule, but: Explorer "Find files" is a `rounded-sm` bordered box (`right-sidebar/FileExplorerNameFilter.tsx:21`) directly above the pill Names/Contents switch; the Settings search overrides the fill to `bg-background/60` and 13px so it vanishes on the sidebar (`settings/SettingsSidebar.tsx:214`); the commit message is a bordered `rounded-md` textarea with `shadow-xs` (`right-sidebar/SourceControl.tsx:7133`) where the guide says textareas are `rounded-xl` with the 0.05 fill and no border; the Agents history search is a hand-built pill at 28px/12px (`right-sidebar/AiVaultPanelHeader.tsx:158`); Command lists use a divided header row. There is no `Textarea` primitive: 59 raw `<input>` and 45 raw `<textarea>` outside `ui/`. Fix: add `ui/textarea.tsx` (rounded-xl, 0.05 fill, ring-1 focus) and an `Input` size `sm` (28px) with a leading-icon slot; move these call sites onto them. VIS +0.5, TYPE +0.25.
4. **VIS-11** Icon buttons drift in radius, size and stroke. Live census in Code view: titlebar Back/Forward and sidebar toggles are 24x24 and 32x24 at 4px radius (`.sidebar-toggle` classes, `App.tsx:2078`), New tab 28px at 8px, the right activity bar 36px square, sidebar icons 24px round. Strokes of 2, 2.5 and 2.75 sit next to each other in the tab bar (`tab-bar/TabBarQuickCommandsMenu.tsx:275` sets 2.5). In the Source Control header the filter button is a raw `rounded-sm` button (`right-sidebar/source-control-header-toolbar.tsx:228`) next to a round `Button size="icon-xs"` (`source-control-header-overflow-menu.tsx:69`), both 28px. The guide says icon buttons are round. Fix: route all of these through `Button` icon sizes, delete the per-site `strokeWidth` overrides, and keep one stroke for app chrome. VIS +0.5, LAY +0.25.
5. **FB-3** Keyboard focus in the worktree sidebar draws three rings at once: an inset ring on the scroll container (`sidebar/WorktreeList.tsx:4234`), an outline on the active row wrapper that starts at x=4 and crosses the tree guide line (`sidebar/WorktreeList.tsx:736`), and a second outline on the indented card at x=28. Seen live after closing the row context menu with Escape. Fix: one indicator. Drop the container ring when a row carries the cursor, and draw the row outline on the card only. FB +0.5, A11Y +0.25.
6. **VIS-7** The Extensions Tools/Skills switch is the same class of bug as the segmented control fixed last round: an 8px bordered track (`settings/ExtensionsPane.tsx:114`, `rounded-md border border-border p-0.5`) holding pill segments (measured 12px effective radius in a track that needs 5px). It is also 30px tall beside a 32px search and 32px select in one toolbar. Fix: use the shared segmented look (pill track at `bg-foreground/[0.05]`, inverted selected segment) at 32px. VIS +0.25, LAY +0.25.
7. **VIS-12** The Workspace options menu mixes three row recipes in one sheet. Top rows use `MENU_ROW` (8px, 14px text); the filter rows are hand-built (`sidebar/SidebarWorkspaceFilterSection.tsx:72`, 5px radius, 12px, `hover:bg-muted`); the project rows are `rounded-[7px]` at 12px with `bg-black/8` selection (`sidebar/SidebarRepositoryFilterSection.tsx:190`). Its section labels are 11px semibold (`SidebarWorkspaceFilterSection.tsx:20`) where `MENU_LABEL` is 12px medium. Fix: use `MENU_ROW` and `MENU_LABEL` everywhere in the sheet; a compact row variant if density matters. VIS +0.25, TYPE +0.25.
8. **COL-4 / COL-5** Light theme misses AA in places people read. Settings nav group labels, "Back to app" and "OPTIONAL" are #737373 on the #f5f5f5 sidebar: 4.35:1 at 11-13px (`main.css:246` and `:278`). The "Update available" and "Installed" badges are 4.0:1 (`settings/SettingsSidebar.tsx:176`, `status-*` on a 10% tint). The inactive "Bots" segment is 4.2:1. Fix: darken light `--muted-foreground` to about #6b6b6b, or lift muted text on the sidebar surface; use the `-solid` status ink for badge text. COL +0.5, A11Y +0.25.

## Findings by category

### 1. Visual consistency (7)

- **VIS-5**, **VIS-6**, **VIS-7**, **VIS-8**, **VIS-11**, **VIS-12**: see Top findings.
- **VIS-9** (new) No `Switch` primitive. 24 non-test files hand-roll `role="switch"`. Settings uses 20x36 (`settings/SettingsFormControls.tsx`, `SettingsSwitch`); the sidebar menus use 14x24 (`sidebar/SidebarWorkspaceFilterSection.tsx:81`, `sidebar/SidebarFilter.tsx:372`). Fix: `ui/switch.tsx` on Radix Switch with `default` and `sm` sizes; migrate. VIS +0.25.
- **VIS-10** (new) Hand-rolled badges. At least 26 `<span … rounded-full px-1.5 py-0.5>` badges bypass `Badge`. In the Settings nav alone, "OPTIONAL" is 20px tall, uppercase, borderless (`settings/SettingsSidebar.tsx:278`) and "Update available" / "Installed" are 17px, bordered, sentence case (`:176`). Fix: `Badge` variants for neutral, attention and success; one height. VIS +0.25.
- **VIS-13** (new) Card radius drift: Settings sections 14px (`SettingsSection`), right sidebar site cards 10px (`right-sidebar/site-panel-controls.tsx:64`, `rounded-lg`), the Sites "Setup isn't finished" banner 8px (`sites/SiteFinishSetupBanner.tsx:82`). The `Card` primitive is `rounded-xl`. Fix: cards and banners `rounded-xl`, or document one inset-card radius. VIS +0.25.
- **VIS-14** (new) Skeletons don't match what they stand in for: Sites action placeholders are `rounded-md` blocks (`sites/SiteLocalStackActions.tsx:23`) for pill buttons, while Settings skeletons are pills. Fix: `rounded-full` for control placeholders; one shared `Skeleton`. VIS +0.1.
- **VIS-1** (persists, much smaller) 235 raw palette classes (was 709) and 229 six-digit hex literals in `.tsx`. Fix: finish the codemod and turn on the ratchet. VIS +0.25.
- **VIS-2** (persists, smaller) No `shadow-md/lg/2xl` left, but 25 bespoke `shadow-[…]` remain, including `ui/command.tsx:65`. VIS +0.1.
- **VIS-4** (persists) Bots footer icons are 36x36 with 12px corners and 1.75 strokes; header icons are 32px round at 1.5; the row action is 28px at 4px. Code's sidebar uses 24px round ghost icons in the same positions, so switching modes resizes the chrome. (muster-bots repo.) VIS +0.25.

### 2. Typography and readability (8)

- Rendered sizes are now 11/12/13/14/16/24 in Code, Settings and Sites; `text-[10px]` and 9px are gone (36 `text-2xs` counters remain, as decided).
- **TYPE-2** (persists, small) `text-[17px]` x3 and `text-[26px]` x3. TYPE +0.1.
- **TYPE-3** (persists, small) 6 `font-bold`. TYPE +0.1.
- **TYPE-4** (new) One menu, two text sizes: VIS-12 puts 14px and 12px rows in the same sheet. Fixed by VIS-12. TYPE +0.25.
- **TYPE-5** (new) Settings search is 13px against 14px for every other `Input` (`settings/SettingsSidebar.tsx:214`); Tasks "Labels" and "Projects" triggers are 11px beside a 14px filter input in a 28px bar. Fix: 14px in fields, 13px minimum on button labels. TYPE +0.25.

### 3. Color, contrast and theming (7.5)

- **COL-4 / COL-5**: see Top findings.
- **COL-1** (partly fixed) `--ring` is now #525252 / #a3a3a3 (`main.css:254`, `:401`), so primitives pass. 23 call sites still dim it (`ring-ring/50` x12, `/30` x5, `/20` x3, `/40` x2, `/70` x1; most in `NewWorkspaceComposerCard.tsx`, `GitLabItemDialog.tsx`, `right-sidebar/pr-comment-presentation.ts`). Fix: full-opacity ring. COL +0.25.
- **COL-6** (new) Diff deletion counts in Source Control are 3.64:1 at 10px in the dark terminal-matched theme (`right-sidebar/SourceControl.tsx:8255`, `var(--git-decoration-deleted)`). Fix: lighten the dark deleted token or use `--status-danger` ink. COL +0.1.
- **COL-3** (still open) Light Bots. The host-to-webview theme sync exists (`bots/bots-host-theme.ts`) but runs on `requestAnimationFrame`, which doesn't fire while the window is hidden, so this pass could not confirm it. In one captured frame the webview had gone light but the selected bot row, the "Pepper replied" chips, the model pill and the composer buttons rendered as mid-grey blocks. Needs a real light-theme check with the window visible before COL can reach 9.

### 4. Layout, spacing and alignment (7.5)

- **LAY-1 / LAY-2** fixed: the mode toggle sits in the same place in Bots and Code, and Bots has no extra band.
- **LAY-5** (new) Rows and bands that touch their container edge. Explorer rows span the full panel width with 4px corners (`right-sidebar/FileExplorerRow.tsx:535`). The Ports popover's project bands run edge to edge inside an 8px sheet (`status-bar/PortsStatusSegment.tsx`). Fix: inset rows with the padding-plus-radius rule used by menus. LAY +0.25.
- **LAY-6** (new) Mixed control heights in one row or form. The Extensions toolbar is 30/32/32 (VIS-7). The Open workspace dialog puts a 32px, 12px project trigger (`repo/RepoCombobox.tsx:197`) over a 36px, 14px agent select. Settings fields are 36px in General and Sites, 32px in Remote Muster servers and Experimental, 28px for the Browser home page (`BrowserHomePageSetting`). Fix: one field height per surface (36px in Settings and dialogs). LAY +0.5.
- **LAY-7** (new) The Source Control filter and overflow buttons share a row at 28px but differ in radius (VIS-11).

### 5. Navigation and information architecture (7.5)

- **NAV-2**, **NAV-3**, **NAV-4** fixed (grouped Settings nav, Bots in onboarding, Sites back button).
- **NAV-1** (partly fixed) Bot settings now uses SlidersHorizontal, but the Bots footer "Apps" button uses `lucide-blocks`, the same glyph as Muster's Extensions button (`sidebar/SidebarSettingsHelpMenu.tsx:210`). (muster-bots repo.) NAV +0.25.
- **NAV-5** (new) The Settings sidebar lists every project under PROJECTS: about 255 entries after 27 settings panes, 283 buttons in the nav (`settings/SettingsSidebar.tsx:291`). The settings panes become a short header above a long scroll. Fix: one "Projects" pane with its own searchable list, or collapse the group by default and show the 5 most recent. NAV +0.5.
- **NAV-6** (new) The Help menu has three ways into onboarding: Setup guide, Explore Muster and Replay onboarding (`sidebar/SidebarSettingsHelpMenu.tsx:262-300`). Setup guide also uses the app logo there (`:263-267`) but a progress ring in the Settings nav. Fix: merge into Setup guide plus one "Tour" entry; one glyph per destination. NAV +0.25.

### 6. Interaction feedback and states (7.5)

- **FB-1** fixed (the track rings when the active segment has focus, `chat-mode/ChatModeToggle.tsx:126`). **FB-2** fixed (Settings shows a pane skeleton).
- **FB-3**: see Top findings.
- **FB-4** (new) Selecting a LocalWP site (117pacific) leaves the Local environment skeletons pulsing for over 30 seconds with no message; `loading` is `managed && detection === null` with no timeout (`sites/SiteLocalStackCard.tsx:153`). Non-LocalWP sites resolve within 3 seconds. Fix: time out after about 8 seconds into "LocalWP isn't responding" with Retry. FB +0.25, EMPTY +0.25.
- **FB-5** (new) Focus ring width is split: 101 `focus-visible:ring-1` and 120 `focus-visible:ring-2` (Input, Select and filter fields at 1px, Buttons at 2px). Fix: 2px everywhere, or document 1px for filled fields. FB +0.25.

### 7. Empty, error and onboarding states (8)

- **EMPTY-1**, **EMPTY-2**, **EMPTY-3** fixed (dev-only pnpm hint, no "Something went wrong" left, Bots failed state has its own actions).
- **EMPTY-4** (new) Raw Markdown in previews: the Agents history preview shows `**AIDC structure summary**`, and Bots activity rows show `**Pepper's guesses:**` with the asterisks. Fix: strip Markdown in one-line previews. EMPTY +0.25 (part in muster-bots).
- **EMPTY-5** (note) A "Muster hit a recoverable UI error" dialog was open at the start of the pass: `ReferenceError: panesPending is not defined` in `SettingsSection` (boundary `page.settings`), stamped 13:54 local. The current source defines it (`settings/SettingsSection.tsx:73`), and the team lead confirmed it came from an edit landing between two HMR updates during the FB-2 fix. Dismissed with "Don't send". Transient, not a finding.
- FB-4's silent LocalWP state also counts here.

### 8. Copy and microcopy (8)

- **COPY-1** to **COPY-5** largely fixed: about 83 Title Case strings remain and most are proper nouns or env var names; "..." in 3 strings; no em dashes, "please" or exclamation marks; the status bar now says "used".
- **COPY-6** (new) Worktree and workspace are mixed in one place. The row context menu is headed "Workspace" but offers "Delete worktree" and "Set parent worktree…" (`sidebar/WorktreeContextMenu.tsx:161`, `:982`). en.json has 218 strings with "worktree" and 514 with "workspace". Fix: decide the user-facing noun (workspace, with "worktree" only where Git is the subject) and sweep. COPY +0.5.
- **COPY-7** (new) Vague or clumsy strings: due date "Set…" (`activecollab-task-due-date-field.tsx:96`); context menu "Update" for editing workspace details; "Pick the ActiveCollab project this project's work lives in." (`right-sidebar/TasksPanel.tsx:98`); "Remove project from Muster" wraps to two lines in a 198px menu. Fix: "Set due date", "Edit details", "Choose the ActiveCollab project for this repo.", widen the menu. COPY +0.25.
- **COPY-8** (new) "OPTIONAL" is the only uppercase badge in the Settings nav (VIS-10). COPY +0.1.
- Residual Title Case to fix: "Copy Rel. Path to Line", "Toggle Chat UI", "Open Chat", "Blank Markdown", "New Markdown", "Option as Alt", "Append Enter". COPY +0.1.

### 9. Accessibility (7.5)

- **A11Y-1** fixed at the token level (see COL-1 for dimmed call sites). **A11Y-3** fixed (all four tablists handle arrows with roving tabindex). **A11Y-4** fixed (global reduce rule, spinners exempt, `main.css` around line 4297). **A11Y-5** fixed: no unnamed controls in Settings, Sites or Tasks, and no icon `Button` without a name in code.
- **A11Y-2** (partly fixed) `hit-area` covers the tab close, titlebar and status-bar items. 16 controls under 24px remain without it, including the sidebar live ports trigger (14x14, `WorktreeCardPortsTrigger`), Source Control "What are refs?" and "Refresh commits" (16x16, `GitHistoryPanel`) and "Generate commit message" (20x20, `CommitArea`). Fix: add `hit-area`. A11Y +0.25.
- **A11Y-6** (new) The light contrast misses in COL-4 and COL-5 and the triple ring in FB-3 count here too.

### 10. Responsiveness and polish (7.5)

- **RESP-1** and **RESP-3** fixed: Sites shows list or detail at 800px with a back control; no horizontal page scroll at 800px in Code, Sites or Settings. **RESP-2** not reproduced (no terminal overflow at 800px).
- **RESP-4** (new) Code view at 800px keeps both sidebars open (about 260px left and 220px right), leaving about 330px for the terminal. The commit placeholder wraps to two lines, "UNTRACKED FILES" wraps, and the right activity icons crowd. Fix: under about 960px, collapse the right sidebar by default (or overlay it), as Sites already does for its list. RESP +0.5.
- **RESP-5** (new) Long labels truncate inside chips: Tasks label chips read "COMPLETED ON LOC…" in the list. Fix: let label chips size to content up to a max and truncate the title instead. RESP +0.1.

## Round 1 findings verified fixed

LAY-1, LAY-2, LAY-3/RESP-1, RESP-3, NAV-2, NAV-3, NAV-4, FB-1, FB-2, EMPTY-1, EMPTY-2, EMPTY-3, A11Y-3, A11Y-4, A11Y-5, COL-2 (no `/30` left in `SidebarNav.tsx`), TYPE-1 (no 9px or 10px literals), COPY-2, COPY-3, COPY-4, COPY-5. The four issues called out before this round (segmented track radius, sidebar search style, context-menu radio dot, list hover inset) did not reappear on the surfaces checked.

Partly fixed: VIS-1, VIS-2, VIS-3 (pills mostly, but see VIS-10), COL-1/A11Y-1 (token yes, 23 dimmed call sites), A11Y-2, NAV-1, COPY-1, TYPE-2, TYPE-3.

Still open: VIS-4 (Bots chrome sizes), COL-3 (light Bots not verifiable with a hidden window), LAY-4 not rechecked.

## Already good (don't regress)

- The pill `Input`, `SelectTrigger` and `Button` read as one family in Sites detail and most of Settings.
- Menus built on `MENU_SHEET` (Help, worktree context menu, Workspace options top rows) sit close to concentric: 12px sheet, 6px padding, 8px rows.
- The segmented look (pill track, inverted selection) is consistent in the mode switch, Explorer Names/Contents, Agents history scope and Workspace options Group by.
- `ui/dialog.tsx` matches the modal spec; the Open workspace dialog uses it correctly.
- Sites at 800px is a clean master-detail layout with icon-only header actions.
- Type scale is down to six sizes in the main views.

## Round 3 notes

- The user was using the app by hand during this pass (Settings closed, right sidebar tab and window width changed). Each CDP run should snapshot state right before measuring, set its own view, set and clear any emulation size inside the same `ux.mjs` call, and afterwards restore only what the run changed, leaving the user's window size, view and tab alone. `Emulation.clearDeviceMetricsOverride` from a fresh session did not clear an override; setting the real size and then clearing did.
- The window reports hidden, so `requestAnimationFrame` work (xterm refit, Bots theme sync, one Bots frame that rendered at the wrong split) lags. Light-theme Bots needs a visible window.
- Light was simulated by removing `.dark` and stripping the terminal-matched inline variables from `html`, `.titlebar-left` and the sidebar container, then restoring them. The terminal canvas does not re-theme this way.
- Helpers for this round live in the session scratchpad under `r2/` (`all.mjs` radius and controls audit, `menu.mjs`, `lcf.mjs` contrast, `light.mjs`, `icons.js`, `cards.js`, `type.js`, `overflow.js`).
