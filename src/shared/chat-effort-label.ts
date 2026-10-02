// Which effort the chat composer may claim, in order of certainty: the level Muster
// passed with --effort, else the user's Claude settings `effortLevel`, else the CLI
// default. Never fills in a catalog default the CLI was not given.

export type ChatEffortLabelSource = 'muster' | 'settings' | 'default'

export type ChatEffortLabel = { value: string | null; source: ChatEffortLabelSource }

export function resolveChatEffortLabel(input: {
  /** The effort applied as a launch flag for this session (or picked for the next one). */
  applied: string | null | undefined
  /** `effortLevel` read from ~/.claude/settings.json. */
  settings: string | null | undefined
}): ChatEffortLabel {
  if (input.applied) {
    return { value: input.applied, source: 'muster' }
  }
  if (input.settings) {
    return { value: input.settings, source: 'settings' }
  }
  return { value: null, source: 'default' }
}
