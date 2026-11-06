# Bots comment drafts panel

Bots draft ActiveCollab task comments into a queue that shows in a side panel beside the Bots view. You read and edit each draft there, then post it to ActiveCollab from Muster. A bot can list and amend its drafts when you give feedback in chat, and your own edits in the panel are what the bot sees next time.

It is modelled on the Claude Code comment queue mod (`~/.claude/mods/comment-queue`). It keeps the mod's behaviour: one waiting draft per task, a redraft replaces it in place, and drafts are numbered oldest first.

## How it fits together

```
bot ──draft / amend / list tools──▶ Bots server (draft store, SQLite)
                                        │  parentPort: "drafts changed"
                                        ▼
                     Muster main ──HTTP (token)──▶ Bots server drafts API
                        │   └── ActiveCollab connection: task lookup, postComment
                        ▼
                     Bots page side panel (renderer)
```

- **Drafts live in the Bots server.** The bot's tools read and write them there without a round trip to Muster, and the panel's edits write back to the same row, so a bot that lists its drafts sees exactly what you changed.
- **Muster posts.** Posting goes through Muster's existing ActiveCollab connection (`activecollab:postComment`) as the connected user. Bots never post comments themselves.
- **The channel already exists.** The server already sends Muster messages over the utility-process port (`muster:credentials`), and Muster main already calls the server's HTTP API with its capability token.

## Phases

### 1. Draft store and bot tools (fork, about 1 day)

1. A `comment_drafts` table in the Bots server: id, bot id, thread id, project id, task id, body HTML, plain text, status (`waiting`, `posted`, `discarded`), version, `editedBy` (`bot` or `user`), created and updated times.
2. Three Muster-only bot tools, registered beside the existing agents tools (`server/drivers/agents-call.ts`), only when the server runs embedded in Muster:
   - `draft_task_comment(project_id, task_id, body)` adds a draft. If the task already has a waiting draft, it is replaced in place, keeping its place in the queue.
   - `list_comment_drafts(status?, task_id?)` returns waiting drafts with their number, task and current body, including your edits.
   - `amend_comment_draft(draft_id, body, note?)` replaces a waiting draft's body, bumps its version and keeps the previous body for undo. It is refused for a posted or discarded draft.
3. Each change sends `muster:comment-drafts-changed` over the parent port.
4. A short skill note tells bots to queue comments with these tools, never post them, and call `list_comment_drafts` before amending, so they work from your edited text.

### 2. Drafts API and Muster main (about 0.5 day)

1. Server HTTP routes (token-guarded like the rest of the embed API): list, update body (your edit), set status, undo the last amend.
2. Muster main listens for `muster:comment-drafts-changed` and forwards it to the renderer, adds IPC for list, edit, discard, undo and post, and looks up each task's title and project through the existing ActiveCollab connection, cached per task.
3. Post: Muster sends the body through `postComment`. The draft is marked `posted` only after ActiveCollab confirms, so a failed post stays in the queue with the error shown on its card.

### 3. Side panel (about 1.5 days)

1. A column on the right of the Bots page, in Muster rather than inside the webview, so it can reuse Muster's ActiveCollab editor and styling. It opens when the first draft arrives, can be collapsed to a count badge, and remembers whether it was open.
2. Cards follow the chat surface tokens: task title, project, the drafting bot's avatar and name, age, an "Amended by Bob" or "Edited by you" line, and a three-line preview. The oldest waiting draft is number 1.
3. Card actions: **Edit**, **Post**, **Open task**, **Discard**. Undo is offered after an amend.
4. Light and dark, with keyboard access across all cards and actions. At 800px the panel becomes an overlay sheet.

### 4. Editing in the panel (about 1 day)

1. Edit opens the existing ActiveCollab rich editor (`useActiveCollabRichBody`) on the card, with bold, links and @mention chips. It gains a starting-content option so the draft's HTML loads with its mentions as chips.
2. Save writes your text back to the draft (`editedBy: user`), so the bot sees it next time it lists drafts. Post works from the editor too.
3. **A bot amends while you're editing:** your text stays in the editor, and the card shows "Bob updated this draft" with **Use Bob's** and **Keep mine**. Nothing is overwritten silently.

### 5. Asking the bot to amend (about 0.5 day)

1. Plain chat works with no extra UI: "make #3 shorter" leads the bot to list its drafts and amend #3.
2. Each card gets **Ask Bob to change…**: a one-line note sent into the drafting bot's thread as "Feedback on draft #3 (task title): …". The bot then amends that draft.

### 6. Tests and live check (about 0.5 day)

1. Fork: store replace-in-place, amend refused once posted, version bump and undo, tool registration only when embedded.
2. Muster: post success and failure, conflict between a bot amend and an open edit, mention HTML round trip.
3. Live: a bot drafts, you edit, you ask for a change, the bot amends, you post to a test task. Light and dark, 1710px and 800px.
4. Release: fork tag `muster.5`, pin bump, Muster release.

## Estimate

About 5 days. Amending and the conflict handling add about a day to the earlier 3 to 4 day estimate.

## Points to confirm

1. **Draft tools in Bots instead of the ActiveCollab MCP's `draft_task_comment`.** Bots still use the ActiveCollab MCP to read tasks; only drafting moves, because a draft needs an id the bot can amend. The MCP's own drafts made in Claude Code stay with your Claude Code queue mod.
2. **Every bot's drafts in one panel**, labelled by bot.
3. **Posting is always your click.** No bot can post a comment, even when asked to in chat.
