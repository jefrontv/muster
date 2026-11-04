import { describe, expect, it } from 'vitest'
import { applyAgentHints } from './site-setup-agent-hints'
import type { SiteSetupChoices } from './site-setup-choices'

const choices: SiteSetupChoices = {
  serve: { enabled: true, stack: 'ddev', domain: 'aidc.ddev.site' },
  https: true,
  import: {
    enabled: false,
    environment: 'main',
    toggles: {} as SiteSetupChoices['import']['toggles']
  }
}

describe('applyAgentHints', () => {
  it('changes nothing without hints', () => {
    expect(applyAgentHints(choices, {}, ['ddev'], null)).toEqual(choices)
  })

  it('takes an installed stack and a domain', () => {
    const next = applyAgentHints(
      choices,
      { stack: 'agent-local', domain: 'aidc.test' },
      ['ddev', 'agent-local'],
      '.test'
    )
    expect(next.serve).toEqual({ enabled: true, stack: 'agent-local', domain: 'aidc.test' })
  })

  it('ignores a stack that is not installed', () => {
    expect(applyAgentHints(choices, { stack: 'localwp' }, ['ddev'], null).serve.stack).toBe('ddev')
  })

  it('turns serving and HTTPS off together, and import on', () => {
    const next = applyAgentHints(choices, { serve: false, import: true }, ['ddev'], null)
    expect(next.serve.enabled).toBe(false)
    expect(next.https).toBe(false)
    expect(next.import.enabled).toBe(true)
  })
})
