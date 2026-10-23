import { describe, expect, it } from 'vitest'
import { domainForStack } from './site-setup-stack-domain'

describe('domainForStack', () => {
  it('gives a default domain the agent-local suffix', () => {
    expect(domainForStack('daybreak.local', 'agent-local', null, '.al')).toBe('daybreak.al')
    expect(domainForStack('daybreak.ddev.site', 'agent-local', 'ddev', '.al')).toBe('daybreak.al')
  })

  it('leaves a typed domain alone', () => {
    expect(domainForStack('daybreak.test', 'agent-local', null, '.al')).toBe('daybreak.test')
  })

  it('falls back to .local when agent-local has no suffix to offer', () => {
    expect(domainForStack('daybreak.local', 'agent-local', null, null)).toBe('daybreak.local')
  })

  it('returns to .local when leaving agent-local with its default', () => {
    expect(domainForStack('daybreak.al', 'localwp', 'agent-local', '.al')).toBe('daybreak.local')
    expect(domainForStack('daybreak.al', 'ddev', 'agent-local', '.al')).toBe('daybreak.ddev.site')
  })
})
