# Chat mode: queued messages and steering

## Problem

In chat mode, a message sent while the agent is working shows up as a bubble pinned under the thread. It can sit there until the whole turn finishes and then run as a separate turn. There's no way to tell the agent "use this now", and no way to edit or remove a queued message.

## What the CLI does (tested 2026-10-09, Claude Code 2.1.295, Haiku)

A user message written to the CLI's stdin mid-turn accepts a `priority` field (`'now' | 'next' | 'later'`, from the Agent SDK's `SDKUserMessage` type). I tested each value against a turn running three `sleep 5` tool calls:

| priority | Result |
|---|---|
| `later` | Waits for the turn to finish, then runs as a new turn. |
| `next` | Delivered at the next tool call in the same turn. The running command finishes and the agent carries on with the new message in view. |
| `now` | Cuts off the running command, ends the turn, and starts a new turn with the message. |
| omitted | The CLI picks `next` or `later` from a server-side feature flag (`tengu_pencil_farmer`). It was `next` on my account; the reported bug matches `later`. |

Muster sends mid-turn messages today (`sendChatThreadStreamMessage` in `src/main/chat-mode/chat-thread-stream.ts`) with no `priority`, so the behaviour depends on the account's flag.

## Proposed behaviour

1. **Enter while the agent is working queues the message.** Nothing is written to the CLI yet. The message appears in a queue strip directly above the composer, not as a bubble in the thread.
2. **Each queued message has three actions:**
   - **Steer**: send it now with `priority: 'next'`. The agent gets it at its next step without losing the command it's running.
   - **Edit**: move the text back into the composer and remove it from the queue.
   - **Remove**: drop it.
3. **Cmd/Ctrl+Enter while working steers straight away**, skipping the queue (the Claude Code shortcut). The composer hint shows this while the agent is working: "Enter to queue · ⌘Enter to steer" (Ctrl on Windows and Linux).
4. **When the turn ends, the queue drains in order.** The first queued message is sent as a normal turn. The rest stay queued until that turn ends too, so each message gets its own turn, the same as typing them one at a time.
5. **Stop (the existing interrupt) leaves the queue alone.** The queue doesn't auto-send after a Stop, so the user decides what happens next. The strip shows "Paused" with a Send next button.
6. **A steered message shows as "Steering…"** in the strip until the CLI hands it to the model. It then appears inline in the transcript at that point (the `queued_command` decoder from efd4694a73 already handles placement) and leaves the strip.
7. **Every send sets `priority` explicitly**, so behaviour no longer depends on the account flag: `'next'` for steer, none needed for an idle send.

I'm leaving out an "Interrupt and send" (`now`) button. It kills the running command (a build or test run, say), and Stop followed by Send already does the same thing on purpose. It's easy to add later as a menu item on a queued message if you want it.

## Where the queue lives

In the main process, next to the thread's stream entry. Main already owns the chat process lifecycle, sees `turn-complete` first, and keeps working when the thread isn't on screen. A renderer queue would stall when the window reloads or the user switches threads.

- New per-thread queue in `src/main/chat-mode/` (`chat-thread-message-queue.ts`) holding `{ id, text, imagePaths, queuedAt, state: 'queued' | 'steering' }`.
- New IPC: `chatThreadStream:queue`, `:steer`, `:unqueue`, `:sendNext`, plus a `queue-changed` stream event carrying the thread's queue. These go through preload and `api-types.ts`.
- On `turn-complete`: if the turn wasn't interrupted, send the head of the queue.
- On thread stop, delete or process exit: clear the queue and emit `queue-changed`.
- Persisted with the thread state, so a queued message survives an app restart? **Recommend no** for v1: on restart the agent isn't running, and replaying stale instructions is risky. The queue is memory only.

## Renderer

- `NativeChatQueueStrip.tsx` above the composer: one compact row per message (text truncated to one line, image count if any), with Steer, Edit and Remove icon buttons with tooltips. A row in the steering state shows a spinner and "Steering…". Uses shadcn `Button` (ghost, icon size) and STYLEGUIDE tokens.
- The composer's Enter/Cmd+Enter handling in `use-native-chat-composer-keydown.ts` checks the thread's working state: working means queue (or steer with Cmd/Ctrl+Enter), idle means send as today.
- The optimistic pending bubble (`native-chat-pending.ts`, `use-native-chat-optimistic-turns.ts`) is no longer created for queued sends. It stays for idle sends.
- Keyboard: the strip's buttons are reachable with Tab, and each has an aria-label that includes the truncated message text.

## Scope

- In: chat mode threads on the stream-json transport (Claude).
- Out: native chat in terminal panes (`native-chat-pty-send-queue.ts`), which types into a TUI and has no `priority` field. It keeps today's behaviour.
- Chat mode runs the CLI locally only (no SSH path in `chat-thread-stream.ts`), so there's no remote variant to handle.

## Tests

- Main: queue ordering, drain on `turn-complete`, no drain after interrupt, `sendNext` after a pause, clearing on stop and exit, and the `priority: 'next'` payload for steer.
- Renderer: key handling (Enter queues while working, Cmd/Ctrl+Enter steers, idle Enter sends), strip actions, and Edit moving text back into an empty composer (it asks first if the composer already has text).
- Real app: a turn with a long-running command, queue two messages, steer one, check it lands mid-turn, check the other drains after.

## Estimate

About a day: half a day for main, the queue and IPC, and half a day for the strip, the keys and tests. One commit per half.

## Open questions

1. Should Edit put the text back into the composer (my pick), or edit in place in the strip?
2. After Stop, should the queue pause (my pick) or keep auto-sending?
