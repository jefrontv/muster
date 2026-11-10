# Comment drafts: attachments

Let a bot attach files and images to a queued ActiveCollab comment draft, and let the person add or remove files in the draft editor before posting. Muster already uploads comment attachments for its own task composer (`src/main/activecollab/comment-attachment-upload.ts`, `attachmentCodes` in `mutations.ts:180`), so posting reuses that path. The new work is storing files on the draft and showing them.

## How it works

1. A bot passes file paths to `queue_task_comment` or `amend_comment_draft`.
2. The Bots server copies each file into the draft's own folder (`<data>/comment-drafts/<draftId>/`). The bot can't change or delete a file after queueing, and workspace cleanup can't break the draft.
3. The draft card shows the files as chips (images as small thumbnails). The editor lets the person add files (picker, drag and drop, paste an image) and remove any file.
4. On Post, Muster uploads every file to ActiveCollab first, then posts the comment with the upload codes. If any upload fails, nothing posts and the draft stays waiting.

Limits match ActiveCollab and the existing composer: 20 files, 64 MB each, 128 MB per comment.

## 1. Bots server (muster-bots, about 2.5 h)

1. Add `attachments: { id, name, size, mime, addedBy: "bot" | "user" }[]` to `CommentDraft` (`shared/muster-comment-drafts.ts`) and the contract doc. Old drafts load with `[]`.
2. `queue_task_comment` and `amend_comment_draft` take an optional `attachments: string[]` of paths. A path must sit inside the bot's workspace, its folder (`cwd`) or Downloads, the same roots as `server/index.ts:2475`. Anything else is refused with the reason.
3. On amend, `attachments` replaces the bot's own files and keeps the person's. Every attachment change bumps `version`, so the existing conflict check covers it.
4. Routes: `GET /api/muster/comment-drafts/<id>/attachments/<aid>` (file bytes, for previews and posting), `POST .../attachments` (person adds a file), `DELETE .../attachments/<aid>`.
5. Discarding or posting a draft deletes its folder after the undo window.
6. Tests: path outside the allowed roots refused, limits, amend keeps the person's files, version bump, cleanup.

## 2. Muster main process (about 1.5 h)

1. Extend `BotsCommentDraft` in `shared/bots-comment-draft-types.ts` with the attachment list.
2. New IPC `bots:addCommentDraftAttachments` (opens the existing picker from `acPickCommentAttachments`, or takes pasted/dropped paths) and `bots:removeCommentDraftAttachment`.
3. In `postBotsCommentDraft`, before posting: fetch each file from the Bots server into a temp folder, upload with `uploadAcCommentAttachments`, then post with `attachmentCodes`. The temp folder is removed afterwards. A failed upload returns a new `attachments-failed` reason naming the file.
4. Tests in `bots-comment-draft-post.test.ts`: post with files, an upload failure blocks the post, no files sends no `attach_uploaded_files` key.

## 3. Renderer (about 2 h)

1. `BotsCommentDraftCard.tsx`: a row of chips under the body. Images show a 32px thumbnail, other files an icon, name and size. Clicking an image opens it large.
2. `BotsCommentDraftEditor.tsx`: the same chips with a remove button, an "Attach files" button, drag and drop onto the editor, and paste of an image from the clipboard.
3. The Post button shows "Post (3 files)" when files are attached, so the person sees they go with the comment.
4. Keyboard: each chip's remove button is a tab stop with `aria-label="Remove <name>"`.
5. Test in `BotsCommentDraftsPanel.test.tsx`: chips render, remove sends the right id.

## Checks

Typecheck, touched test files, then a live run on task 520738 with one image from a Haiku bot and one file added by hand, posted for real only if you say so. About 30 minutes.

Total: about 6.5 h, then a Bots release and a Muster release.

## Open questions

1. Images go in as attachments, not inline in the comment body. Inline images need ActiveCollab's inline-image markup, which I'd leave for later unless you want it now.
2. Bots that run on a remote host (SSH or VM) write files on that host. This plan covers files on this computer only. Remote files would need the server to pull them first.
