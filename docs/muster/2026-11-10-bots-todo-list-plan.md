# Bots to-do list (concept B, beside the chat)

Each bot gets one to-do list (changed from one per project on 2026-11-11) that bots manage with a `todo_list` tool, and that the person sees and edits in a **To-do** tab in the right-hand panel next to the chat. Approved concept: B from `scratchpad/todo-concepts/concepts.html`.

All code changes are in `muster-bots`. Muster itself only pins the new Bots build.

## Scope

- **One list per bot.** Every thread of the bot shares it, inside a project or not. Older project and thread lists merge into it on load.
- **Five states.** `todo`, `in_progress`, `done`, `blocked` and `skipped`. Blocked and skipped need a reason. Several items can be in progress at once.
- **Out of scope for now:** the Files and Notes tabs shown in the concept, lists shared between different bots, and phone layout beyond the existing panel behaviour.

## 1. Storage and API (server, about 2 h)

1. Add `server/todo-lists.ts`: a store backed by `DATA_DIR/todo-lists.json`, written atomically with the existing `atomic.ts`. Lists are keyed by `bot:<botId>`. Each item has an id, title, status, optional reason, the thread that last changed it, who changed it (bot or person) and a timestamp. Limits are 200 items per list and 200 characters per title or reason.
2. Add `server/routes/todo-lists.ts` for the person:
   - `GET /api/bots/:id/todo?threadId=` returns the list that applies to that thread.
   - `POST` on the same path adds, updates, removes and reorders items, with the same body shape as the tool.
3. Add a live frame, `todo.changed { botId, listKey }`, so open panels refresh with no polling.
4. Delete a bot's list when the bot is deleted.

## 2. The `todo_list` tool (about 1.5 h)

1. Add `server/drivers/agents-todo-tools.ts`, shaped like `agents-department-tools.ts`. It defines one tool, `todo_list`, with actions `get`, `add`, `update`, `remove` and `reorder`, and routes to `/api/internal/todo` for the calling bot and thread.
2. Register the tool in `agents-catalog.ts` and `agents-call.ts` for every bot, not only the Chief. Regenerate the catalog goldens and move the budget baseline by hand.
3. Validation errors come back as short plain text the bot can act on, such as `"blocked needs a reason"` or `"no item t9"`.
4. The tool description tells bots to read the list at the start of multi-step work, keep it current, and give a reason when blocking or skipping. Bots don't use it for one-off questions.

## 3. To-do tab in the panel (UI, about 3 h)

1. Add `todo` to `ComputerPanelView` and `PANEL_TABS` (ListChecks icon). It's shown in both simple and advanced layouts, first after Computer.
2. Add `src/components/TodoPanel.tsx`, built as in the concept:
   - A header with the project name and a progress bar split by state, plus "2 of 6 done · 1 skipped".
   - Groups: In progress, Waiting on you (blocked), Up next, then Done and skipped, collapsed after 5 items.
   - Each item shows its status icon, title, reason, and "Started 2 min ago in "Homepage"".
   - The person can click the status icon to cycle todo, in progress, done; a menu sets blocked or skipped with a reason. They can also add an item, rename it inline, delete it and drag to reorder.
   - The empty state reads: "No to-dos yet. Bots add them when they plan multi-step work, or add one yourself."
3. In chat, a `todo_list` tool call shows as one line, for example: Marked "Draft the new sitemap" done, plus 2 more changes. It uses `tool-step-label.ts`, and clicking the line opens the To-do tab.
4. Add English locale strings, and update the `vocabulary` and i18n tests.

## 4. Checks and demo (about 1.5 h)

1. Write unit tests for the store (limits, reasons required, keys, deletes), the route and the tool call, plus a DOM test for the panel groups and status cycling.
2. Run the server and app typechecks, lint, and the catalog golden test.
3. Run a live demo in the dev app on Haiku: a bot plans a website task, updates the list, and blocks an item. You review it in the To-do tab.
4. Release together with the MCP account fix (`77b3dd2e1`) as Bots muster.13 and Muster 1.15.22, once you approve the demo.

Total: about 8 h of work before the demo.

## Decisions for you

- **To-do tab sits in the existing right-hand panel** (beside Computer, Browser and Routines) instead of a new panel. This reuses its resizing, tabs and mobile handling.
- **Lists belong to one bot.** Two bots don't share a list.
