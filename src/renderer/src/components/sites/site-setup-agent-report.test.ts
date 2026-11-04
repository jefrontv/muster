import { describe, expect, it } from 'vitest'
import { agentReportFor } from './site-setup-agent-report'
import type { SetupRunStep } from './site-setup-choices'

function step(
  id: SetupRunStep['id'],
  state: SetupRunStep['state'],
  extra: Partial<SetupRunStep> = {}
): SetupRunStep {
  return { id, state, detail: '', log: [], percent: null, cancellable: false, ...extra }
}

const base = { screen: 'review' as const, siteId: '', path: '', usingLink: false }

describe('agentReportFor', () => {
  it('reports the review, noting a link the user opened', () => {
    expect(agentReportFor({ ...base, phase: 'idle', steps: [], usingLink: true })).toMatchObject({
      state: 'reviewing',
      detail: 'The user opened a muster:// link for this setup.'
    })
  })

  it('reports the running step and its percent', () => {
    expect(
      agentReportFor({
        ...base,
        phase: 'running',
        steps: [step('clone', 'running', { percent: 45 }), step('register', 'pending')]
      })
    ).toMatchObject({ state: 'running', step: 'clone', percent: 45 })
  })

  it('keeps the last finished step between steps and through skipped ones', () => {
    const between = (steps: SetupRunStep[]): string =>
      agentReportFor({ ...base, phase: 'running', steps }).step
    expect(between([step('clone', 'pending')])).toBe('clone')
    expect(between([step('clone', 'done'), step('register', 'pending')])).toBe('clone')
    expect(between([step('register', 'done'), step('serve', 'skipped')])).toBe('register')
  })

  it('asks for attention on a failed step instead of ending', () => {
    expect(
      agentReportFor({
        ...base,
        phase: 'failed',
        steps: [step('clone', 'failed', { detail: 'Permission denied (publickey)' })]
      })
    ).toMatchObject({ state: 'attention', step: 'clone', detail: 'Permission denied (publickey)' })
  })

  it('hands back the site and what every step did', () => {
    const report = agentReportFor({
      ...base,
      phase: 'done',
      siteId: 's1',
      path: '/Sites/aidc',
      steps: [step('clone', 'done'), step('import', 'skipped', { detail: 'No server login' })]
    })
    expect(report).toMatchObject({
      state: 'done',
      result: {
        siteId: 's1',
        path: '/Sites/aidc',
        steps: [
          { id: 'clone', state: 'done', detail: '' },
          { id: 'import', state: 'skipped', detail: 'No server login' }
        ]
      }
    })
  })
})
