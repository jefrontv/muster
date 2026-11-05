# UX round 6 fixes

Source: `docs/muster/2026-11-05-ux-review-round-6.md`. Round 6 scored 9 in eight categories and 8.75 in Color. Eleven findings are open. This plan fixes them in score-impact order on `feature/muster-bots`, one commit per finding.

Two findings touch the muster-bots fork (FB-8's Bots part and COL-12). Those land in the fork together and ship as `v0.1.133-muster.3` with a pin bump at the end, the same flow as `muster.2`.

## Batches

### 1. COL-11 / A11Y-10: faded muted text (about 1.5 hours)

`text-muted-foreground/70` appears 79 times in 45 files and `/80` 31 times in 25. At 11 to 12px these fail AA (3.02:1 to 3.71:1 in light).

1. Widen the ratchet in `config/scripts/check-style-drift-ratchet.mjs` from `/[2-6]0` to `/[2-9]0`.
2. Move every text use to full `text-muted-foreground` (5.74:1 light). Start with the measured ones: Ports popover rows, Resource manager headers, ActiveCollab notes, Ports panel rows, Sites "Found on disk".
3. Keep the fade only on decorative glyphs and separators, listed in `config/faded-muted-text-baseline.txt` with the new counts.

### 2. VIS-28: one icon-button recipe (about 1.5 hours)

29 hand-built `rounded-full p-1` buttons measure 22px with three different hover fills, beside the 24px ghost primitive.

1. Swap each for `Button variant="ghost" size="icon-xs"`.
2. Add `rounded-full p-1` on a `<button>` to the ratchet so the recipe can't come back.

### 3. VIS-29: Settings selectors (about 45 minutes)

1. `settings/AgentsPane.tsx` `DefaultAgentPill`: pill chips with inverted selection (`bg-foreground text-background`).
2. `settings/TerminalSettingsPreview.tsx` dark/light toggle: the shared segmented pill track used elsewhere in Settings, with its focus ring.

### 4. TYPE-9: uppercase labels (about 45 minutes)

1. `SECTION_LABEL` at the Setup guide, Resource manager groups and headers, Sites "Found on disk" and the two onboarding labels.
2. Ratchet `uppercase tracking-wide\b` with the current count as its baseline, so the 77 uses can only go down.

### 5. FB-8: tab bar controls (about 30 minutes)

1. New tab "+", the two tab-strip scroll buttons and the no-commands quick commands button become ghost `Button` (`icon-sm` / `icon-xs`), which brings the shared hover and focus ring.
2. Fork: move the round class onto the Bots "More" button in `ChatMoreMenu.tsx` so its focus mark is round.

### 6. COPY-12: Agents history rows (about 45 minutes)

1. Show the friendly model name ("Sonnet 5.5") instead of `claude-sonnet-5-5`, using the same label the Chat composer uses.
2. Title a row from the first user message after injected context, not "Current time when this message was sent…".

### 7. VIS-27: glyph size per button size (about 1.5 hours)

1. Encode the glyph size in the `Button` size variants: 12px for `xs` / `icon-xs`, 14px for 28px sizes, 16px for `sm` / `icon-sm`.
2. Drop the call-site sizes the review lists where they fight the variant (Agents history, Source Control rows, Integrations "More actions", Appearance pane buttons).
3. Leave the terminal pane header's upstream stroke override; it carries a reason comment.

### 8. LAY-11: Settings section action heights (about 30 minutes)

1. Section-header actions at `size="sm"` (32px) in SSH hosts, Quick commands and Remote Muster servers.
2. One refresh button size per pane. Setup guide header text pills match its 28px icon buttons.

### 9. NAV-5: Projects preview (about 20 minutes)

`settings/settings-projects-nav.tsx` sorts the preview by name and always includes the active project, so "aidc" shows even when it falls past the first 12.

### 10. COL-12: Bots role chip contrast (about 15 minutes, fork)

`muster-bots/src/components/BotRole.tsx`: text on the accent tint uses an `-ink` accent shade that passes AA in light.

### 11. Release and verify (about 1 hour)

1. Commit and push the fork changes, tag `v0.1.133-muster.3`, bump `config/muster-bots.json` once CI publishes.
2. Typecheck, the touched test suites, lint, style ratchet, localization baseline (57).
3. Live check each batch in the dev app, light and dark, at 1710px and 800px.
4. Post a short before/after list. A round 7 reviewer runs only if asked.

## Estimate

About 9 working hours in total. Batches 1 to 5 carry most of the score gain (about +0.9 across Color, Accessibility, Visual consistency, Typography and Feedback).

## Points to confirm

1. Work stays on `feature/muster-bots` rather than a new branch.
2. VIS-27 changes the default icon size for every ghost button size. It's the riskiest batch; the alternative is to fix only the call sites the review lists and skip the variant change.
