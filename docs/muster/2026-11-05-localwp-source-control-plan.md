# LocalWP sites: show Source Control and Checks

## Bug

LocalWP sites such as Made By Tait show no Source Control or Checks tab in the right sidebar, even though `app/public` is a real git repo.

## Cause

- `src/main/sites/localwp-repo-path.ts` registers every LocalWP project as `kind: 'folder'` on purpose. Local only serves one path, so "New workspace" must open another workspace on the same folder, never a git worktree.
- The right sidebar hides `gitOnly` tabs (Source Control, Checks) for folder projects, and `SourceControl.tsx` (39 checks) and `ChecksPanel.tsx` (10 checks) switch themselves off with `isFolderRepo(repo)`.
- Folder workspaces are built with `branch: ''` and `head: ''` (`main/repo-worktrees.ts:22`, `main/ipc/worktrees.ts:814`), so nothing downstream knows the branch.

The behaviour is also inconsistent per site. `ipc/folder-repo-git-upgrade.ts` flips a folder project to `kind: 'git'` once it finds a `.git`, unless the project already has an extra folder workspace:

| Profile | Made By Tait | Extra workspaces | Result |
| --- | --- | --- | --- |
| Prod | `folder` | 1 | upgrade blocked, no Source Control |
| Dev | `git` | 0 | upgraded, Source Control shows, but New workspace now makes git worktrees, which breaks the LocalWP rule |

## Fix

Separate "how workspaces are created" from "does this folder have git". A folder project keeps folder workspaces, and gains git panels when its folder is a git work-tree root.

1. **Repo flag.** Add `gitBacked?: boolean` to `Repo` (`shared/types.ts`) and a helper in `shared/repo-kind.ts`:
   `hasGitFeatures(repo) = isGitRepoKind(repo) || repo.gitBacked === true`.
2. **Main sets the flag.** In `folder-repo-git-upgrade.ts`, when a local folder project's folder is its own git root (the existing `resolveUpgrade` check):
   - LocalWP projects (path is a Local `app/public`) never flip kind. They get `gitBacked: true`.
   - Other folder projects blocked by extra workspaces also get `gitBacked: true` instead of nothing.
   - Plain folder projects with no extra workspaces upgrade to `kind: 'git'` as they do today.
   - The flag clears if `.git` disappears.
3. **Branch and head for git-backed folders.** `createFolderWorktree` and `mergeFolderWorkspace` fill `branch` and `head` from the folder's git when `gitBacked` is set, so Source Control, Checks and PR lookup see the real branch. All same-path workspaces share it, which matches reality.
4. **Renderer gates.** In `right-sidebar/index.tsx`, `SourceControl.tsx` and `ChecksPanel.tsx`, gate git features on `!hasGitFeatures(repo)` instead of `isFolderRepo(repo)`. The separate "folder workspace scope" check (`activeWorkspaceScope?.type === 'folder'`) stays as is.
5. **Stays folder-only.** New workspace still creates a same-path workspace. Worktree-only actions (remove worktree, delete branch on archive, create from branch) keep using `isFolderRepo`.

## Scope

- Local projects only. SSH and WSL folder projects keep today's behaviour, because the upgrade watcher already refuses roots it can't stat natively. Their git panels stay hidden rather than half-working.
- Git commands are the existing `git:status` / `git:branchCompare` IPC, which already take a worktree path, so no new git invocations and no Git version concerns.
- Existing LocalWP projects already flipped to `kind: 'git'` (the dev profile) are left alone. Flipping them back risks their worktree rows for no visible gain.

## Tests

- `folder-repo-git-upgrade` test: a LocalWP folder project with `.git` gets `gitBacked: true` and keeps `kind: 'folder'`; a blocked plain project gets the flag; the flag clears when `.git` goes.
- Worktree listing test: a git-backed folder workspace reports the real branch.
- `right-sidebar-activity-visibility` test: Source Control and Checks show for a git-backed folder project, stay hidden for a plain folder.
- Manual: Made By Tait in the dev app shows Source Control, the branch, and Checks; New workspace still opens a same-path workspace.

## Estimate

About 2 to 3 hours including tests and a dev-app check.
