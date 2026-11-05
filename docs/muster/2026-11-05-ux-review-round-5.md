# UX review, round 5

Reviewer: independent sub-agent. Evidence is live CDP measurement of the running dev build (computed height, radius, fill, font size, icon size and stroke per control; contrast maths on composited colours, with `oklab`/`color()` values converted through a canvas; screenshots at 1710px, 1560px emulated and a real 800px window) plus a code sweep against `docs/STYLEGUIDE.md`. Live passes covered Code view (titlebar, tab bar, left sidebar and worktree list, Agents history, Explorer, Source Control, Checks, Tasks, Site), the new tab, quick commands, Workspace options and Help menus, the Resource manager and Ports popovers, both palettes (action palette and the ⌘J jump palette), the Add project dialog, the Setup guide, Settings (General, Appearance, Agents, Extensions, Integrations, Quick commands, Remote Muster servers, SSH hosts, the Projects group), Sites, Chat, and Bots (host and webview, 1710px and 800px, model pill after a reload).

Round 5 emphasis was cohesion: the same role should use the same recipe on every surface.

Limits of this pass:

- The window reported `visibilityState: "hidden"` for the first part of the pass, so static checks ran first. By the time of the resize and keyboard checks it was visible.
- The host page reloaded once during the run (a snapshot showed `performance.now()` at 27s). Nothing in this run reloads the host page, so the likely cause is a dev rebuild from parallel work. It reset the persisted right sidebar tab to "site" (left over from a panel check); it was set back to "vault".
- Light was simulated the same way as rounds 3 and 4: inline terminal-matched tokens and the `dark` class removed, then restored. Opening a full-page view re-applies the theme, so light was re-applied after each view switch.
- The Bots webview was reloaded three times to time the model pill. It came back in the real (dark) theme each time.

## Scores

| # | Category | Round 1 | Round 2 | Round 3 | Round 4 | Round 5 |
|---|---|---|---|---|---|---|
| 1 | Visual consistency | 6 | 7 | 8 | 8.5 | 9 |
| 2 | Typography and readability | 6 | 8 | 8 | 8.5 | 8.75 |
| 3 | Color, contrast and theming | 7 | 7.5 | 8.5 | 8.5 | 8.75 |
| 4 | Layout, spacing and alignment | 6 (p) | 7.5 | 8 | 8.5 | 9 |
| 5 | Navigation and information architecture | 6 | 7.5 | 8.5 | 9 | 9 |
| 6 | Interaction feedback and states | 7 (p) | 7.5 | 8.5 | 8.5 | 9 |
| 7 | Empty, error and onboarding states | 7 | 8 | 8.5 | 9 | 9 |
| 8 | Copy and microcopy | 6 | 8 | 8.5 | 8.5 | 8.75 |
| 9 | Accessibility | 5 | 7.5 | 8 | 8.5 | 9 |
| 10 | Responsiveness and polish | 5 (p) | 7.5 | 8.5 | 8 | 9 |

Quarter points mark categories where the round 4 finding is fixed but a measured residual keeps a half point from being honest.

Seven categories reach 9. Every round 4 top finding is fixed or mostly fixed and checked live: the right sidebar folds and returns through three real 800px cycles (one entirely inside Settings), arrows move the worktree cursor without switching workspace, the activity bar is the round 28px recipe with a fill and `aria-pressed`, the mode switch and Chat labels clear AA, the Add project cards share 14px corners, the new tab menu is the shared sheet, the Bots header is 28px round and the model pill never shows the raw id. What holds Typography, Color and Copy below 9 is a short list: three uppercase-label recipes, a hand-rolled icon button that fails 3:1, a third status-chip recipe on the integration cards, and the ⌘J palette, which still says "worktree" throughout.

## Top findings

Ranked by score impact.

1. **COL-10 / A11Y-9** (new) Hand-rolled icon buttons below 3:1 with no focus ring. "Disconnect ActiveCollab" in Settings > Integrations is `rounded-md p-1 text-muted-foreground/50` (`settings/activecollab-integration-card.tsx:135`): 22px, 8px corners, icon contrast 2.08:1 in light and 2.82:1 in dark (fails 1.4.11), and no `focus-visible` style, so focus falls back to the browser outline. The same `rounded-sm p-1` hand-rolled button appears 20 times in `components/`, including the font field's "Clear font selection" and "Toggle font suggestions" (`settings/SettingsFormControls.tsx:797`, `:824`, measured 22px with 4px corners beside 36px pill fields). The faded-muted pattern behind the contrast failure is wide: `text-muted-foreground/40` to `/60` appears 89 times in 44 files. Fix: `Button variant="ghost" size="icon-xs"` for these (round, focus ring from the primitive), full `text-muted-foreground` for any icon that is a control, and a ratchet on `text-muted-foreground/[2-6]0` like the palette ratchet. COL +0.25, A11Y +0.25, VIS +0.1.
2. **COPY-11** (COPY-10 partly fixed) The ⌘J palette still says "worktree". The action palette is clean ("Switch workspace", "Next workspace", "Rename workspace", "Focus workspace list", and no "Global" descriptions), but "Switch workspace ⌘J" opens a palette whose placeholder is "Search worktrees, settings, tabs, and actions…" (`WorktreeJumpPalette.tsx:1574`, `:1588`), whose group header is "Recent worktrees" (`:983`), and whose first row for any query is `Create worktree "…"` (`:1652`) while the action palette offers "Create workspace" for the same thing. The sidebar search's accessible name is "Search worktrees and browser tabs" (`sidebar/SidebarNav.tsx:258`) and the Ports popover's row action is "Go to worktree" (`status-bar/ports-status-popover-rows.tsx:307`). Two smaller copy points in the action palette: the trailing "Shortcut" tag (`action-palette/ActionPaletteRow.tsx:42`) shows on "Next workspace" but not "Switch workspace", and nothing says it means "shows the shortcut instead of running"; and "Open markdown tab" (`shared/keybindings.ts:592`) sits beside "New Markdown file" and "Show Markdown preview" (`:815`). Fix: "workspace" in the five strings above; drop the "Shortcut" tag or say "Shows shortcut"; capitalise Markdown. COPY +0.5.
3. **TYPE-8** (new) Uppercase section labels use three recipes. Left sidebar "PROJECTS" and Source Control "CHANGES" are 11px, 600, 0.05em (the guide's recipe); the Site panel's "LOCAL" and "ENVIRONMENT" are 11px, 500, 0.05em; Settings nav groups ("AGENTS", "APP", "PROJECTS 256") are 11px, 500, 0.18em (`settings/SettingsSidebar.tsx:238`, `settings/settings-projects-nav.tsx:82`); Chat's "WORKSPACES" and "CHATS" are 11px, 600, 0.08em (`chat-mode/chat-sidebar-hierarchy.ts:12`, open since round 4). The code has 12 distinct uppercase tracking values (`tracking-[0.05em]` 37, `[0.08em]` 11, `[0.18em]` 5, `[0.16em]` 4, `[0.12em]` 4, `[0.14em]` 3, and others), plus 86 `tracking-wide`/`tracking-wider`. The Settings labels sit next to the Code sidebar in the same window, so the difference is visible. Fix: one `SECTION_LABEL` class (11px, `font-semibold`, uppercase, `tracking-[0.05em]`, `text-muted-foreground`) used by Settings, Chat, the Site panel and Source Control. TYPE +0.25, VIS +0.1.
4. **FB-7** (FB-6 and VIS-11 residual) The status bar and the quick commands split are the last chrome on the old recipe. Status bar items are `rounded px-1 py-0.5 hover:bg-accent/70` (`status-bar/StatusBar.tsx:2296`, 9 such items in `status-bar/`): 4px rectangles with no `focus-visible` style, so "Usage" measured the browser's `auto 1px` outline when focused. The quick commands split next to the round tab-bar buttons is still `rounded-md` (`tab-bar/TabBarQuickCommandsMenu.tsx:207`, `:218`, `:269`, measured 26px with 8px corners), where the Sites "Add to sidebar" split is a pill. Fix: status items take the ghost `Button` `xs` recipe (pill, `/[0.07]` hover, ring-2 focus); the split becomes `rounded-full` with `rounded-l-full`/`rounded-r-full` halves. FB +0.1, VIS +0.1, A11Y +0.1.
5. **VIS-25** (VIS-23 partly fixed) A third status-chip recipe. Extension cards and Settings nav now share the 20px `Badge` (measured 20px/11px in both, contrast 4.56 to 6.21:1 in light). The integration cards do not: `IntegrationCardShell` draws its own span, `rounded-full border px-2.5 py-1 text-[11px]` with `text-status-success`/`text-status-attention` rather than the `-ink` tokens the Badge uses (`settings/integration-card-shell.tsx:7-11`, `:31`). In light, "Connected" measures 4.37:1, "Setup needed" 4.35:1 and "Not installed" 4.35:1 at 11px, just under AA. Fix: render `IntegrationStatusPill` (which rides the Badge) in the shell. VIS +0.1, COL +0.1.
6. **VIS-26** (new) Hover fills have no single recipe. The guide names two (rows `bg-accent`, ghost controls `bg-foreground/[0.07]`); the code uses at least 16: `hover:bg-accent` 180, `hover:bg-muted/50` 69, `hover:bg-muted` 50, `hover:bg-accent/40` 27, `hover:bg-muted/60` 26, `hover:bg-muted/40` 24, `hover:bg-foreground/[0.07]` 23, `hover:bg-accent/70` 21, `hover:bg-accent/50` 17, and smaller counts. Two visible cases: the activity bar hovers at `/[0.05]` (`right-sidebar/activity-bar-buttons.tsx:66`, `:133`) beside titlebar buttons at 7%, and Chat thread rows hover `bg-muted/60` (`chat-mode/ChatThreadRow.tsx:215-216`) where worktree rows use the sidebar accent. Fix: move the two documented recipes into constants and ratchet the rest down. VIS +0.1.
7. **LAY-10** (new) The Setup guide header crowds its corner. "Hide checklist from sidebar" is an `icon-xs` button placed with `absolute right-10 top-3.5` (`setup-guide/SetupGuideModal.tsx:123`); measured at x 1330 to 1354 against the Close button at 1350 to 1378, so the two hit areas overlap by 4px and read as one cluster. The dialog also opens with the focus ring on "Hide checklist", the least likely first action. Fix: put both in a `flex gap-1` header slot, and set initial focus on the current step. LAY +0.1, EMPTY +0.1.
8. **VIS-27** (new, small) 28px icon buttons carry two glyph sizes in one header row. The titlebar, tab bar and Source Control header use 14px glyphs; the activity bar beside them uses 16px (`right-sidebar/activity-bar-buttons.tsx:74`, `:139`), as do the Bots header buttons. The Bots sidebar mixes 24px buttons with 16px glyphs and 28px buttons with 14px glyphs ("New thread", "New folder"). Fix: one glyph size per button size (14px in 28px, 12px in 24px), set in the `Button` size variants. VIS +0.1.

## Findings by category

### 1. Visual consistency (9)

- **VIS-25**, **VIS-26**, **VIS-27**: see Top findings.
- **VIS-19** fixed: the six activity bar buttons are 28px round, 16px glyphs at stroke 2, selected `bg-foreground/[0.07]` (composited 44,44,43 in dark), `aria-pressed`, `focus-visible:ring-2`. They are hand-rolled (`ACTIVITY_BUTTON_CLASS`, `activity-bar-buttons.tsx:40-41`) rather than the `Button` primitive, which is why their hover differs (VIS-26).
- **VIS-20** fixed: the primary "Browse folder" card and the "Other ways to add" group both measure 14px corners.
- **VIS-21** fixed: the new tab menu is the shared sheet (12px corners, 6px padding, 30px rows at 14px, 1.5 strokes) with a 32px pill search and icon; Workspace options, sidebar filter and quick commands use `CommandInput` with no wrapper overrides; the Tasks project picker is a pill with no bordered wrapper; Explorer's query uses `SEARCH_FIELD_SHELL`. The new tab search copies the pill by hand (`tab-bar/TabBarCreateEntry.tsx:265`) instead of using `CommandInput`; it measures the same.
- **VIS-22** fixed: Bots "Bot's screen" and "More" are 28px round with 16px glyphs; bot rows are 8px corners.
- **VIS-23** partly fixed: Badge on extension cards (20px) and "Review inactive workspaces" is a 32px pill outline button. Integration cards are the residual (VIS-25).
- **VIS-24** fixed: Chat's "No workspace" and model chips are 28px pills; send is the foreground pill (`rgb(10,10,10)` light, `#eeece2` dark, 34px).
- **VIS-11** partly fixed, unchanged since round 4: quick commands split 8px, status bar 4px (FB-7).
- Settings pane action buttons use three heights in section headers: SSH hosts "Import" and "Add target" 24px, General "Reset all confirmations" and Quick commands "Add command" 32px, Remote Muster servers "Add server" 36px.
- The Setup guide step list draws every step as a bordered, filled card (43px, 8px corners, 1px border), where Settings nav and the worktree list keep idle rows transparent.
- **VIS-1** 261 raw palette classes in `components/` (261 in round 4). **VIS-2** 20 bespoke `shadow-[…]` in 13 files (unchanged). Odd `rounded-[5|6|7px]` literals 32 (35 in round 4).
- Selected fills agree in practice: worktree card 50,50,49, Settings nav 48,48,48, activity bar 44,44,43 in dark.

### 2. Typography and readability (8.75)

- **TYPE-8**: see Top findings.
- **TYPE-7** fixed: Source Control "Stage all" and "Create PR" are 24px at 12px, the Agents history "Local Mac" pill is 12px, Workspace options "Clear" is `text-xs`, and the worktree context menu has no 11px label left.
- Settings > Quick commands filters with a 32px select at 12px ("All commands"), where every other Settings select is 36px at 14px. Remote Muster servers' "Advanced" button is 36px at 12px.
- Settings > Projects "Filter projects" is a 28px pill with no search glyph; the Workspace options field with the same placeholder has one.

### 3. Color, contrast and theming (8.75)

- **COL-10** and **VIS-25**: see Top findings.
- **COL-9** fixed: mode switch inactive labels `text-foreground/70`, "Bots" 7.05:1 in light; Chat "WORKSPACES"/"CHATS" 5.5:1 light, 7.88:1 dark; idle thread rows 5.5:1; composer "Medium" 4.74:1 light, 5.52:1 dark.
- Activity bar inactive icons 4.48:1 on the light header, 7.97:1 dark.
- Still open from round 4: Source Control `→` before "origin/master" 2.95:1 and the 10px count "1" 3.6:1 in light. New small: the "7 live ports" glyph in the left sidebar is 2.88:1 in light.
- Theme sync: the Bots webview followed the host to light within the pass and came back dark after reload.

### 4. Layout, spacing and alignment (9)

- **LAY-10**: see Top findings.
- **LAY-9** fixed: every SSH host row button is 28px.
- No horizontal page scroll at a real 800px window in Code, Settings or Bots (`scrollWidth` 800).

### 5. Navigation and information architecture (9)

- **NAV-5** still small-open: the Projects group preview is the store order, not alphabetical; it happens to start "117pacific, 201-charlotte, adamson-eoi, aliro" because older projects were added in order, and "aidc" is not among the 12. The store also holds two projects for `/Users/jakevarrese/Sites/aidc` ("AIDC" and "aidc"), which may be data rather than UI.
- Help menu unchanged and complete (Keyboard shortcuts, Send feedback, Setup guide, GitHub, Check for updates).

### 6. Interaction feedback and states (9)

- **FB-7**: see Top findings.
- **A11Y-8** fixed (also FB-3): from the active AIDC row, ArrowDown, ArrowDown, ArrowDown, ArrowUp moved `aria-activedescendant` through muster-ui, its workspace, muster-open-test and back; the active workspace never changed, focus stayed on the tree, and only the cursor row carried an outline (2px `--ring`). The 1px active-card outline is gone. Workspace titles add no tab stops (0 elements with `tabIndex >= 0` inside the tree).
- **FB-6** mostly fixed: Sites and Tasks nav and the Agents history group headers have `focus-visible:ring-2`; the titlebar buttons get a 2px ring from `.sidebar-toggle:focus-visible` (`assets/main.css:1178`). The status bar is the residual.

### 7. Empty, error and onboarding states (9)

- **LAY-10** touches the Setup guide.
- Still open: the only Agents history row is titled "Current time when this message was sent: Wednesda…", injected context rather than the request.
- Checks shows "On the default branch / Switch to a feature branch before creating a pull request." as before (EMPTY-7 skipped by decision).

### 8. Copy and microcopy (8.75)

- **COPY-11**: see Top findings.
- Fixed: the five keybinding titles say "workspace"; "Resume in workspace"; the tree's `aria-label` is "Workspaces"; command rows no longer show "Global"; "Copy relative path to line", "Toggle chat UI", "Open chat", "Use Option as Alt" and "Send Enter" are in place ("Blank Markdown" kept on purpose). Palette rows now truncate the description first ("Create an untitled markdown fi…" with the title intact).
- `en.json` still has 206 values containing "worktree"; many are internal or Git-specific, but the five in COPY-11 are on screen.

### 9. Accessibility (9)

- **A11Y-9** (with COL-10) and **FB-7**: see Top findings.
- **A11Y-8** fixed (above). Activity bar exposes `aria-pressed`; the worktree tree keeps `role="tree"` with `aria-activedescendant`.

### 10. Responsiveness and polish (9)

- **RESP-6** fixed. Two real cycles from Code (`window.resizeTo(800)` then back to 1710, 3s after each widen, a further 1s check): the store trace was fold at 55ms, unfold at 2024ms, fold at 6037ms, unfold at 8033ms, with no later write. A third cycle narrowed in Code, opened Settings at 800px and widened there: the sidebar flag came back open. A fourth cycle ran entirely inside Settings and returned to Code with the sidebar open. The window stayed at x=0, y=39, 1710x989 throughout.
- **RESP-7** fixed: at a real 800px window the Bots sidebar is an 80px rail and the game table reads in four columns; at 1710px it is 325px again.
- Bots model pill after reload, polled every 100ms: no pill until 1.08s, then "Claude Opus 5.5". The raw id never appeared.

## Round 4 findings verified

Fixed and checked live: RESP-6 (four real cycles including Settings), A11Y-8 (arrow walk, workspace unchanged, one 2px mark, no title tab stops), VIS-19 (28px round, fill, `aria-pressed`, ring), COL-9 (all four labels above 4.5:1 in both themes), VIS-20 (14px both cards), VIS-21 (new tab sheet, `CommandInput` call sites, Explorer shell, Tasks picker), VIS-22 (Bots header 28px, rows 8px, model pill never shows the id), VIS-24 (chips and send), TYPE-7 (12px floor on the four controls), LAY-9 (SSH buttons 28px), RESP-7 (80px rail), palette description truncation, "Global" descriptions removed, round 2 copy residuals.

Partly fixed: COPY-10 (action palette and keybindings fixed; ⌘J palette, sidebar search label and Ports action still say worktree, COPY-11), VIS-23 (Badge on extension cards and settings nav; integration cards keep their own chip, VIS-25), FB-6 (sidebar nav and group headers fixed; status bar items have no focus style, FB-7).

Still open: VIS-11 (quick commands split 8px, status bar 4px), the Code sidebar nav stroke override (Sites and Tasks at 1.75 idle, 2.25 active, `sidebar/SidebarNav.tsx:181`, `sidebar/SidebarTaskNavButton.tsx:221`, against 2 everywhere else), Chat's 0.08em label tracking (now part of TYPE-8), Source Control `→` and count contrast, NAV-5 ordering, the Agents history injected title, VIS-1 (261), VIS-2 (20).

Fixed in code, not seen live: EMPTY-6 (a terminal was running).

Skipped by decision: EMPTY-7.

## Already good (don't regress)

- One floating surface: new tab, quick commands, Workspace options and Help menus and the Resource manager and Ports popovers all measure 12px corners and an opaque fill; palettes and dialogs 16px with 24px padding.
- One field recipe: every search field is a `bg-foreground/[0.05]` pill with a ring-2 focus, at 28px in panels, 32px in sidebars and menus, 36px on pages.
- Segmented controls: 36px and 28px tracks with inverted selection in the mode switch, Settings, Agents history, Explorer and Workspace options.
- Badges: 20px, 11px, pill, 4.56:1 or better in light, in Settings nav and on extension cards.
- The narrow-window fold is now owned by a non-persisted flag in the store and a hook in `App.tsx`; it survives full-page views and a UI-state hydrate.
