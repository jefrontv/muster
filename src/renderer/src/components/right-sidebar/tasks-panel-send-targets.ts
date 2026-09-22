// Which open sessions in this workspace can actually receive a task prompt.
//
// The rule that matters: a tab with no pty cannot take a paste. `submitPromptToAgentTab` waits for
// one and answers false when it never arrives, so offering a starting or exited tab as a
// destination produces a click that silently does nothing. Better to leave it out of the list.
//
// Agent-launched tabs come first because they are what someone means by "send it to my agent". A
// plain shell is still offered, last and unlabelled, because `launchAgent` is only set when Muster
// started the agent — someone who ran `claude` by hand has a perfectly good session that Muster
// cannot identify, and refusing it would be wrong more often than offering it.

import type { TerminalTab, TuiAgent } from '../../../../shared/types'

export type TaskSendTarget = {
  tabId: string
  label: string
  /** Absent for a tab Muster did not launch an agent in, including a hand-started one. */
  agent?: TuiAgent
}

function labelFor(tab: TerminalTab): string {
  const label = tab.customTitle?.trim() || tab.title?.trim() || tab.defaultTitle?.trim()
  return label && label.length > 0 ? label : 'Terminal'
}

export function listTaskSendTargets(
  tabs: readonly TerminalTab[] | null | undefined
): TaskSendTarget[] {
  const live = (tabs ?? []).filter((tab) => typeof tab.ptyId === 'string' && tab.ptyId.length > 0)
  const targets = live.map((tab) => ({
    tabId: tab.id,
    label: labelFor(tab),
    ...(tab.launchAgent ? { agent: tab.launchAgent } : {})
  }))
  return targets.sort((left, right) => {
    if (Boolean(left.agent) !== Boolean(right.agent)) {
      return left.agent ? -1 : 1
    }
    // Why the tab order is not preserved past that: the list is a menu, and a menu that reorders
    // itself as titles change is worse than one that is always alphabetical within its groups.
    return left.label.localeCompare(right.label, 'en', { numeric: true })
  })
}
