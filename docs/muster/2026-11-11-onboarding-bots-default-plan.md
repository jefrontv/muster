# Onboarding: Bots replaces Chat as a starting view

The "How do you want to start?" step already lists Bots beside Chat and Code when Bots is on. This change takes Chat out of that step whenever Bots is available, so the choice is **Bots** or **Code**. All code is in `src/renderer/src/components/onboarding/`. About 1 h 15 min in total.

## Behaviour

- Bots on and supported (macOS, Linux): the step shows Bots and Code. Bots is listed first and preselected.
- Bots off or unsupported (Windows, or the user switched Bots off): the step falls back to today's Chat and Code, so nobody ends up with a single option and a skipped step.
- Chat stays in the app's top tabs. Only the onboarding choice changes.

## 1. Options (about 20 min)

1. `onboarding-default-view-step.tsx:11` `availableOnboardingDefaultViews`: return `['bots', 'code']` when Bots is available, else `['chat', 'code']` (Chat only where `chatModeSupported()`).
2. `use-onboarding-flow.ts:229`: preselect `'bots'` when it is offered and the person has no earlier choice, instead of resolving the current `activeView`.
3. The grid drops to two columns on its own (`views.length > 2` check at `:94`).

## 2. Copy and finish button (about 25 min)

1. `onboarding-step-copy.ts:69` and the `defaultViewSubtitleWithBots` key: new subtitle "Bots run tasks for you across your apps. Code is worktrees, terminals and the classic IDE layout. You can switch any time from the top bar."
2. `onboarding-finish-cta.ts:8`: `'bots'` gets "Open Bots" instead of "Set up your first site".
3. `OnboardingFlow.tsx:44`: the Agent step's subtitle covers Bots as well as Chat.

## 3. Tests (about 30 min)

1. `onboarding-default-view-step.test.ts`: Bots on gives `['bots', 'code']` with no Chat; Bots off gives `['chat', 'code']`.
2. `onboarding-finish-cta.test.ts`: the Bots label.
3. `OnboardingFlow.test.tsx`: Bots preselected and the step count unchanged; the Chat cases run with Bots switched off.

## Open question

Picking Bots skips the site tools and folders steps, the same as Chat does today. I'd keep that. Bots users can add sites later from Settings.
