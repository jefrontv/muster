# Bots on by default, with a first-visit intro

## Goal

Everyone gets the Bots tab on the next update, and the first time they open it a short intro explains what Bots are.

## Part 1: turn Bots on for everyone

Bots is off today: `experimentalBots: false` in `src/shared/constants.ts:282`, and nothing in main flips it.

Use the same one-shot migration Chat mode used (`experimentalChatModeDefaultedOnForMuster`, `src/main/persistence.ts:2966`):

1. `src/shared/constants.ts`: default `experimentalBots: true`, plus `experimentalBotsDefaultedOnForMuster: true`.
2. `src/shared/types.ts`: add `experimentalBotsDefaultedOnForMuster?: boolean` with a one-line comment.
3. `src/main/persistence.ts`: on load, a profile without the marker gets `experimentalBots: true` and the marker. A profile with the marker keeps whatever it has, so someone who turns Bots off later stays off.
4. Test in the persistence suite: an old profile saved with `experimentalBots: false` loads as on; a migrated profile with it off stays off; a fresh profile is on.

Unchanged:

- Windows still hides the tab (`botsSupported()` in `src/renderer/src/lib/bots-platform.ts`).
- The bots server still starts only when the tab is first opened, so people who never open it pay nothing.
- The toggle stays in Settings → Experimental so anyone can turn it off.

## Part 2: first-visit intro

### When it shows

- The first time `activeView === 'bots'` with Bots on and `botsIntroSeen !== true`.
- It shows straight away, over the "Starting Muster Bots…" state, so the server starts while the person reads.
- Any close (button, Escape, the round close button, outside click) saves `botsIntroSeen: true` through `updateSettings`. It never shows again on that profile.
- New `botsIntroSeen?: boolean` in `GlobalSettings`. It is not migrated: existing Bots users see the intro once too, which is fine because it is short.

### Where it lives

- New `src/renderer/src/components/bots/BotsIntroDialog.tsx`, rendered by `BotsPage` (Muster side, not inside the webview). It uses Muster's `Dialog` primitive and tokens, so it matches the rest of the app and needs no change to the bots fork.
- Copy goes through `translate()` with `auto.components.bots.BotsIntro.*` keys, then `pnpm -s run sync:localization-catalog`.

### Design

Follows STYLEGUIDE modal rules: `bg-popover-solid`, 16px corners, `border-foreground/10`, the Floating shadow, 24px padding, round close button, focus on the primary button.

```
┌──────────────────────────────────────────────────┐
│                                              (×) │
│  ┌────┐                                          │
│  │ 🤖 │   EXPERIMENTAL                           │
│  └────┘                                          │
│  Meet Muster Bots                                │
│  AI helpers that live in Muster. Each bot has    │
│  its own job, memory and schedule, and keeps     │
│  working while you do something else.            │
│                                                  │
│  [icon] Give each bot a job                      │
│         Name it, tell it what it's for, and chat │
│         with it any time.                        │
│  [icon] Run on a schedule                        │
│         Routines like a morning summary run by   │
│         themselves.                              │
│  [icon] Connect your apps                        │
│         Add a Composio key to let bots use Gmail,│
│         Calendar, Slack and more.                │
│  [icon] Remembers what matters                   │
│         Each bot keeps notes you can open and    │
│         edit.                                    │
│                                                  │
│  ──────────────────────────────────────────────  │
│  Bots use your Claude or Codex account and ask   │
│  before risky actions.          [ Get started ]  │
└──────────────────────────────────────────────────┘
```

- Width 480px (`sm:max-w-[480px]`), so the copy stays short per line.
- Hero icon: `Bot` from lucide at `size-7` in a 48px rounded tile with a `bg-foreground/[0.05]` fill (STYLEGUIDE allows `size-7` for featured hero icons).
- "Experimental" as a small muted badge beside the hero tile.
- Title 18px semibold; lede 13px muted.
- Four feature rows: a 32px icon tile (`Bot`, `CalendarClock`, `Plug`, `NotebookPen`, `size-4`, muted ink on a `bg-foreground/[0.05]` fill), 13px medium title, 12px muted line. 12px gap between rows.
- Entrance: the standard Dialog fade and zoom, nothing extra. Reduced motion follows the primitive.
- Footer: a hairline divider, a reassurance line left (12px muted), "Get started" primary button right.
- No bot mascot art: the mascots come from the OpenMausBot project, so the intro sticks to Muster's own icons.

### Tests

- `BotsIntroDialog.test.tsx`: it shows on first visit, closing it saves `botsIntroSeen: true`, it stays hidden once seen, and it doesn't show while Bots is off.

## Checks

- Web and node typecheck, oxlint, oxfmt, max-lines ratchet, localization sync.
- Vitest: persistence migration and the intro dialog.
- Visual check in the dev app: open Bots on a profile with `botsIntroSeen` cleared, screenshot light and dark.

## Not in this change

- The "OpenMausBot" rename inside the Bots UI (separate task, still needed before release).
- Cutting the release.
