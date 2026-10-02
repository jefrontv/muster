import { beforeEach, describe, expect, it, vi } from 'vitest'

const detectByStack = vi.hoisted(() => ({
  'agent-local': vi.fn(),
  ddev: vi.fn()
}))
const detectLocalWpStack = vi.hoisted(() => vi.fn())

vi.mock('./local-stack-provider', () => ({
  providerFor: (stack: 'agent-local' | 'ddev') => ({ detect: detectByStack[stack] })
}))
vi.mock('./agent-local-site-control', () => ({}))
vi.mock('./ddev-site-control', () => ({}))
vi.mock('./localwp-detection', () => ({ detectLocalWpStack }))
vi.mock('./localwp-host', () => ({ createLocalWpHost: () => ({}) }))

const { detectSiteStack } = await import('./local-stack-detection')

const serving = (stack: string) => ({ stack, supported: true, reason: '' })

beforeEach(() => {
  detectByStack['agent-local'].mockResolvedValue(serving('agent-local'))
  detectByStack.ddev.mockResolvedValue(serving('ddev'))
  detectLocalWpStack.mockResolvedValue(serving('plain'))
})

// An Agent Local site moved onto DDEV is served by both; the card said "DDEV: not set up".
describe('detectSiteStack', () => {
  it('reports the chosen stack when two stacks serve the folder', async () => {
    expect((await detectSiteStack('/Sites/edm', 'ddev')).stack).toBe('ddev')
  })

  it('keeps Agent Local first when the site has not chosen a stack', async () => {
    expect((await detectSiteStack('/Sites/edm')).stack).toBe('agent-local')
    expect((await detectSiteStack('/Sites/edm', 'plain')).stack).toBe('agent-local')
  })

  it('falls back to the usual order when the chosen stack does not serve the folder', async () => {
    detectByStack.ddev.mockResolvedValue(serving('plain'))
    expect((await detectSiteStack('/Sites/edm', 'ddev')).stack).toBe('agent-local')
  })
})
