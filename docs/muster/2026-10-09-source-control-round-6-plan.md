# Source control round 6: larger items

Follows the approved plan in `2026-10-09-source-control-undo-and-polish-plan.md`. Rounds 1 to 5 are done or in progress. This round covers the items marked "own plan". Each item ships as its own commit. Questions that need your call are marked **Decide**.

## 1. Commit without staging first (item 1)

Today the message box is disabled until something is staged, so a commit takes three steps: Stage All, type, Commit.

- The message box stays editable unless a commit is in flight.
- With a message typed and nothing staged, the primary button reads "Commit All" and Cmd/Ctrl+Enter does the same. It stages every tracked change, then commits.
- With something staged, behaviour stays as it is today: only staged files are committed.
- Conflicts still block committing.

**Decide:** should "Commit All" include new untracked files? VS Code asks once and remembers the answer. Recommendation: include them, since that matches what "Stage All" does today, and show the file count in the button tooltip so nothing is a surprise.

Effort: a few hours.

## 2. Regroup the dropdown (item 3)

Rounds 3 and 4 already move Force Push to the end and replace the Bitbucket "Unsupported provider" rows. This finishes the layout:

```
Commit · Commit & Push · Commit & Sync · Undo Last Commit
──────────
Push · Pull · Sync · Fetch
More ▸  Fast-forward · Rebase from <base>
──────────
Create PR / Open Pull Request in Browser
Publish Branch (only when the branch has no upstream)
──────────
Force Push (red, confirms when it would delete remote commits)
```

"Commit" is hidden when the primary button already says Commit. Rows that can never apply (Publish on a tracked branch) are hidden; rows that apply but are blocked right now stay visible with the reason inline.

Effort: a few hours, mostly tests.

## 3. Amend and stash (item 5)

- "Commit (Amend)" in the commit group: amends the last commit with what's staged and the message in the box. If the box is empty it fills it with the last commit's message first. It confirms when the commit is already pushed, using the same wording as Undo Last Commit.
- Stash, in the header "..." menu: "Stash Changes" (includes untracked files), "Pop Latest Stash", and "Stashes ▸" listing each stash with Apply, Pop and Drop. Drop confirms.
- All commands work on Git 2.25 (`stash push -u`, `stash list`, `stash apply/pop/drop stash@{n}`).
- Works over SSH and remote runtime through the same layers Undo Last Commit used.

**Decide:** is the stash list worth it now, or ship Stash and Pop first and add the list later? Recommendation: Stash and Pop first. The list adds a submenu and three more IPC calls.

Effort: about a day.

## 4. Keyboard access in the file list (item 6)

The changed-files list is mouse-only. It becomes a proper tree:

- Tab moves into the list once; arrow keys move between rows; Left/Right collapse and expand folders and sections.
- Enter opens the diff, Space stages or unstages, Delete discards (through the existing confirm), Shift+F10 or the context-menu key opens the right-click menu.
- Screen readers get `role="tree"`, `aria-expanded` on sections and folders, and the file's status in its label ("b.txt, added, staged").
- The list is virtualised, so focus has to survive rows scrolling out of view.

Effort: about a day.

## 5. Commits list: load more and retry (item 9)

- A "Load more" row at the end of the list fetches the next 50.
- The error state gets a Retry button.
- Pipeline status from round 5 extends to the newly loaded rows.

Effort: a couple of hours.

## 6. Match the style guide (item 11)

- Section headers all use the 11px uppercase header style.
- Dropdown hints and status letters use sizes from the type scale instead of 10px.
- The primary commit button uses the `default` button variant.

Effort: under an hour. Screenshots before and after go with the commit.

## 7. Finish a merge or rebase from the panel (item 15)

Today the commit box is hidden while a merge or rebase is in progress and the banner only offers Abort.

- Merge in progress: the commit box shows with git's prepared merge message, and Commit concludes the merge once conflicts are resolved.
- Rebase in progress: the banner gets "Continue Rebase" (enabled when no conflicts remain) next to Abort. "Skip Commit" goes in the banner's overflow menu.
- Cherry-pick in progress: "Continue" and "Abort" the same way.
- Continue runs non-interactively (`GIT_EDITOR=true`) so it never hangs on an editor.

Effort: about a day.

## 8. Publish to a remote not named origin (item 21)

Publish Branch assumes `origin`. Change: use the only remote when there's exactly one; with several, pick `origin` if it exists, otherwise ask which remote in a small dialog.

Effort: a couple of hours.

## 9. Older Git fallback for repo key lookup (item 22)

One `rev-parse --path-format=absolute` call (Git 2.31+) has no fallback, so on older Git the fetch de-dupe can mix up repos. Use the existing `rev-parse-path-format` capability check and resolve the relative path manually on older Git.

Effort: under an hour.

## Order

1. Quick ones first: 9, 6, 5, 8.
2. Then 1 (commit without staging) and 2 (dropdown regroup), which both touch the commit area.
3. Then 7 (finish merge/rebase), 3 (amend and stash), 4 (keyboard access).

Items in the same step can run as parallel agents in separate worktrees, like rounds 2 to 5.
