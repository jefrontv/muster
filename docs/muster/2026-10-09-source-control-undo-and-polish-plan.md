# Source control: Undo Last Commit + polish pass

Two parts. Part 1 is the user-suggested "Undo Last Commit" action (VS Code / Cursor parity). Part 2 is a review of the current source control panel with proposed polish items, ranked so you can pick which ones go ahead.

## Part 1: Undo Last Commit

### Behaviour

- New row in the commit dropdown, in the commit group, directly under "Commit & Sync": **Undo Last Commit**.
- Runs `git reset --soft HEAD~1`. The commit disappears from history and its changes come back as staged files. Nothing in the working tree changes.
- The undone commit's message goes back into the commit message box, but only when the box is empty, so a half-typed message is never overwritten. VS Code does the same.
- Status, branch compare and history refresh afterwards, like every other mutation.

### Edge cases

| Case | Behaviour |
| --- | --- |
| Commit only exists locally (ahead > 0, or no upstream) | Runs straight away, no dialog. It is reversible: the changes are still staged. |
| Commit is already on the remote (upstream set, ahead = 0) | Confirmation dialog: "This commit is already on origin/staging. Undoing it only changes your local branch, and your next push will need Force Push." |
| First commit in the repo (no parent) | `git update-ref -d HEAD`. Files stay staged. Same as VS Code. |
| No commits yet (unborn branch) | Row disabled: "No commits to undo". Backend also rejects it. |
| Merge commit | Blocked with "Can't undo a merge commit here". A soft reset would stage the other branch's changes as if they were yours. |
| Merge or rebase in progress | Row disabled: "Finish or abort the rebase first". |
| Any other operation in flight | Row disabled, same as every other row (global busy lock). |

### Implementation

Follows the exact path `abortRebase` already uses, so local, SSH and remote-runtime workspaces all work.

1. `src/main/git/undo-last-commit.ts` (new): read the message (`git log -1 --format=%B`), check parent count (`git rev-list --parents -n 1 HEAD`), then reset or `update-ref -d HEAD`. Returns `{ message }`. Wrapped in `runWithGitReadCacheInvalidation`.
2. IPC `git:undoLastCommit` in `src/main/ipc/filesystem.ts`, plus `src/preload/index.ts` and `src/preload/api-types.ts`.
3. SSH: `undoLastCommit` on `src/main/providers/types.ts`, `ssh-git-provider.ts`, and the relay handler in `src/relay/git-handler.ts`. The relay is content-hashed, so remote hosts pick up the new method on next connect.
4. Remote runtime: `git.undoLastCommit` in `src/main/runtime/rpc/methods/git.ts`, `runtime-rpc.ts`, `orca-runtime-git.ts`, and `src/renderer/src/web/web-preload-api.ts`.
5. Renderer client: `undoRuntimeGitLastCommit` in `src/renderer/src/runtime/runtime-git-client.ts`.
6. Dropdown: new `undo_commit` kind in `source-control-dropdown-items.ts`. Handler lives in a new `use-undo-last-commit.ts` hook rather than growing `SourceControl.tsx` (already 8,200 lines).
7. i18n strings in `en.json` and `es.json`.

All commands used are in Git 2.25.

### Tests

- Dropdown items: row present, disabled states (busy, conflict, no commits).
- `undo-last-commit.ts` against a temp repo: normal commit, root commit, merge commit rejected, message returned.
- Relay handler: method registered and runs the same commands.
- Manual: undo a local commit, undo a pushed commit (dialog shows, then Force Push is offered), undo the first commit in a fresh repo.

Estimate: about half a day including tests.

## Part 2: Polish review

Annotate the ones you want dropped. Effort: S is under an hour, M is a few hours, L is a day or more. Line refs are in `src/renderer/src/components/right-sidebar/` unless the path says otherwise.

### 2a. UI and interaction

| # | Today | Proposed change | Effort |
| --- | --- | --- | --- |
| 1 | The message box is disabled until something is staged, so committing takes three steps: Stage All, type, Commit (`source-control-commit-eligibility.ts:44`). | Keep the box editable. With a message and nothing staged, Commit (or Cmd/Ctrl+Enter) offers "Stage all and commit", the same as VS Code's smart commit. | M |
| 2 | Bitbucket repos show "Create PR" and "Push before PR" greyed out with "Unsupported provider" (`source-control-dropdown-items.ts:476`, `:517`). | For providers without PR creation, hide both rows and add "Open Pull Request in Browser". `buildSourceControlManualReviewUrl` already builds Bitbucket links. | S |
| 3 | The dropdown is 14 flat rows with one separator, on purpose ("every row is always rendered"). | Group with separators: commit actions; Pull / Push / Sync / Fetch; Fast-forward and Rebase from base in a Pull submenu; Publish Branch only without an upstream; review rows; Force Push last. | M |
| 4 | Force Push sits between Push and Create PR. It isn't styled as destructive, has no confirm, and stays enabled even when its tooltip says "Nothing to force push". | Move it to the bottom, mark it destructive, confirm when the remote has commits you don't (behind > 0), and disable it when there's nothing to push. | S |
| 5 | No stash or amend anywhere in the app. | Add "Commit (Amend)" to the commit group, and Stash / Pop Stash to the header overflow menu. | L |
| 6 | The file list is mouse-only. Rows are plain `div`s with no tab stop or key handling, and section toggles have no `aria-expanded` (`SourceControl.tsx:7861`, `:7120`). | Arrow keys move, Enter opens the diff, Space stages/unstages, Delete discards (existing confirm), Shift+F10 opens the menu. | L |
| 7 | Right-clicking a file gives View, Copy Path, Open in, Open in File Explorer. Stage, Unstage and Discard are hover icons only, and nothing opens the file itself in Muster's editor (`source-control-entry-context-menu.tsx:83`). | Add Stage/Unstage, Discard, Open File, Copy Relative Path. Rename "View" to "Open Changes". | S |
| 8 | Cmd/Ctrl+Shift+G opens the panel but doesn't focus the message box. The placeholder just says "Message". | Focus the box when the panel opens. Placeholder: "Message (⌘Enter to commit on staging)", with Ctrl+Enter on Windows/Linux. | S |
| 9 | The Commits list stops at 50 with a bare "+", and its error state has no Retry (`GitHistoryPanel.tsx:250`, `:309`). | Add a "Load more" row and a Retry button. | S–M |
| 10 | Dropdown rows and the primary button show two tooltips at once (native `title` plus the styled one). The reason Commit is disabled only shows on hover. The Generate button's fallback tooltip reads "ai commit msg". | Remove the native tooltips, show disabled reasons inline under the row, and fix the copy. | S |
| 11 | Off-guide styling: section headers mix `text-xs` and 11px, hints and status letters use 10px, and the primary commit button uses the `outline` variant. | Match STYLEGUIDE.md: 11px uppercase headers, scale sizes only, `default` variant for the primary action. | S |
| 12 | "No matching files" has no way out, and its strings aren't translated (`SourceControl.tsx:5692`). | Add a "Clear filter" button and translate the strings. | S |

Already present, so not in scope: Stage all / Unstage all / Discard all per section, discard confirm, Abort merge/rebase, and history with copy hash, copy message, open diff and open in browser.

### 2b. Git backend

| # | Problem a user hits | Proposed change | Effort |
| --- | --- | --- | --- |
| 13 | Over SSH or a remote runtime, push/pull/commit give up after 30s but git keeps running. A slow pre-push hook shows "timed out" while the push succeeds, so the user retries and pushes or commits twice (`ssh-git-provider.ts:524`, `runtime-git-client.ts:492`). | Give mutations a 10-minute timeout and let the relay cancel git when the request is cancelled. | M |
| 14 | Local push/pull/fetch ignore a repo's `core.sshCommand` (e.g. a per-repo Bitbucket key). Works in the terminal, fails in the panel with "Permission denied (publickey)" (`runner.ts:655`, `remote.ts`). | Pass the existing `useConfiguredSshCommandForNetwork` flag from push, pull and fetch. | S |
| 15 | The panel can't finish a merge or rebase. The commit box is hidden while one is in progress and the banner only offers Abort, yet the toasts say "commit the merge" or "continue the rebase" (`SourceControl.tsx:698`, `:7452`). | Show the commit box during a merge, and add Continue rebase, Continue cherry-pick and Abort cherry-pick. | M |
| 16 | A pull with conflicts shows a fetch line as the error (e.g. `300cde9..d0d667e main -> origin/main`), because only the last stderr line is kept and CONFLICT goes to stdout (`shared/git-remote-error.ts:177`). | Scan stdout and stderr for conflict markers first. | S |
| 17 | Auth, protected-branch and lock errors show useless last lines: "and the repository exists.", "failed to push some refs", "remove the file manually to continue." | Add plain messages for publickey, host-key and `index.lock` failures, and keep the first `remote:` line for protected branches. | S |
| 18 | Stage, unstage and discard on a single file fail silently, and two quick clicks collide on `index.lock` (`SourceControl.tsx:5160`, `:5287`). | Queue git writes per worktree, toast on failure, refresh status afterwards. | S–M |
| 19 | Raw text leaks: local errors start with "Error invoking remote method 'git:pull': Error:", and abort failures show "Command failed: git rebase --abort…". | Strip the Electron prefix and normalize abort errors. | S |
| 20 | The Commits list goes stale when an agent or the terminal commits (`SourceControl.tsx:4977`). | Refresh history when HEAD changes, as branch compare already does. | S |
| 21 | Publish Branch assumes the remote is called `origin` (`remote.ts:206`). | Use the only remote when there is one; ask when there are several. | S |
| 22 | On Git older than 2.31, one `rev-parse --path-format` call has no fallback, so fetch dedupe can mix up repos (`orca-runtime.ts:19877`). | Use the existing `rev-parse-path-format` capability check. | S |

Checked and fine: status polling cadence, `restore`, porcelain v2, merge-tree and for-each-ref fallbacks, relay locale pinning.

## Part 3: Pipeline status on commits

### What it looks like

Each row in the Commits panel gets a small status icon on the right, after the branch badges: a green tick for passed, a red cross for failed, a spinner for running, and a grey dot for stopped or skipped. Hovering shows "Pipeline #412 failed · 3m 12s"; for a running pipeline it also names the current step. Clicking opens the pipeline in the browser. Commits that never ran a pipeline (most local or unpushed ones) show nothing, so the column stays empty instead of filling with grey.

### Data

Bitbucket comes first because almost every efront repo is on it, and most of the code exists. `src/main/bitbucket/site-pipelines.ts` already lists recent runs with each run's commit hash, step progress and URL for the Sites panel. Today it fetches only 3 runs and only for sites.

1. Split the fetch out so it takes a page size, and call it with 30 for the Commits panel. One request per refresh covers the visible history.
2. Match runs to commits by hash in main and return a `sha -> latest run` map over a new `git:commitPipelines` IPC call.
3. Refresh when the Commits panel opens, after a push, and every 60s while the panel is visible and a run is in flight. Stop polling when nothing is running or the window is hidden, the same as `use-site-pipelines.ts`.
4. Signed out, no `pipeline` scope, or a non-Bitbucket remote returns "unavailable" and the column stays hidden. No error rows.

GitHub and GitLab follow as a second step. GitHub uses one GraphQL query for the commit `statusCheckRollup` of all visible commits, which costs 1 API call and respects the `gh` rate limit. GitLab's `/projects/:id/pipelines` already returns `sha`, so it uses the same matching as Bitbucket.

SSH workspaces: API calls run on the user's machine, but `getBitbucketRepoRef` reads the remote URL from a local path. For SSH it needs the URL from the remote host instead. Not yet checked whether the SSH provider already exposes it; that gets confirmed before building.

### Effort

Bitbucket: about a day including tests. GitHub and GitLab: about a day more.

## Suggested order

1. Part 1, Undo Last Commit (about half a day).
2. Error and correctness quick wins: 14, 16, 17, 19, 20 (about half a day together).
3. Safety: 4 (Force Push guard), 13 (timeouts), 18 (write queue).
4. UI quick wins: 2, 7, 8, 10, 12.
5. Part 3, pipeline status on commits (Bitbucket first).
6. Larger items, one at a time with their own plan: 1, 3, 5, 6, 9, 11, 15, 21, 22.

Each step ships as its own commit, so a release can go out after any of them.
