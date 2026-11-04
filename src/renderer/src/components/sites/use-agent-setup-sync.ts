// Keeps an agent-opened Set up dialog in step with the agent: its hints go into the review once,
// and every state change goes back so the agent can wait on it.

import { useEffect, useRef } from 'react'
import type { SiteLocalStack } from '../../../../shared/site-types'
import type { SiteSetupChoices } from './site-setup-choices'
import type { SiteSetupAgentContext } from './SiteSetupDialog'
import type { SiteSetupRunnerSnapshot } from './site-setup-runner'
import { agentReportFor } from './site-setup-agent-report'
import { applyAgentHints } from './site-setup-agent-hints'

export function useAgentSetupSync({
  agent,
  usingLink,
  screen,
  snapshot,
  choices,
  setChoices,
  availableStacks
}: {
  agent: SiteSetupAgentContext | null
  usingLink: boolean
  screen: 'source' | 'review' | 'running' | 'done'
  snapshot: SiteSetupRunnerSnapshot
  choices: SiteSetupChoices | null
  setChoices: (next: SiteSetupChoices) => void
  availableStacks: SiteLocalStack[] | null
}): void {
  const hintedRef = useRef(false)
  useEffect(() => {
    if (!agent || hintedRef.current || !choices || availableStacks === null) {
      return
    }
    hintedRef.current = true
    setChoices(applyAgentHints(choices, agent.hints, availableStacks, null))
  }, [agent, choices, availableStacks, setChoices])

  const sentRef = useRef('')
  const setupId = agent?.setupId ?? ''
  useEffect(() => {
    if (!setupId) {
      return
    }
    const report = agentReportFor({
      screen,
      phase: snapshot.phase,
      steps: snapshot.steps,
      siteId: snapshot.siteId,
      path: snapshot.path,
      usingLink
    })
    const key = JSON.stringify(report)
    if (key === sentRef.current) {
      return
    }
    sentRef.current = key
    void window.api.siteSetupAgent.report(setupId, report).catch(() => undefined)
  }, [setupId, usingLink, screen, snapshot.phase, snapshot.steps, snapshot.siteId, snapshot.path])
}
