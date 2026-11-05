# UX loop, round 5 fix plan

Source: `docs/muster/2026-11-05-ux-review-round-5.md`. Round 5 scores: Visual 9, Type 8.75, Color 8.75, Layout 9, Nav 9, Feedback 9, Empty/onboarding 9, Copy 8.75, A11y 9, Responsive 9. Three categories are still under 9. This round covers their findings, plus the small consistency items the review lists, so the other seven stay at 9.

## Phase R: contrast and controls (about 2.5 h)

1. **Hand-built icon buttons (COL-10, A11Y-9).**
   - The 20 `rounded-sm p-1` and `rounded-md p-1` icon buttons in `components/` become `Button variant="ghost" size="icon-xs"`. The round shape and focus ring come from the primitive. This starts with "Disconnect ActiveCollab" (`settings/activecollab-integration-card.tsx:135`) and the font field's "Clear font selection" and "Toggle font suggestions" (`settings/SettingsFormControls.tsx:797`, `:824`).
   - Any icon that is a control uses full `text-muted-foreground`.
2. **Faded muted text (COL-10).** Sweep the 89 uses of `text-muted-foreground/40` to `/60`. Text and control icons go to full `text-muted-foreground`. Separators, disabled states and decorative glyphs keep their fade, with a short comment at each.
   - Add a ratchet test, like the palette-class ratchet, so the count can't grow.
3. **Small contrast misses.**
   - In Source Control, the arrow before "origin/master" is 2.95:1 and the 10px count is 3.6:1.
   - The "7 live ports" glyph in the left sidebar is 2.88:1.
   - Each one gets to 4.5:1 for text or 3:1 for a glyph.
4. **Integration card status (VIS-25).** `IntegrationCardShell` (`settings/integration-card-shell.tsx:31`) renders `IntegrationStatusPill`, so the cards use the 20px Badge and its `-ink` colours. That lifts "Connected" and "Setup needed" above 4.5:1.

## Phase S: type and chrome (about 2 h)

5. **One section label (TYPE-8).**
   - A shared `SECTION_LABEL` (11px, semibold, uppercase, `tracking-[0.05em]`, `text-muted-foreground`) replaces the 0.18em Settings nav groups (`settings/SettingsSidebar.tsx:238`, `settings/settings-projects-nav.tsx:82`).
   - It also replaces Chat's 0.08em region label (`chat-mode/chat-sidebar-hierarchy.ts:12`) and the Site panel's weight-500 labels.
   - The other uppercase tracking values move onto it where the element is a section label.
6. **Status bar and quick commands split (FB-7).**
   - The status bar items (`status-bar/StatusBar.tsx:2296` and the 8 others in `status-bar/`) take the ghost `Button` `xs` recipe: pill shape, `/[0.07]` hover, ring-2 focus.
   - The quick commands split (`tab-bar/TabBarQuickCommandsMenu.tsx:207`, `:218`, `:269`) becomes `rounded-full`, with `rounded-l-full` and `rounded-r-full` halves.
7. **Glyph size per button size (VIS-27).**
   - 28px buttons carry 14px glyphs and 24px buttons carry 12px glyphs. This applies to the right sidebar activity bar (`activity-bar-buttons.tsx:74`, `:139`).
   - In muster-bots, it applies to the Bots conversation header and the Bots sidebar's "New thread" and "New folder" buttons.
8. **Hover fills (VIS-26).**
   - The two documented recipes become constants: `ROW_HOVER` (`hover:bg-accent`) and `CONTROL_HOVER` (`hover:bg-foreground/[0.07]`).
   - The two visible mismatches use them: activity bar hover (`/[0.05]` to `/[0.07]`) and Chat thread rows (`bg-muted/60` to the row recipe).
   - A ratchet test stops new one-off hover fills. The existing ones aren't swept this round.
9. **Settings odd ones out (TYPE).**
   - The Quick commands filter select becomes the 36px/14px Settings select.
   - Remote Muster servers' "Advanced" button moves to 14px.
   - Settings "Filter projects" gets the search glyph that the Workspace options field has.
10. **Setup guide header (LAY-10).** "Hide checklist from sidebar" and Close share one `flex gap-1` header slot instead of the absolute `right-10` (`setup-guide/SetupGuideModal.tsx:123`). The dialog opens with focus on the current step.

## Phase T: copy (about 45 min)

11. **⌘J palette noun (COPY-11).**
    - "workspace" replaces "worktree" in the placeholder (`WorktreeJumpPalette.tsx:1574`, `:1588`), the "Recent worktrees" header (`:983`) and the `Create worktree "…"` row (`:1652`).
    - The same change applies to the sidebar search's accessible name (`sidebar/SidebarNav.tsx:258`) and the Ports "Go to worktree" action (`status-bar/ports-status-popover-rows.tsx:307`).
    - Update the tests that match on these strings.
12. **Palette details.**
    - The trailing "Shortcut" tag (`action-palette/ActionPaletteRow.tsx:42`) changes to "Shows shortcut".
    - "Open markdown tab" (`shared/keybindings.ts:592`) changes to "Open Markdown tab".

## Phase U: checks and round 6

13. Run the gates:
    - Lint, with the 57 known localization strings excepted.
    - The three typechecks.
    - The full suite, with the 4 known failures that also fail at HEAD excepted.
    - The Bots UI tests and a Bots build copied into `resources/muster-bots/ui/`.

    Then check items 1, 4, 5 and 6 live, with the window visible.
14. Run the round 6 reviewer with the same brief.

## Out of scope

- VIS-1 raw palette classes (261) and VIS-2 bespoke shadows: ratchet guards already cover them.
- Sweeping every existing hover fill onto the two constants. The ratchet stops growth, and a full sweep is a separate pass.
- The 57 unlocalized plan-annotation and Sites strings that predate this loop.
