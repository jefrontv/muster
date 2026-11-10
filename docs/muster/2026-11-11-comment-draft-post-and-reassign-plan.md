# Comment drafts: Post & reassign

Add a dropdown to the Post button on a bot's ActiveCollab comment draft with one extra action, **Post & reassign**. It posts the comment, then assigns the task back to the person who handed it over. All code is in muster-ui; muster-bots needs no change.

## Who the task goes back to

1. `delegated_by_id` when set (the person who assigned it).
2. Otherwise `created_by_id`.
3. If neither is set, or it is the signed-in user, the menu item is disabled with the tooltip "No one to hand this back to".

The menu item names the person: "Post & reassign to Sarah". Names come from the ActiveCollab user list the app already caches.

## 1. Task data (main process, about 45 min)

1. Parse `delegated_by_id` in `normaliseTask` (`src/main/activecollab/tasks.ts:82`) and add it to the task type in `shared/activecollab-types.ts:72`.
2. Read both ids from the project task list that `bots-comment-draft-tasks.ts` already fetches. No task detail GET, since that marks the task's updates as seen.
3. Expose a `handBackTo: { userId, name } | null` on each draft's task info sent to the renderer.

## 2. Post & reassign (main process, about 45 min)

1. Add `reassign?: boolean` to the `bots:postCommentDraft` IPC args (`preload/api-types.ts:1043`, `src/main/ipc/bots-comment-drafts.ts:119`).
2. In `postBotsCommentDraft` (`src/main/bots/bots-comment-draft-post.ts`), after the comment posts, call `acUpdateTask` with `assigneeId: handBackTo.userId`.
3. If the comment posts but the reassign fails, the draft still shows as posted and the card shows "Posted, but couldn't reassign: <reason>" with a Retry reassign button. The comment never posts twice.
4. Tests in `bots-comment-draft-post.test.ts`: post and reassign, reassign failure after a good post, no hand-back person.

## 3. Split button (renderer, about 1 h)

1. In `BotsCommentDraftCard.tsx:222`, wrap Post in a `ButtonGroup` with a `DropdownMenuTrigger` chevron, copying the pattern at `GitHubItemDialog.tsx:6542`.
2. Same in the editor's "Post to ActiveCollab" button (`BotsCommentDraftEditor.tsx:259`).
3. The menu holds "Post" and "Post & reassign to <name>". Plain click on the main button stays Post.
4. Keyboard: the chevron is a separate tab stop with `aria-label="More post options"`; the menu uses the existing dropdown primitives, so arrow keys and Escape work.
5. Test in `BotsCommentDraftsPanel.test.tsx`: choosing Post & reassign sends `reassign: true`.

## Checks

Typecheck, the touched test files, then a live run against a real task. About 30 minutes.

Open question: should Post & reassign also clear the `IN PROGRESS` label? I'd leave labels alone unless you want that.
