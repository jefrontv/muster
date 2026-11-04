// What an agent-opened Set up dialog tells the agent: a pure mapping from the dialog's own state.

import type { SiteSetupAgentReport } from '../../../../shared/site-setup-agent-types'
import type { SetupRunPhase, SetupRunStep } from './site-setup-choices'

export type AgentReportInput = {
  screen: 'source' | 'review' | 'running' | 'done'
  phase: SetupRunPhase
  steps: readonly SetupRunStep[]
  siteId: string
  path: string
  /** Set while a muster:// link the user opened has taken over this setup. */
  usingLink: boolean
}

export function agentReportFor(input: AgentReportInput): SiteSetupAgentReport {
  const { phase, steps } = input
  const running = steps.find((step) => step.state === 'running')
  const failed = steps.find((step) => step.state === 'failed')
  if (phase === 'done') {
    return {
      state: 'done',
      step: '',
      percent: null,
      detail: '',
      result: {
        siteId: input.siteId,
        path: input.path,
        steps: steps.map((step) => ({ id: step.id, state: step.state, detail: step.detail }))
      }
    }
  }
  if (phase === 'failed') {
    return {
      state: 'attention',
      step: failed?.id ?? '',
      percent: null,
      detail: failed?.detail ?? '',
      result: null
    }
  }
  if (phase === 'running') {
    // Between steps, and through steps that turn out skipped, the last finished step stands, so
    // only a step that really runs wakes the agent.
    const current =
      running ??
      steps.findLast((step) => step.state === 'done') ??
      steps.find((step) => step.state === 'pending')
    return {
      state: 'running',
      step: current?.id ?? '',
      percent: running?.percent ?? null,
      detail: '',
      result: null
    }
  }
  return {
    state: 'reviewing',
    step: '',
    percent: null,
    detail: input.usingLink ? 'The user opened a muster:// link for this setup.' : '',
    result: null
  }
}
