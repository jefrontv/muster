# Bots drafts: view the task in a modal beside the comment

## Goal

On a Bots comment draft, "Open task" opens the ActiveCollab task in a modal styled like the Edit comment modal, and not on the Tasks page. Both modals become two views of one dialog, so you can flip between the draft and the original task (description, subtasks and the full comment thread) without losing your place.

## What exists today

- `BotsCommentDraftCard.tsx:280` "Open task" calls `openDraftTask` (`BotsPage.tsx:117`), which leaves the Bots view for the Tasks page.
- `BotsCommentDraftEditor.tsx` is the Edit comment dialog (`DialogContent sm:max-w-2xl`).
- `ActiveCollabTaskWorkspace.tsx` already renders a full task (header, description, subtasks, comments, and writes such as commenting and labels) from a `projectId` and `taskId`. `right-sidebar/TasksPanel.tsx` embeds it in a pane, so it already works outside the Tasks page.

## Design

One dialog, `BotsDraftDialog`, with two views and a segmented switch in the header:

```
Edit comment                     [ Comment | Task ]   x
Hero - this should be a video... · 30462 · Ownworld Lead
------------------------------------------------------
(Comment view)  the current editor, unchanged
(Task view)     ActiveCollabTaskWorkspace, scrolling inside the dialog
```

- "Edit" on a draft card opens it on Comment. "Open task" opens it on Task.
- Both views stay mounted while the dialog is open. Switching to Task and back keeps unsaved comment text, the caret, and any attached files.
- Keyboard: the switch is a Radix tabs list, so arrow keys move between views. `Cmd/Ctrl+1` and `Cmd/Ctrl+2` jump straight to each view.
- Size: the dialog widens to `sm:max-w-3xl` with a fixed height of `min(85vh, 760px)` for both views, so it does not jump in size when switching. The comment editor fills the extra height.
- The task view keeps an "Open on Tasks page" icon in its header for the old full-page behaviour. The workspace's own close button is hidden (`onClose` not passed), because the dialog has its own close button.
- Title line: "Edit comment" in Comment view, the task name in Task view. The subtitle keeps the truncate fix from `dc7d05f31c`.

## Steps

1. Add `BotsDraftDialog.tsx`: the Dialog shell, the header with the view switch, and both views. It owns the `view` state.
2. Split `BotsCommentDraftEditor` into dialog chrome and a body (`BotsCommentDraftEditorBody`) so the new shell can host the body. The editor's conflict banner, attachments and footer move with the body.
3. `BotsCommentDraftCard`: replace the `editing` boolean with `dialogView: 'comment' | 'task' | null`. Edit sets `comment`, Open task sets `task`. Drop `onOpenTask` from the card, panel and `BotsPage` props, and move the "Open on Tasks page" action into the task view.
4. Add i18n keys for "Comment", "Task" and "Open on Tasks page" in en, zh, ja and ko.
5. Tests: the view switch keeps editor text across switches. Open task lands on the Task view. Escape closes the mention menu first in Comment view (existing behaviour) and closes the dialog in Task view.
6. Check it in the dev app with the Ownworld draft from the screenshot: flip views, edit, post.

## Out of scope

- Changing `ActiveCollabTaskWorkspace` itself.
- Opening a task modal from anywhere other than a Bots comment draft.

## Estimate

About 3 hours including tests and a check in the app.
