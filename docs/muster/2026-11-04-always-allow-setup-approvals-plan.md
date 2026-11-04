# Always allow a setup action without approval

Status: draft for review (2026-11-04)

## Goal

On an agent's approval card, a toggle lets the user say "always allow this action". Later requests for that action skip the card and run at once. The user can see and revoke every standing grant in Settings.

## What exists

- Ten actions go through the card (`stageSetupWrite` in `src/main/sites/mcp/*-tools.ts`): `create_project`, `update_project`, `remove_project`, `create_worktree`, `add_site_root`, `register_site`, `configure_site`, `import_site_config`, `set_up_local_site`, `request_site_secret`.
- "Approve for this site" (`approved-site`) already skips the card for one site until Muster quits (`approvedSites` in `src/main/sites/site-setup-approval-requests.ts`). It is never saved.
- The GUI runs a staged write only after `consumeSiteSetupApproval` spends a one-time approval for that exact action, so the loopback bridge cannot skip the card. That stays true: a standing grant issues that approval in main, never in the MCP process.

## Design

1. **Scope: per action, every site, every agent.** The agent name on a card is self-reported, so a grant cannot be tied to one agent. A grant for `create_project` covers any agent creating any project.
2. **Never eligible:** `request_site_secret` (a password needs the person every time) and `remove_project` (it deletes). The toggle doesn't appear on those cards.
3. **Saved** in `GlobalSettings.siteSetupAlwaysAllow: string[]` (action names), validated against the eligible list on read, so a hand-edited or stale entry is ignored.
4. **Main:** `openSiteSetupApproval` checks the saved grants after the session site grants. A match retains an `approved` decision and returns it without a card, the same path `approved-site` takes today. `respondSiteSetupApproval` takes `alwaysAllow: boolean`; on an approved, eligible card it adds the action to settings.
5. **Card** (`SiteSetupApprovalDialog.tsx`): a checkbox under the details, "Always allow {action} without asking", with the caption "Any agent, any site. Change it in Settings → Agent Capabilities." Off by default, reset for every card. Ticking it doesn't approve; the Approve button does.
6. **Settings → Agent Capabilities:** an "Allowed without asking" subsection listing each granted action by its human label, with a Remove button each, and an empty state "Every setup change asks first." Searchable like the rest of the pane.
7. **Agent-facing:** when a grant answers, the tool result says `status: "approved"` as it does for a site grant now; nothing new to learn.

## Tests

- Main: a grant skips the card; an ineligible action never skips; a password card ignores `alwaysAllow`; a denied card with the toggle ticked saves nothing; a removed grant asks again; `consumeSiteSetupApproval` still refuses a forged or replayed id.
- Renderer: the toggle is absent on ineligible cards, resets between cards, and sends `alwaysAllow`; the settings list removes a grant.

## Open question

- Should `remove_project` be eligible too? This plan says no: one mistaken "always" would let any agent remove projects silently.

## Effort

About 2 hours with tests and a live check on the dev app.
