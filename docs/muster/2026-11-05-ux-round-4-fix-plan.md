# UX loop, round 4 fix plan

Source: `docs/muster/2026-11-05-ux-review-round-4.md`. Round 4 scores: Visual 8.5, Type 8.5, Color 8.5, Layout 8.5, Nav 9, Feedback 8.5, Empty/onboarding 9, Copy 8.5, A11y 8.5, Responsive 8. To reach 9 everywhere, this round fixes a regression in the narrow-window fold, the worktree list keyboard model, the last controls still on the old recipe, and a few contrast and wording leftovers.

## Phase M: behaviour (about 3 h)

1. **Narrow-window fold owns its own flag (RESP-6).** The fold stops writing `rightSidebarOpen`.
   - A new store field, `rightSidebarAutoFolded`, is never persisted or synced. `rightSidebarOpen` keeps meaning "the user wants it open", and that is the only value saved and synced.
   - The sidebar shows when `rightSidebarOpen && !rightSidebarAutoFolded`, through one selector. The 13 renderer files that read `rightSidebarOpen` to decide visibility switch to that selector.
   - `setRightSidebarOpen` and `toggleRightSidebar` clear `rightSidebarAutoFolded`, so a user toggle while narrow takes effect at once and widening leaves it alone. The toggle flips the visible state, not the saved preference.
   - The controller moves from `right-sidebar/index.tsx` to `App.tsx`, so Settings, Sites and Bots don't lose the fold. Narrowing past 960px sets the flag and widening clears it. The `pending` and `onOpenChanged` bookkeeping goes away.
   - Tests: a `sync` hydrate between fold and widen doesn't cancel the restore, a second cycle still folds, a user toggle while narrow sticks, and nothing persists `false` because of a fold.
2. **Worktree list keyboard model (A11Y-8, FB-6).**
   - Arrow keys move the cursor only. Enter or Space switches workspace, and Enter on the active row still focuses its terminal. This removes the selection-follows-focus behaviour (`sidebar/WorktreeList.tsx:2684`). Arrowing through the list will no longer switch workspaces, so say so here if you rely on that.
   - Title spans leave the tab order (`WorktreeTitleInlineRename.tsx:318`). Rename stays on double-click, F2 and the row menu.
   - Remove the 1px active-card outline (`main.css:1433-1438`), so the 2px cursor ring is the only focus mark.
   - Update the existing tree-navigation tests.
3. **One focus treatment (FB-6).** Add `focus-visible:ring-2 focus-visible:ring-ring` to the left sidebar nav (Sites, Tasks) and to the Agents history group headers.

## Phase N: chrome and contrast (about 3 h)

4. **Right sidebar activity bar (VIS-19).** The buttons become 28px round `Button variant="ghost" size="icon-sm"`. Selection is a `bg-foreground/[0.07]` fill instead of the underline. Inactive icons use full `text-muted-foreground`, and the active button gets `aria-pressed`. Focus comes from the Button primitive.
5. **Inactive label contrast (COL-9).**
   - The mode switch's inactive segments use the `toggleVariants` segment colour (`/70`) instead of `/55`.
   - Chat sidebar section labels and idle thread rows use full `text-muted-foreground`.
   - The composer's effort label clears 4.5:1.
6. **Search fields and menu sheets (VIS-21).**
   - Remove the `wrapperClassName` overrides on the Workspace options filter, the sidebar filter, the quick commands search and the Tasks project picker, so they all use the `CommandInput` pill.
   - The new tab menu uses `MENU_SHEET` (`TabBar.tsx:1045`, `BrowserTab.tsx:278`), and its search becomes `CommandInput`.
   - Explorer's search-in-files query uses `SEARCH_FIELD_SHELL`.
7. **Option cards (VIS-20).** In the Add project dialog, the primary option and the "Other ways to add" group are both `rounded-xl` with the same border token.
8. **Status chips (VIS-23).** Extension cards use the 20px `Badge` in place of `IntegrationStatusPill`'s 23px recipe. The Resource manager's "Review inactive workspaces" button becomes a pill `Button` like "Scan".
9. **Chat composer chips (VIS-24).** The workspace, model and effort chips become 28px round. The send button is the foreground pill used by Code and Bots.
10. **11px controls (TYPE-7) and mixed rows (LAY-9).**
    - Button labels get a 12px floor: "Stage all", "Create PR", "Clear" and the "Local Mac" host pill.
    - The worktree menu label uses `MENU_LABEL`.
    - SSH host row buttons use one size, 28px.

## Phase O: copy (about 1 h)

11. **Workspace noun (COPY-10).**
    - Change "worktree" to "workspace" in the five keybinding titles (`shared/keybindings.ts:245`, `:257`, `:265`, `:281`, `:449`), "Resume in worktree", the tree's `aria-label` and "Create worktree" (`NewWorkspaceComposerModal.tsx:222`). Update the tests that match on those strings.
    - Command rows drop the "Global" description.
    - Fix the round 2 residuals: "Copy relative path to line", "Toggle chat UI", "Open chat", "Blank Markdown", "Use Option as Alt", "Send Enter".
    - When a palette row has a description, the description truncates before the title does.

## Phase P: Bots (muster-bots repo, about 1.5 h)

12. **Conversation header (VIS-22).** "Bot's screen" and "More" become 28px round with 16px glyphs (`ChatView.tsx:1131`, `:1136`, `ChatMoreMenu.tsx:220`, `:225`). Bot rows use 8px corners.
13. **Model pill flash (VIS-22).** `ModelPicker` keeps the last known label in local storage and shows it until the list loads, falling back to a skeleton pill if there is none. It never shows the raw id.
14. **Narrow Bots (RESP-7).** Below 960px, the Bots sidebar folds to its avatar rail.
15. Build and copy into `resources/muster-bots/ui/`.

## Phase Q: checks and round 5

16. Run the full gates: the lint chain (the 57 known localization strings excepted), three typechecks, the touched renderer suites, the full suite, and the bots tests. Then check items 1, 2, 4, 5 and 13 live, with the window visible: two real 800px resize cycles, including one taken from Settings, and a keyboard walk of the worktree list that sends no keystrokes into terminals.
17. Run the round 5 reviewer with the same brief.

## Out of scope

- VIS-1 raw palette classes (261) and VIS-2 bespoke shadows: ratchet guards cover them, and each is worth about +0.1.
- The 57 unlocalized plan-annotation and Sites strings that predate this loop.
