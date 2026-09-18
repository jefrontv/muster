# Optional reporter name on in-app feedback

2026-09-18. Let a person add their name when they send feedback from Muster. When set, the filed issue body starts with `Issue posted by: <Name>`. Prompted by jefrontv/muster#29, which arrived as "Reported by: anonymous" with no way to reply to the person.

## How feedback flows today (verified against the code)

- Form: `src/renderer/src/components/sidebar/SidebarFeedbackDialog.tsx`. Feedback textarea, a "submit anonymously" checkbox, and the GitHub viewer identity when `gh` is signed in. Nothing is remembered between submissions.
- Bridge: `src/preload/index.ts:1426` `feedback.submit(args)` invokes IPC `feedback:submit`.
- Main: `src/main/ipc/feedback.ts` allow-lists fields into a body. Two lanes:
  - `gh` lane builds the markdown itself (`buildIssueBody`) and files as the user.
  - Endpoint lane posts raw fields (`FeedbackEndpointPayload` in `src/main/github/feedback-endpoint.ts`) to `https://muster.tools.efront.dev/feedback.php`, which rebuilds the body in `inc/feedback-issue.php` `feedback_issue_body()` and files under the bot. This is the lane #29 used.
- Endpoint source: `~/Sites/muster-website` (its own Bitbucket repo, `main`, with unrelated uncommitted work). The deployed copy on `tools@tools.efront.dev:muster/` is the source of truth.

## Changes

### Muster

1. Dialog. Add a single-line "Your name (optional)" input to the feedback dialog, max 80 characters. Remember the last value in `localStorage` (`muster.feedback.reporterName`) so it prefills next time; wrapped in try/catch like the other per-viewer conveniences. Pass `reporterName` in `window.api.feedback.submit`. The field is independent of the anonymous checkbox: anonymous hides the GitHub identity, and a typed name is an explicit choice. New i18n keys in `en.json` and the other locale files with the English fallback, matching the existing precedent.
2. Preload. `reporterName?: string` on the submit args type at `src/preload/index.ts:1426`, and wherever `PreloadApi['feedback']` is declared.
3. Main `src/main/ipc/feedback.ts`. `FeedbackSubmitArgs.reporterName?: string`. `buildSubmitBody` sanitises it: trim, collapse whitespace, drop control characters, cap at 80, empty becomes `null`. `buildIssueBody` prepends `Issue posted by: <name>` and a blank line when set. The sanitised value is passed through to the endpoint payload. The crash lane is unchanged.
4. `src/main/github/feedback-endpoint.ts`. `reporterName: string | null` on `FeedbackEndpointPayload`.
5. Tests. New `src/main/ipc/feedback.test.ts`: sanitisation cases (whitespace, newline, over-length, empty) and the body prefix present or absent. Locale key census stays green.

### Endpoint (`~/Sites/muster-website`)

6. `feedback.php`. `'reporterName' => clean_reporter_name($input['reporterName'] ?? null)`: trim, strip newlines and control characters, `mb_substr` to 80, empty becomes `null`. Unknown or missing field stays `null`, so old app versions keep working.
7. `inc/feedback-issue.php` `feedback_issue_body()`. When the name is set, the first section is `'Issue posted by: ' . neutralize_github_refs($name)` followed by a blank line, then the feedback text. The environment block's `Reported by` row (GitHub identity) is unchanged.
8. Deploy the two changed files to `tools@tools.efront.dev:muster/` before the Muster release ships. Until then the live endpoint ignores the field and the name is silently dropped; nothing errors.

## Release

Muster 1.14.12 after the endpoint is live. Endpoint first, app second, so the first build that sends a name lands on an endpoint that reads it.

## Questions for you

1. How do you deploy the endpoint files to `tools.efront.dev`? I found no script in the website repo. If you tell me the command or alias, I will run it; otherwise I will leave the two files edited locally for you to push.
2. Body only, as asked, or also in the title? Plan: body only.
3. Remember the name between submissions? Plan: yes, `localStorage`, cleared when the field is emptied.
4. The website repo has unrelated uncommitted changes. Plan: leave the endpoint edits uncommitted there for you to commit with your other work.

## Out of scope

Crash report dialog (main-only lane, no form), `gh`-lane identity changes, issue title format.

## Effort

About 45 minutes for the Muster side with tests, 15 minutes for the endpoint, plus the deploy and the release run.
