# Parked upstream workflows

These are `stablyai/orca`'s CI workflows, moved out of `.github/workflows/` so they cannot run in
this fork. GitHub Actions only executes workflows under `.github/workflows/`, so parking them here
disables them without losing them.

Why they are disabled:

- **Release/publish** (`release-cut.yml`, `release-mac-build.yml`, `homebrew-bump.yml`,
  `mobile-*-release.yml`, `windows-signing-rehearsal.yml`) — need Apple, SignPath, and PostHog
  secrets this fork does not have, and would publish under upstream's identity.
- **Community automation** (`track-community-prs.yaml`, `issue-os-labeler.yaml`, `pullfrog.yml`,
  `readme-downloads-badge.yml`) — operate on upstream's issue tracker; `readme-downloads-badge`
  also writes to `README.md`.
- **`push`-triggered heavy e2e** (`daemon-relocation-spike.yml`, `win-update-e2e.yml`,
  `win-update-survival-e2e.yml`, `skill-update-roundtrip.yml`, and the other e2e suites) — would
  fire on every push to the fork and burn runners on paths this fork does not ship.

`pr.yml` stays active: it is the lint/typecheck/test gate and only triggers on pull requests.

To restore one, `git mv` it back into `.github/workflows/`.
