# Claude usage-limit resets: count + expiry

## Findings

- Source: `GET https://api.anthropic.com/api/oauth/usage?cedar_ember=1`, the same endpoint Muster already polls, plus one query flag. oh-my-pi reads it the same way (`packages/ai/src/usage/claude-reset.ts`).
- Without the flag, `cedar_ember` is `null`, which means "not evaluated", not "no resets".
- The User-Agent matters. Muster sends `claude-code/2.1.0`, and the server answers `eligible: false, ineligible_reason: "surface"` with an empty `grants` list. Sending `claude-cli/<version> (external, cli)` returns the real grants.
- A second program, `juniper_tide` (a session-only reset, probed with `?at_wall=1`), returned `null` for this account. It is out of scope for this pass.

Live response on this account (trimmed):

```json
"cedar_ember": {
  "eligible": true,
  "grants": [{
    "id": "opus55-launch-team-20260921",
    "label": "Claude Opus 5.5 launch: one usage-limit reset for Team members",
    "resets_total": 1,
    "resets_left": 1,
    "starts_at": "2026-09-22T16:00:00+00:00",
    "ends_at": "2026-10-22T16:00:00+00:00",
    "clears": ["five_hour", "seven_day", "seven_day_overage_included"],
    "paused": false,
    "usable_now": true
  }],
  "next_grant_id": "opus55-launch-team-20260921",
  "cooldown_until": null
}
```

## Mapping

Reuse the existing `ProviderRateLimits.rateLimitResetCredits` shape, which Codex already fills:

| Muster field | From |
| --- | --- |
| `availableCount` | sum of `resets_left` over grants that are not expired |
| `totalEarnedCount` | sum of `resets_total` |
| `nextExpiresAt` | earliest `ends_at` among grants that still have resets left |
| `credits[]` | one entry per grant: `status` (available / redeemed / paused / expired), `expiresAt` = `ends_at`, `grantedAt` = `starts_at` |

## Changes

1. `src/main/rate-limits/claude-fetcher.ts`: add `?cedar_ember=1` to `OAUTH_USAGE_URL` and change the User-Agent to `claude-cli/<version> (external, cli)`. Reuse the installed CLI version if Muster already detects it; otherwise pin a constant.
2. New `src/main/rate-limits/claude-reset-credits.ts`: parse `cedar_ember` into `rateLimitResetCredits`. A malformed block returns `undefined`, so usage still renders.
3. `fetchViaOAuth`: attach `rateLimitResetCredits` to the result.
4. Renderer: drop the `provider === 'codex'` gate at `status-bar/tooltip.tsx:327` so the usage popup shows "1 reset · Expires in 25d" for Claude. The status bar chip stays window-names-only, following the declutter decision.
5. Tests: parser unit tests (eligible with grants, expired grant, zero left, null block, malformed block) plus a fetcher test that asserts the query flag and the User-Agent.

## Out of scope

- Redeeming a reset from Muster.
- `juniper_tide` session resets.
- The PTY and CLI fallback paths. They have no reset data, so the field stays `undefined` there.

## Risk

- Changing the User-Agent affects the usage fetch everywhere. Check that `five_hour`, `seven_day` and Fable still parse. They did in today's probe.
