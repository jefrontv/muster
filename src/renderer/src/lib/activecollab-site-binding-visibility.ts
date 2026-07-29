/**
 * Whether the ActiveCollab project → site binding UI is offered.
 *
 * Off for now: the flow works end to end, but binding a project to a site and then starting a
 * pre-briefed workspace reads as two unexplained icons on a task list. Hiding beats deleting —
 * the model, the resolver and their tests stay covered, so turning this back on is one edit here
 * rather than rebuilding the feature.
 *
 * Flipping this to true restores the link button on project headings, the hover action on task
 * rows, and the Start workspace button in the detail pane.
 */
export const ACTIVECOLLAB_SITE_BINDING_UI_ENABLED = false
