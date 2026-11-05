# UX loop, round 3 fix plan

Source: `docs/muster/2026-11-05-ux-review-round-3.md`. Round 3 scores: Visual 8, Type 8, Color 8.5, Layout 8, Nav 8.5, Feedback 8.5, Empty/error 8.5, Copy 8.5, A11y 8, Responsive 8. Nothing is at 9 yet. The floating surfaces are now one family. What holds the rest back is a second tier of shared components (Settings segmented control, `CommandInput`, tab bar menus, select text size) that still carry the old recipe, plus two contrast failures in primitives.

Two items come from outside the review: a bug in the round 2 narrow-window collapse (item 15) and the Agent activity sort question raised on 2026-11-05 (item 16).

## Phase H: primitives (about 3 h)

1. **Settings segmented control (VIS-15).** `SettingsSegmentedControl` (`settings/SettingsFormControls.tsx:162`) is rebuilt on `ToggleGroup variant="segmented"`: pill track with `SEGMENTED_TRACK`, pill segments, inverted selection. All 27 call sites follow, including the Appearance Theme picker. No call-site changes beyond props.
2. **Switch off state (A11Y-7, COL-7).** `ui/switch.tsx` off track moves from `bg-muted-foreground/30` to a token that clears 3:1 against card and background in both themes (target about 3.2:1), and the thumb gets a hairline so on and off differ by more than position. Add the measured ratios as a comment.
3. **Placeholder contrast (COL-8).** `Input`, `Textarea` and `SEARCH_FIELD_INPUT` use full `placeholder:text-muted-foreground`. Sweep the remaining `placeholder:text-muted-foreground/NN` call sites onto the same value.
4. **Segmented size (LAY-8).** `toggleVariants` segmented variant stops inheriting the default `h-9`, so segments fill their track. Fixes the Extensions toolbar overflow (36px segments in a 32px track).
5. **`CommandInput` default (VIS-16).** `ui/command.tsx` default becomes the pill search field the palettes already use; the descendant-selector overrides in `CommandDialog` go. About 20 pickers pick it up.
6. **Select text size (TYPE-6, TYPE-5).** Strip the 21 `text-xs` overrides on `SelectTrigger` so selects match the 14px primitive. Settings search moves to the primitive size. Search fields settle on two pairs: 28px/12px for panel filters, 36px/14px for page search.
7. **Tab bar menus (VIS-17).** `tab-bar/QuickLaunchButton.tsx` and `TabBar.tsx` menus use `MENU_ROW` and `MENU_LABEL`; row buttons become round icon-xs.

## Phase I: sweeps (about 2 h)

8. **Control heights in Settings rows (LAY-6, LAY-8).** Browse, Remote servers and Experimental rows use the 36px field height like their neighbours.
9. **Title Case commands (COPY-9, COPY-6).** The 17 Title Case titles in `shared/keybindings.ts` go sentence case. Palette and Landing use "workspace" for the user-facing noun ("Create workspace", "Move workspace up"). Chat "Search..." and "Start a chat..." use "…".
10. **Titlebar buttons (VIS-11).** `.sidebar-toggle` and `.sidebar-toggle-compact` become one size (28px, 14px icon). Icon stroke is 2 for app chrome; the Code sidebar nav and mode switch stop overriding it.
11. **Small contrast fixes (COL).** Gitignored Explorer rows, the Source Control ref chip and Tasks "No due date" clear 4.5:1.
12. **Palette group labels (TYPE).** Palette headings use `MENU_LABEL` (12px sentence case) like menus.
13. **Setup guide rows (VIS-18).** Selection is the fill alone on 8px rows, like other lists.

## Phase J: content and behaviour (about 2.5 h)

14. **Empty states (EMPTY-6, EMPTY-7).** Resource manager says "No workspace processes running" when only Muster itself is listed. The Checks empty state uses the centred icon, title and help line like Explorer.
15. **Narrow-window restore (RESP-4).** Under size emulation the right sidebar collapsed at 800px and did not reopen on widening. Reproduce with a real window resize, and fix the controller if it misses the widen (likely cause: the hook remounts with the narrow state lost, or the open effect treats our own close as a user toggle). Add a test for the case found.
16. **Agent activity sort.** A finished (`done`) agent outranks working ones for 30 minutes after it finishes, or until its workspace is opened, whichever comes first. After that it ranks with idle workspaces by recency. Blocked and waiting stay on top. Tests in `smart-sort` and `smart-attention`.
17. **Settings Projects group (NAV-5).** Expanded, the group shows the active project and the first 12 by name, with the filter and a "Show all N" row, instead of 256 rows inline.
18. **Mode switch on the Chat page (NAV-7).** When the Chat page is open the switch shows no Bots selection. Chat gets its own segment only if it stays reachable; otherwise its entry points are removed. Check with the user before removing anything.

## Phase K: Bots (muster-bots repo, about 1.5 h)

19. **Header and row actions (VIS-4).** Header icons become 24px round at a 16px glyph and stroke 2; the bot row action becomes 24px round. Footer glyphs move to stroke 2.
20. **Handoff reply chips (EMPTY-4).** `HandoffReply.tsx:31` and `:34` run the label through `plainPreviewText`; the expanded body renders Markdown instead of pre-wrapped text.
21. Build and copy into `resources/muster-bots/ui/`.

## Phase L: checks and round 4

22. Full gates (lint chain, three typechecks, full renderer suite, bots tests), then a live check of items 1-7, 15 and 19 with the window visible. Round 4 reviewer with the same brief, plus: a real window resize to 800px and back, and a light Bots check with the window visible.

## Out of scope

- VIS-1 raw palette classes (263) and VIS-2 bespoke shadows (20): ratchet guards already cover them; worth +0.1 each.
- The 57 unlocalized plan-annotation and Sites strings that fail `verify:localization-coverage`: they predate this loop (commit 9be004c342). Separate fix.
