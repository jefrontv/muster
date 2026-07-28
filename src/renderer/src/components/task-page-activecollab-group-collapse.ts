// The collapse key for one ActiveCollab project group, kept pure so the persisted key contract is
// assertable without a DOM — same split as task-page-activecollab-task-grouping.
//
// The keys live in the sidebar's shared `collapsedGroups` set (store/slices/ui.ts), which persists
// through `window.api.ui.set` and rehydrates on launch. That set is a flat string namespace shared
// with the sidebar's repo/host/lineage headers, so the prefix is what keeps an ActiveCollab project
// id from colliding with a repo id that happens to read the same.
//
// Membership means COLLAPSED, so absence is expanded: a project seen for the first time is not in
// the set and renders open, and a collapsed project keeps its key across refetches no matter how
// its task rows change.
export function activeCollabGroupCollapseKey(projectId: number): string {
  return `activecollab-project:${projectId}`
}
