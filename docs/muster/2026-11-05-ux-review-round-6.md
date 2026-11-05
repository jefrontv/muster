# UX review, round 6

Reviewer: independent sub-agent. Evidence is live CDP measurement of the running dev build (computed height, radius, fill, font size, icon size and stroke per control; contrast maths on composited colours, with `oklab`/`color()` values converted through a canvas; cropped screenshots at 1710px, 1560px emulated and a real 800px window) plus a code sweep against `docs/STYLEGUIDE.md`. Live passes covered Code view (titlebar, tab bar, terminal pane header, left sidebar and worktree list, status bar, Agents history, Explorer, Source Control, Checks, Tasks, Site), the new tab, quick commands, Workspace options and Help menus, the Resource manager and Ports popovers, both palettes (action palette and the ⌘J jump palette, with queries), the Setup guide, Settings (General, Appearance, Agents, Extensions, Integrations, Quick commands, SSH hosts, Remote Muster servers, the Projects group), Sites, Chat, and Bots (host and webview, 1710px and 800px, model pill after a reload).

Round 6 emphasis was the same as round 5: the same role should use the same recipe on every surface.

Limits of this pass:

- The host page reloaded once during the run (`performance.now()` went from 918s at the start to 616s at the end). Nothing in this run reloads the host page; the likely cause is a dev rebuild from parallel work. The right sidebar tab was set back to "vault" and the theme, view, window and active workspace matched the starting snapshot at the end.
- The window was not focused for most of the pass, so `:focus-visible` could not be triggered programmatically. Focus styles were checked in code (class strings and `main.css` rules), not by screenshot.
- Light was simulated the same way as rounds 3 to 5: inline terminal-matched tokens and the `dark` class removed, then restored. The terminal canvas stays dark under this simulation, so the terminal pane header glyphs read as false failures in light and are excluded.
- The Bots webview was reloaded once to time the model pill. It came back in the real (dark) theme.
- The Ports right sidebar tab rendered Explorer content when selected through the store; it has no activity bar button, so it was not scored.

## Scores

| # | Category | Round 1 | Round 2 | Round 3 | Round 4 | Round 5 | Round 6 |
|---|---|---|---|---|---|---|---|
| 1 | Visual consistency | 6 | 7 | 8 | 8.5 | 9 | 9 |
| 2 | Typography and readability | 6 | 8 | 8 | 8.5 | 8.75 | 9 |
| 3 | Color, contrast and theming | 7 | 7.5 | 8.5 | 8.5 | 8.75 | 8.75 |
| 4 | Layout, spacing and alignment | 6 (p) | 7.5 | 8 | 8.5 | 9 | 9 |
| 5 | Navigation and information architecture | 6 | 7.5 | 8.5 | 9 | 9 | 9 |
| 6 | Interaction feedback and states | 7 (p) | 7.5 | 8.5 | 8.5 | 9 | 9 |
| 7 | Empty, error and onboarding states | 7 | 8 | 8.5 | 9 | 9 | 9 |
| 8 | Copy and microcopy | 6 | 8 | 8.5 | 8.5 | 8.75 | 9 |
| 9 | Accessibility | 5 | 7.5 | 8 | 8.5 | 9 | 9 |
| 10 | Responsiveness and polish | 5 (p) | 7.5 | 8.5 | 8 | 9 | 9 |

Nine categories are at 9. Typography and Copy move up: the section label is one recipe in Settings, Chat, the Site panel and Source Control, and the ⌘J palette, sidebar search and Ports action all say "workspace". Color stays at 8.75. The round 5 failures it was held for are fixed (control icons, the Source Control arrow and count, the ports glyph, the integration chips), but the ratchet that replaced them stops at `/60`, and the `/70` and `/80` fades it leaves behind fail AA wherever they carry 11px text: every address in the Ports popover measures 3.02:1 in light. Visual consistency holds at 9 rather than rising because the round 5 cohesion fixes landed at specific call sites, not in the primitives, so the same roles still split two or three ways (hand-built icon buttons, glyph sizes per button size, hover fills).

## Top findings

Ranked by score impact.

1. **COL-11 / A11Y-10** (new) Faded muted text at `/70` and `/80` fails AA at 11px. The round 5 ratchet (`config/scripts/check-style-drift-ratchet.mjs:17`) matches `text-muted-foreground/[2-6]0` only. `/70` appears 79 times in 45 files and `/80` 31 times in 25. Measured live: the Ports popover's addresses and counts (`status-bar/ports-status-popover-rows.tsx:266`, `:314`) are 3.02:1 in light and 4.24:1 in dark; the Resource manager's "Name / CPU / Memory" headers (`status-bar/ResourceUsageStatusSegment.tsx:1405`, `:1424`, `:1441`) 3.65:1 in light; the ActiveCollab card's "Agents on this computer…" note and the MCP binary path (`settings/activecollab-agent-access.tsx:207`, `settings/activecollab-mcp-credentials-row.tsx:52`) 3.71:1 and 3.6:1 in light. The same `/70` sits on the Ports panel rows (`right-sidebar/PortsPanel.tsx:603`, `:1142`) and the Sites "Found on disk" heading (`sites/SitesPage.tsx:319`). Fix: widen the ratchet to `/[2-9]0` with a new baseline, move text uses to full `text-muted-foreground` (5.74:1 light), and keep the fade only for the decorative cases already listed in `config/faded-muted-text-baseline.txt`. COL +0.25, A11Y +0.1.
2. **VIS-28** (COL-10/A11Y-9 residual) Hand-built round icon buttons are a second icon-button recipe. The 20 `rounded-sm p-1` buttons became `rounded-full p-1` with a ring-2 focus instead of `Button variant="ghost" size="icon-xs"`, so there are now 29 of them (22px) beside the primitive's 24px, and they use three hover fills: none (`settings/activecollab-integration-card.tsx:135`, `settings/jira-integration-card.tsx:189`), `hover:bg-muted` (`settings/SettingsFormControls.tsx:797`, `:824`, `github-project/ProjectRow.tsx:132`) and `hover:bg-accent` (`right-sidebar/ChecksPanel.tsx:305`, `editor/ImageViewer.tsx:190`, `sites/SiteCustomStepList.tsx:46`), where the ghost primitive uses `/[0.07]`. In Settings > Integrations, "Disconnect ActiveCollab" measures 22px next to "More actions" buttons at 24px in the same card list. Fix: swap the 29 for the primitive and add `rounded-full p-1` to the ratchet. VIS +0.15, FB +0.05.
3. **VIS-29** (new) Two Settings selectors ignore the chip and segmented recipes. The Agents "Default agent" picker is named `DefaultAgentPill` but draws 34px bordered rectangles with 8px corners and a `bg-accent` selection (`settings/AgentsPane.tsx:666-680`); the guide says chips are `rounded-full` and selected chips invert (`bg-foreground text-background`). The terminal preview's dark/light toggle is a `rounded-md` bordered track with `rounded-sm p-1` buttons and no focus style (`settings/TerminalSettingsPreview.tsx:271`, `:294`), where every other segmented control in Settings is a pill track. Fix: make the agent picker pill chips with inverted selection, and the preview toggle the shared segmented control. VIS +0.1, A11Y +0.05.
4. **TYPE-9** (TYPE-8 residual) Three surfaces still draw their own uppercase label. The Setup guide's "SETUP" and "MILESTONES" are 12px/600/0.08em (`feature-wall/FeatureWallSetupChecklist.tsx:105`); the Resource manager groups ("AIDC", "muster-ui") are 11px/600/0.025em and its column headers 11px/400/0.025em (`status-bar/ResourceUsageStatusSegment.tsx:522`, `:700`); Sites' "Found on disk" is 11px/500/0.025em at `/70` (`sites/SitesPage.tsx:319`). Onboarding keeps 0.18em and 0.14em labels (`onboarding/OnboardingFlow.tsx:233`, `onboarding/AgentStep.tsx:281`). The code still has 77 `tracking-wide`/`tracking-wider` uppercase uses; `tracking-wider` (0.05em) matches the recipe, `tracking-wide` does not. Fix: `SECTION_LABEL` at these call sites and a ratchet on `uppercase tracking-wide\b`. TYPE +0.15, VIS +0.05.
5. **FB-8** (FB-7 residual) The tab bar's own buttons skipped the recipe the split next to them now uses. The New tab "+" is a hand-built button with `hover:bg-accent/50` and no `focus-visible` style, so focus falls back to the browser outline (`tab-bar/TabBar.tsx:1033`); the tab-strip scroll buttons pass `hover:bg-accent/50` over the ghost primitive (`tab-bar/TabBar.tsx:842`, `:1003`); and the quick commands button shown when a project has no commands is still `rounded-md` with `ring-accent` (`tab-bar/TabBarQuickCommandsButton.tsx:148`). In Bots, the round "More" glyph sits inside a square `w-full` button (`muster-bots/src/components/ChatMoreMenu.tsx:157`, `:218`), so its focus mark is square. Fix: ghost `Button` `icon-sm`/`xs` for all three tab bar controls; move the round class onto the Bots button. FB +0.1, A11Y +0.05.
6. **VIS-27** still partly open: glyph size per button size is not encoded anywhere. The activity bar and Bots header now carry 14px in 28px. Elsewhere, 24px buttons carry 12px (Agents history "view options", "Refresh") or 14px (Source Control rows, Integrations "More actions", sidebar footer), 32px Settings buttons carry 12px ("Zoom in"), 14px ("Import…") or 16px ("Import from Warp", "Previous icon") in one Appearance pane, and Bots message actions are 28px with 16 to 17px glyphs at 1.5 stroke. Stroke overrides remain on the Chat sidebar's Tasks nav (1.75) and the terminal pane header (2.75, `assets/terminal.css:428-433`, upstream, with a reason comment). Fix: set the glyph size in the `Button` size variants (12px for `xs`/`icon-xs`, 14px for 28px, 16px for `sm`/`icon-sm`) and drop call-site sizes. VIS +0.1.
7. **COPY-12** (new) Agents history rows show the raw model id. The only row reads "Claude · 13 msgs · 1d ago · claude-sonnet-5-5" (`right-sidebar/ai-vault-session-row-display.tsx:43`, `:95`), where the Bots pill and the Chat composer show friendly names ("Claude Opus 5.5", "Sonnet"). Its title is still the injected "Current time when this message was sent: Wednesda…". Fix: reuse the friendly model label, and title rows from the first user message after injected context. COPY +0.1, EMPTY +0.05.
8. **LAY-11** (round 5 residual, unchanged) Settings section actions use three heights: SSH hosts "Import" and "Add target" 24px, Quick commands "Add command" 32px, Remote Muster servers "Add server" 36px. The Remote Muster servers pane alone has refresh icon buttons at 36, 32 and 24px. The Setup guide header puts 24px text pills ("Explore Muster", "Replay onboarding") beside 28px icon buttons. Fix: section-header actions at `size="sm"` (32px); one refresh size per pane. LAY +0.1.

## Findings by category

### 1. Visual consistency (9)

- **VIS-28**, **VIS-29**, **VIS-27**: see Top findings.
- **VIS-25** fixed: integration cards render `IntegrationStatusPill` (`settings/integration-card-shell.tsx:24`). Every badge on the Integrations and Extensions panes measures 20px; "Connected" 6.21:1, "Setup needed" and "Not installed" 6.15:1 in light.
- **VIS-26** partly fixed: `ROW_HOVER` and `CONTROL_HOVER` exist (`ui/hover-fill-classes.ts`) and the activity bar and Chat thread rows use them; the ratchet passes. Only 5 files use the constants. Visible splits remain in the chrome: the New tab button and tab scroll buttons hover at `accent/50` beside the quick commands split at `/[0.07]` (FB-8); the Agents history header's host and view-options buttons hover `bg-sidebar-accent` beside "Refresh" at `/[0.07]`. Top counts: `hover:bg-accent` 180, `muted/50` 69, `muted` 48, `foreground/[0.07]` 39, `accent/40` 27, `muted/60` 24, `muted/40` 24.
- **VIS-11** fixed in the populated case: the quick commands split is a 28px `rounded-full` track with `rounded-l-full`/`rounded-r-full` halves; status bar items are pills. The no-commands button is the residual (FB-8).
- The Setup guide step list still draws every step as a bordered, filled 43px card with 8px corners.
- **VIS-1** my count of raw palette classes in `components/` is 161 with a broader regex than round 5's; treat it as a new baseline, not a drop. **VIS-2** 23 `shadow-[…]`. Odd `rounded-[5|6|7px]` 32.
- Skeletons agree: 67 of 92 `animate-pulse` uses are `bg-foreground/[0.07]`, 63 of them `rounded-full`. There is no `ui/skeleton` primitive.

### 2. Typography and readability (9)

- **TYPE-9**: see Top findings.
- **TYPE-8** mostly fixed and measured live: Code sidebar "PROJECTS", Source Control "CHANGES" and "UNTRACKED FILES", Settings nav groups ("AGENTS", "APP", "WORKSPACES", "INTEGRATIONS", "ADVANCED", "PROJECTS 256"), Chat's "WORKSPACES" and "CHATS", and the Site panel's "LOCAL", "ENVIRONMENT", "IMPORT STEPS" and "DEPLOY STEPS" are all 11px/600/0.05em. Odd tracking literals dropped to `0.18em` 2, `0.14em` 1, `0.08em` 1 (from 5, 3 and 11).
- The Quick commands filter is now 36px but is an outline `Button` at 13px with a 50% chevron (`settings/QuickCommandsScopeFilter.tsx:72-84`), where other Settings selects are the borderless `bg-foreground/[0.05]` trigger at 14px.
- Settings "Filter projects" has its search glyph (`settings/settings-projects-nav.tsx:99`).

### 3. Color, contrast and theming (8.75)

- **COL-11**: see Top findings.
- **COL-12** (new, small) The Bots role chip "Chief of Staff" is `text-accent` on `bg-accent/12` at 11px: 3.64:1 in light (`muster-bots/src/components/BotRole.tsx:29`). It passes in dark. Fix: an `-ink` accent for text on the tint. COL +0.05.
- **COL-10** fixed for contrast: control icons that were `/50` are full `text-muted-foreground`; no control glyph under 3:1 on the Integrations, Agents, General or Sites panes in light.
- Round 5 small misses fixed: Source Control "→ origin/master" 15.33:1 and "↓3" 7.16:1 in light, the "7 live ports" glyph 5.27:1 in light.
- Chat composer chevrons (`text-chat-ink-caption`) are 2.52:1 light and 2.94:1 dark inside chips that carry their own label; decorative, noted only.
- Theme sync holds: the Bots webview followed the simulated light theme on the host within a second.

### 4. Layout, spacing and alignment (9)

- **LAY-11**: see Top findings.
- **LAY-10** fixed: "Hide checklist from sidebar" (x 1318 to 1346) and Close (x 1350 to 1378) share one `flex gap-1` slot (`setup-guide/SetupGuideModal.tsx:124`) with a 4px gap and no overlap.
- No horizontal scroll at a real 800px window in Code (status bar items laid out 12 to 788 with no overlaps) or Bots, nor at an emulated 800px in Settings (`scrollWidth` 800 each time).

### 5. Navigation and information architecture (9)

- **NAV-5** still open: the Projects group preview is store order sliced at 12 (`settings/settings-projects-nav.tsx:68`). It reads "117pacific, 201-charlotte, adamson-eoi, aliro, …", which looks alphabetical, but the active project "aidc" sorts between "adamson-eoi" and "aliro" and is not in the preview.
- The mode switch shows "Chat | Bots | Code" on the Chat page and "Bots | Code" in Code and Sites while `experimentalChatMode` is off (`chat-mode/ChatModeToggle.tsx:47`). This only shows when Chat is reached with the flag off; noted, not scored.
- Help menu complete and on the menu recipe (12px corners, 6px padding, 30px rows, 14px glyphs at 1.5).

### 6. Interaction feedback and states (9)

- **FB-8**: see Top findings.
- **FB-7** fixed: every status bar item (Usage, Refresh rate limits, Resource manager, Ports, Remote host) is a pill with `hover:bg-foreground/[0.07]` and `focus-visible:ring-2`; the quick commands halves carry the same.
- **A11Y-8** holds: from the active AIDC row, ArrowDown ×3, ArrowUp, Home, End moved `aria-activedescendant` through muster-ui, feature/muster-bots, muster-open-test, back, AIDC and muster-open-test; the active workspace never changed and focus stayed on the tree.

### 7. Empty, error and onboarding states (9)

- The Setup guide opens with focus on the current step ("Give your agents site tools"), which also carries `aria-current`.
- Still open: the Agents history row's injected title (COPY-12).
- Checks still shows "On the default branch / Switch to a feature branch before creating a pull request." (EMPTY-7 skipped by decision).

### 8. Copy and microcopy (9)

- **COPY-12**: see Top findings.
- **COPY-11** fixed and checked live: the ⌘J placeholder is "Search workspaces, settings, tabs, and actions…", a query with no match offers `Create workspace "zzqx"`, the group header string is "Recent workspaces" (`WorktreeJumpPalette.tsx:983`), the sidebar search is "Search workspaces and…", and the Ports action is "Go to workspace" (`status-bar/ports-status-popover-rows.tsx:307`).
- Palette details fixed: the tag reads "Shows shortcut" (`action-palette/ActionPaletteRow.tsx:42`) and the keybinding title is "Open Markdown tab" (`shared/keybindings.ts:592`).
- `en.json` holds 197 values containing "worktree" (206 in round 5); most are Git-specific.

### 9. Accessibility (9)

- **COL-11 / A11Y-10**, **VIS-29** and **FB-8**: see Top findings.
- **A11Y-9** fixed in part: the hand-built icon buttons now carry `focus-visible:ring-2` and pass 3:1; they are still not the primitive (VIS-28).
- (new, small) The worktree tree has one extra tab stop: the 14px "7 live ports" button in the muster-ui row (`sidebar/WorktreeCardPorts.tsx:42-55`). A `role="tree"` widget should be one tab stop, and the button's click only records a feature interaction. Fix: `tabIndex={-1}`, since the details show on hover and in the Ports popover. A11Y +0.05.

### 10. Responsiveness and polish (9)

- **RESP-6** holds. Two real cycles from Code (`window.resizeTo(800)`, 1.5s, back to 1710, 2.6s, then a 1s check): fold at 147ms, unfold at 1622ms, fold at 4160ms, unfold at 5635ms, no later write. A third cycle ran entirely inside Settings: fold at 1430ms, unfold at 2987ms, and closing Settings returned to Code with the sidebar open. The window stayed at x=0, y=39, 1710x989.
- **RESP-7** holds: at a real 800px window the Bots sidebar is an 80px rail; at 1710px it is 325px again.
- Bots model pill after a webview reload: no pill until the document completed (3.97s on this loaded machine), then "Claude Opus 5.5" at 4.78s. The raw id never appeared.

## Round 5 findings verified

Fixed and checked live: COPY-11 (palette placeholder, create row, sidebar search, Ports action; header string in code), VIS-25 (Badge on integration cards, 6.15 to 6.21:1 light), FB-7 (status bar pills with ring-2, populated quick commands split `rounded-full`), LAY-10 (one header slot, focus on the current step), the round 5 small contrast misses (Source Control arrow and count, ports glyph), palette "Shows shortcut" and "Open Markdown tab", Remote Muster servers "Advanced" at the 13px button size, Settings "Filter projects" glyph, the Code sidebar nav stroke (Sites and Tasks at 2px).

Mostly fixed: TYPE-8 (one live recipe in Settings, Chat, Site panel and Source Control; Setup guide, Resource manager, Sites "Found on disk" and onboarding are the residual, TYPE-9).

Partly fixed: COL-10 / A11Y-9 (contrast and focus ring fixed, primitive not adopted, three hover fills, 22px against 24px: VIS-28; the ratchet stops at `/60`: COL-11), VIS-26 (constants and ratchet in place, 5 files use them), VIS-27 (activity bar and Bots header fixed, no rule in the primitive), the Quick commands filter (36px, still an outline button at 13px).

Still open: NAV-5 (store order), the Agents history injected title, Settings section action heights 24/32/36 (LAY-11), Setup guide bordered step cards, VIS-1, VIS-2.

Skipped by decision: EMPTY-7.

## Already good (don't regress)

- One section label (11px, 600, 0.05em, muted) across the Code sidebar, Source Control, Settings nav, Chat and the Site panel.
- One status chip: the 20px `Badge` on Settings nav, extension cards and integration cards, all above 4.5:1 in light.
- One floating surface: Help, new tab and quick commands menus at 12px corners, 6px padding, 30px rows; Ports and Resource manager popovers at 12px corners and an opaque fill; palettes and the Setup guide at 16px.
- Status bar and titlebar chrome: pills, `/[0.07]` hover, ring-2 focus; the activity bar is 28px round with 14px glyphs and `aria-pressed`.
- The narrow-window fold is owned by the non-persisted `rightSidebarAutoFolded` flag and survives full-page views.
