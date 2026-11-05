# UX loop, round 2 fix plan

Source: `docs/muster/2026-11-05-ux-review-round-2.md`. Round 2 scores: Visual 7, Type 8, Color 7.5, Layout 7.5, Nav 7.5, Feedback 7.5, Empty/error 8, Copy 8, A11y 7.5, Responsive 7.5. Nothing is at 9 yet. Most of the remaining gap is consistency: primitives that disagree with each other, and screens that hand-roll a control instead of using the primitive. So this round fixes the primitives first, then moves call sites onto them, then adds guards so they stay there.

## Phase E: primitives (about 4 h)

1. **Popover surface (VIS-5).** `ui/popover.tsx` drops the glass (8px, 0.72 alpha, 40px blur) and uses `MENU_SHEET`: opaque, 12px, `shadow-floating`. All 60 popovers follow, including Ports and Resource manager.
2. **One palette shell (VIS-6, VIS-2).** `CommandDialog` takes the Jump palette recipe: 16px radius, opaque, Floating tier, pill search field, inset `rounded-lg` rows, the same group label as the Jump palette. The bespoke `shadow-[0_20px_60px…]` goes.
3. **Switch primitive (VIS-9).** New `ui/switch.tsx` (Radix Switch), one size, 18x32. The 24 hand-rolled `role="switch"` controls move onto it, including Settings (`SettingsSwitch`) and the sidebar menus.
4. **Textarea primitive (VIS-8).** New `ui/textarea.tsx`: `rounded-xl`, 0.05 fill, no border, 1px ring on focus, the same as `Input`. The commit message and other plain textareas use it.
5. **Badges (VIS-10, COPY-8).** The 26 hand-rolled `rounded-full px-1.5 py-0.5` spans move to `Badge`. "OPTIONAL" becomes sentence case like the other nav badges.
6. **Focus rings (FB-5, COL-1).** 2px at full `--ring` everywhere. The 23 dimmed `ring-ring/NN` call sites and the `ring-1` fields move to the primitive ring.

## Phase F: sweeps onto the primitives (about 5 h)

7. **Text fields (VIS-8, TYPE-5).** Explorer "Find files", the Settings search (keeps the fill, 14px), the Agents history search and other hand-rolled fields use `Input`.
8. **Icon buttons (VIS-11, LAY-7, A11Y-2).** Every icon button is `Button` with `size="icon-*"`: round, one stroke weight (the primitive default). The titlebar sidebar toggles and back/forward go round. The 2.5 and 2.75 stroke overrides go. The raw Source Control filter button becomes a `Button`. The 16 controls under 24px get `hit-area`.
9. **Menu rows (VIS-12, TYPE-4).** The Workspace options menu's filter and project rows use `MENU_ROW` (one height, one text size).
10. **Cards and skeletons (VIS-13, VIS-14).** Settings sections, right-sidebar site cards and the Sites banners share the `Card` radius (`rounded-xl`). Skeletons take the shape of what they replace: pills for buttons, rows for rows.
11. **Control heights (VIS-7, LAY-6).** The Extensions Tools/Skills switch moves to `ToggleGroup variant="segmented"`, and each toolbar and form row uses one control height (32px).
12. **Rows inset (LAY-5).** Explorer rows and the Ports project band sit inset from their container like menu and list rows.
13. **Leftovers (VIS-1, VIS-2, TYPE-2, TYPE-3).** Finish the raw-palette codemod, remove the remaining bespoke shadows, move `text-[17px]` and `text-[26px]` onto the scale, and drop the last `font-bold`. Guards: the raw palette ratchet gets the new count; a new guard rejects `role="switch"` outside `ui/switch.tsx`, `rounded-sm` on buttons, and bespoke `shadow-[`.

## Phase G: content and behaviour (about 4 h)

14. **Contrast (COL-4, COL-5, COL-6).** Light `--muted-foreground` on the sidebar reaches 4.5:1. The "Update available" and "Installed" badges move to status tokens that pass AA. The dark diff-deletion colour is lightened to 4.5:1.
15. **Worktree sidebar focus (FB-3).** One focus ring per row, on the card, inside the tree guide line.
16. **LocalWP detection (FB-4).** Detection gets a timeout. After about 8s the skeleton is replaced by "Still checking the Local site…" with Retry, then by an error with details.
17. **Markdown in previews (EMPTY-4).** Previews in Agents history and Bots activity strip Markdown syntax.
18. **Copy (COPY-6, COPY-7).** The workspace row menu uses "workspace" throughout. Vague strings get specific: "Set…" becomes "Set due date", "Update" becomes "Edit details", and the ActiveCollab picker prompt gets shorter.
19. **Settings nav (NAV-5, NAV-6).** Projects in the Settings nav collapse into a "Projects" entry (count, searchable list in the pane) instead of about 255 rows. The Help menu keeps one way into onboarding ("Setup guide"). Replay and Explore merge into it.
20. **Narrow windows (RESP-4, RESP-5).** Below about 960px the right sidebar collapses to its activity bar on its own. Label chips size to their content and the title truncates instead.
21. **Bots chrome (VIS-4, NAV-1, COL-3; muster-bots repo).** Footer icons are 24px round ghost buttons at the Muster stroke. Apps uses its own glyph (Plug), not Blocks. Check light Bots with the window visible.

## Then

Round 3: a fresh reviewer, same 10 categories, live in light and dark at about 1560px and 800px, compared with round 2. Repeat until every category scores 9 or 10.
