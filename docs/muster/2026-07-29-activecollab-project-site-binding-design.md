# ActiveCollab project → site binding, and starting work from a task

**Status:** approved design, not yet planned
**Date:** 2026-07-29

## Problem

ActiveCollab tells you *what* to work on. Muster knows *where* the code lives. Nothing connects
them, so acting on a task means remembering which local site it belongs to, finding that site,
creating a workspace by hand, and re-typing the task into the agent.

This binds an ActiveCollab project to a site once, then turns any task in that project into a
ready-to-work workspace with the task already handed to the coding agent.

## Decisions

Settled with the user before design; recorded because each one closes off alternatives.

| Decision | Choice | Why not the alternative |
|---|---|---|
| Bind target | A **Site** (ocsites) | Repos are workspace-capable but lose the WordPress framing the user works in |
| Cardinality | One site per project; a site may serve many projects | A project spanning several sites would force a picker on every start |
| Start-work UI | Prefilled **New Workspace composer** | A bespoke dialog re-decides naming/branch/prompt and drifts from the composer |
| Placement | Task row (hover) **and** detail pane header | Row alone is invisible until hover; pane alone is slow from a list scan |
| Site with no repo | Offer to open it as a repo, then continue | Disabling leaves a dead end the user must resolve elsewhere |
| Storage | Per-profile settings map | Site record inverts the lookup; a registry is a subsystem for one map |

## Data

One new setting:

```ts
/** "<instanceUrl>::<projectId>" → siteId. */
activeCollabProjectSites: Record<string, string>
```

Keys are built by a shared `activeCollabProjectSiteKey(instanceUrl, projectId)` helper.

**Why instance-keyed:** project ids are only unique within an ActiveCollab instance. Connecting a
second account would otherwise inherit the first account's bindings and silently point tasks at the
wrong site. The notification snapshot is keyed the same way for the same reason.

`instanceUrl` is optional on the identity type, so the helper normalises a missing or blank value
to the literal `unknown-instance` rather than producing a key with an empty segment. That keeps
keys well-formed and total; a binding made while the instance URL was unavailable stays readable
once it is known only if the URL matches, which is the safe direction — a stale binding reads as
unbound instead of pointing at the wrong site.

**Why a map and not a list on the Site:** the question the UI asks on every render is "what is this
project bound to?". A `Record<projectKey, siteId>` answers it directly and expresses "one site per
project, many projects per site" in the type. A list on each Site would invert that and require
scanning every site.

The value is a `Site.id`. Sites can disappear, so every read resolves through the sites slice and
treats a missing site as unbound rather than trusting the stored id.

## Components

### Bind button — project group header

An icon button on the `ActiveCollabTaskGroupSection` header row, beside the existing collapse
chevron. It must not steal the header's collapse activation: the chevron already owns the row, so
the new control is a real `<button>` with its own accessible name, matching the sidebar's existing
nested-control treatment.

Two states:

- **Unbound** — outline link icon, tooltip "Link this project to a site".
- **Bound** — filled link icon, tooltip naming the bound site.

Click opens a popover with a searchable list of sites (display name plus path, because display
names repeat across clients) and an **Unbind** action when bound.

### Start-work button — two surfaces, one handler

- Task row: hover-revealed icon, matching the sidebar's hover-reveal idiom.
- Detail pane header: labelled button beside the existing task actions.

Both call a single shared handler. Two call sites for one behaviour is exactly how surfaces drift,
so the behaviour lives in one place and the buttons only render state.

Visibility: hidden when the project is unbound rather than disabled-and-mysterious, except in the
detail pane where it renders disabled with a tooltip explaining that the project needs binding —
the pane has room for the explanation and is where a user goes looking for actions.

## Flow

1. Resolve the task's project key, look up the bound site id, resolve it through the sites slice.
2. No binding, or the site no longer exists → surface as unbound with a re-bind affordance.
3. Site exists but `repoId` is null → explain the site is not open as a repo yet and offer to open
   it; on success continue, on cancel abort without side effects.
4. Open the New Workspace composer prefilled with:
   - **repo** — the site's `repoId`
   - **workspace name** — derived from the task title via the existing
     `getLinkedWorkItemWorkspaceName`
   - **linked work item** — `provider: 'activecollab'` using the existing
     `ActiveCollabTaskProviderIdentity` (`instanceUrl`, `projectId`, `projectName`)
   - **initial prompt** — the task name, its ActiveCollab URL, and the task body converted to
     plain text and truncated to a bounded length. Body only, never the comment thread: comments
     are discussion, frequently contradict the brief, and would let a stray remark read as an
     instruction. The user can still edit the prompt before creating.
   - **harness** — left to the composer's existing agent picker; no new picker is introduced

The provider is already accepted by `normalizeFolderWorkspaceLinkedTask` and
`ActiveCollabTaskProviderIdentity` already exists, so this reuses the linked-task model rather than
extending it.

## Error handling

| Case | Behaviour |
|---|---|
| Project not bound | Row button hidden; pane button disabled with a reason |
| Bound site deleted | Treated as unbound, with a re-bind affordance; the stale key is cleared on next bind |
| Site has no repo | Offer to open as a repo, then continue; cancelling aborts cleanly |
| Second ActiveCollab account | Instance-keyed keys mean its projects start unbound |
| Settings write fails | Surfaced by the existing settings path; no bespoke error surface |

## Testing

- **Unit** — `activeCollabProjectSiteKey`; the resolve-site-for-task selector across bound,
  unbound, missing-site and null-`repoId`.
- **Component** — group header renders bound vs unbound state and exposes an accessible name
  distinct from the collapse control; start-work hidden when unbound in the row and disabled with a
  reason in the pane.
- **No new e2e.** The composer it opens is already covered.

Tests assert observable behaviour: that an unbound project cannot start work, and that a bound one
resolves to the right site. A test that only asserts a setting was written would pass against a
button wired to nothing.

## Out of scope

Per-environment bindings (production vs staging), auto-binding by name similarity, bulk binding,
and syncing bindings across machines. Each is speculative until the single binding is in use.
