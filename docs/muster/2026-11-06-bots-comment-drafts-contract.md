# Bots comment drafts: server contract

Shared by the fork (`~/Sites/muster-bots`, branch `muster`) and Muster (`muster-ui`). Plan: `docs/muster/2026-11-06-bots-comment-drafts-plan.md`. Change this file first if the contract has to move.

## Draft

```ts
type CommentDraft = {
  id: string
  number: number | null      // 1-based among waiting drafts, oldest queuedAt first; null when not waiting
  botId: string
  botName: string
  threadId: string
  projectId: number
  taskId: number
  bodyHtml: string           // ActiveCollab comment HTML (p, strong, em, a, mention spans)
  bodyText: string           // plain text, tags stripped, for previews
  status: 'waiting' | 'posted' | 'discarded'
  version: number            // starts at 1, +1 on every body change (bot or user)
  editedBy: 'bot' | 'user'   // who made the latest body change
  amendNote: string | null   // the bot's note on its latest amend
  canUndo: boolean           // a previous body is kept (one level)
  queuedAt: number           // ms; kept when a redraft replaces a waiting draft for the same task
  createdAt: number
  updatedAt: number
}
```

One waiting draft per task id: a new draft for a task that already has a waiting one replaces its body in place (version +1, `editedBy: 'bot'`, `queuedAt` unchanged).

## HTTP (embedded server only)

Exists only when the server runs under Muster (`OMB_DESKTOP_PARENT=1`). Every request carries the header `X-OpenMausBot-Desktop-Owner: <token>` (the capability Muster already sends to `/api/config`); without it the answer is 403.

| Method and path | Body | Answer |
|---|---|---|
| `GET /api/muster/comment-drafts?status=waiting` (default) or `status=all` | | `200 { drafts: CommentDraft[] }`, waiting oldest first; `all` adds the latest 50 posted/discarded, newest first |
| `PATCH /api/muster/comment-drafts/:id` | `{ bodyHtml, bodyText, baseVersion }` | `200 { draft }` with `editedBy: 'user'`; `409 { error, draft }` when `baseVersion` is stale; `410 { error }` when not waiting |
| `POST /api/muster/comment-drafts/:id/status` | `{ status: 'posted' \| 'discarded' }` | `200 { draft }`; `410` when not waiting |
| `POST /api/muster/comment-drafts/:id/undo` | | `200 { draft }` restoring the previous body (version +1); `409` when there is none |
| `POST /api/muster/comment-drafts/:id/feedback` | `{ note }` | `202 {}`; posts a user message into the draft's thread: `Feedback on draft #<number> (task #<taskId>): <note>` and starts the bot's turn the way a typed message would |

## Change signal

After any change (bot tool, HTTP write), the server sends over the utility-process parent port:

```ts
{ type: 'muster:comment-drafts-changed' }
```

Muster refetches on it. No payload.

## Bot tools (embedded server only)

| Tool | Arguments | Result text |
|---|---|---|
| `queue_task_comment` | `project_id`, `task_id`, `body_html` | the draft number and id; says when it replaced an existing draft |
| `list_comment_drafts` | `task_id?`, `status?` (`waiting` default) | each draft: number, id, task, `editedBy`, current body HTML |
| `amend_comment_draft` | `draft` (id or waiting number), `body_html`, `note?` | the new version; refused for a posted or discarded draft |

Bots never post comments. Posting is Muster's job, on the user's click.
