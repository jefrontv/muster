# Bots drafts: choose who a posted task is reassigned to

## Goal

"Post & reassign" currently goes to one person: the task's delegator, or its creator if there is no delegator (`handBackTo` in `src/main/bots/bots-comment-draft-tasks.ts:20`). Tasks raised through the feedback tool show "Efront Feedback" there, but the person who should get the task back is someone else on the project, such as Felicity Lemke. The post menu should let you pick that person in one or two clicks.

## Menu

```
Post
---------------------------------------
Post & reassign to Felicity Lemke      <- @mentioned in this comment
Post & reassign to Efront Feedback     <- delegator / creator (today's option)
---------------------------------------
Post & reassign to someone else   >    <- project members, type to filter
```

Quick options, in this order, without duplicates, and never you:

1. The person you last reassigned to in this project, so all 11 Ownworld tasks take one click each.
2. Anyone @mentioned in the draft. The bot greets the person it is answering, so this is usually the right one.
3. The delegator and the creator, listed separately when they are different people.

"Someone else" opens a submenu with the project's members and a filter box at the top. It uses the cached `listActiveCollabProjectMembers` read that @mentions already use. Nothing reads the task detail, so ActiveCollab's "My Updates" counters are left alone.

## Steps

1. `bots-comment-draft-tasks.ts`: replace the single `handBackTo` with `handBackPeople: { userId, name, role: 'delegator' | 'creator' }[]`. Keep `handBackTo` as the first entry so existing callers keep working until step 3.
2. New `bots-draft-reassign-candidates.ts` (renderer): builds the ordered quick list from the remembered person, the draft's mention nodes (`data-user-id` in `bodyHtml`) and `handBackPeople`. It removes duplicates and the signed-in user.
3. `BotsCommentDraftPostButton.tsx`: render the quick options plus a "someone else" `DropdownMenuSub` holding members and a filter input. Picking a person posts with `reassignTo` exactly as today. `postCommentDraft` and the retry toast stay the same.
4. Remember the pick per ActiveCollab project in renderer `localStorage` (`muster.bots.reassign.<projectId>`), wrapped in try/catch. If nothing is stored, the delegator/creator comes first, as it does today.
5. The draft card's compact Post button gets the same menu.
6. Tests: candidate ordering and de-duplication, no self, a mention beating the creator, the remembered person coming first, and the member filter. Then check it in the dev app on an Ownworld draft.

## Out of scope

- Task subscribers. They are only on the task detail read, which marks updates seen.
- Letting the bot suggest who to reassign to.

## Estimate

About 2 to 3 hours including tests.
