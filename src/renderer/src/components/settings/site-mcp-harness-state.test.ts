import { describe, expect, it } from 'vitest'
import type { SiteMcpHarnessStatus } from '../../../../shared/site-mcp-types'
import { describeSiteMcpHarness, siteMcpNeedsSetup } from './site-mcp-harness-state'

function harness(overrides: Partial<SiteMcpHarnessStatus> = {}): SiteMcpHarnessStatus {
  return {
    id: 'codex',
    label: 'Codex',
    configPath: '/Users/tester/.codex/config.toml',
    present: true,
    configured: true,
    current: true,
    ...overrides
  }
}

const unconfigured = harness({ configured: false, current: false })
const stale = harness({ current: false })
const absent = harness({ present: false, configured: false, current: false })

describe('siteMcpNeedsSetup', () => {
  it('is satisfied by one bound harness', () => {
    expect(siteMcpNeedsSetup([harness(), unconfigured, absent])).toBe(false)
  })

  it('asks for setup when present harnesses exist and none is bound', () => {
    expect(siteMcpNeedsSetup([unconfigured, absent])).toBe(true)
  })

  it('flags a stale bound entry even beside a current one', () => {
    expect(siteMcpNeedsSetup([harness(), stale])).toBe(true)
  })

  it('stays quiet when no harness is installed at all', () => {
    expect(siteMcpNeedsSetup([absent])).toBe(false)
    expect(siteMcpNeedsSetup([])).toBe(false)
  })
})

describe('describeSiteMcpHarness', () => {
  it('drops the attention tone on an unconfigured row once another harness is bound', () => {
    expect(describeSiteMcpHarness(unconfigured, null, true)).toMatchObject({
      kind: 'unconfigured',
      tone: 'neutral',
      actionVariant: 'outline'
    })
    expect(describeSiteMcpHarness(unconfigured, null)).toMatchObject({ tone: 'attention' })
  })
})
