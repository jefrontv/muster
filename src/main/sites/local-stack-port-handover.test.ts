// The rule this file pins: a stack is never told to yield to itself, and a stack that cannot yield
// must not be able to stop a site from starting.
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SiteLocalStack } from '../../shared/site-types'
import {
  registerLocalStackProvider,
  type LocalStackOutcome,
  type LocalStackProvider
} from './local-stack-provider'
import {
  PRIVILEGED_PORT_YIELD_SECONDS,
  releasePrivilegedPortsForOtherStacks,
  startStackWithPortHandover
} from './local-stack-port-handover'

const running: LocalStackOutcome = {
  ok: true,
  socketPath: '',
  state: 'running',
  message: 'up'
}

function stub(
  id: SiteLocalStack,
  overrides: Partial<LocalStackProvider> = {}
): LocalStackProvider & { releasePrivilegedPorts?: ReturnType<typeof vi.fn> } {
  return {
    id,
    isAvailable: async () => true,
    detect: async () => {
      throw new Error('not used')
    },
    ensureRunning: vi.fn().mockResolvedValue(running),
    stop: async () => running,
    credentials: async () => null,
    certStatus: async () => {
      throw new Error('not used')
    },
    certTrust: async () => {
      throw new Error('not used')
    },
    ...overrides
  } as LocalStackProvider & { releasePrivilegedPorts?: ReturnType<typeof vi.fn> }
}

// The registry is module state shared with the real providers, so each test puts back a provider
// that does nothing rather than leaving its spy in place for the next file.
const originals = new Map<SiteLocalStack, LocalStackProvider>()
function install(provider: LocalStackProvider): void {
  if (!originals.has(provider.id)) {
    originals.set(provider.id, provider)
  }
  registerLocalStackProvider(provider)
}

afterEach(() => {
  for (const id of originals.keys()) {
    registerLocalStackProvider(stub(id))
  }
  originals.clear()
  vi.clearAllMocks()
})

describe('privileged port handover', () => {
  it('asks the other stack to stand aside before starting one that cannot', async () => {
    const yielder = vi.fn().mockResolvedValue(true)
    install(stub('agent-local', { releasePrivilegedPorts: yielder }))
    const localwp = stub('localwp')
    install(localwp)

    const status = vi.fn()
    await startStackWithPortHandover({ path: '/tmp/site', localStack: 'localwp' }, status)

    expect(yielder).toHaveBeenCalledWith(PRIVILEGED_PORT_YIELD_SECONDS)
    expect(localwp.ensureRunning).toHaveBeenCalled()
    expect(status).toHaveBeenCalledWith('Asked agent-local to release ports 80 and 443.')
  })

  it('never tells a stack to yield to itself', async () => {
    const yielder = vi.fn().mockResolvedValue(true)
    install(stub('agent-local', { releasePrivilegedPorts: yielder }))

    await startStackWithPortHandover({ path: '/tmp/site', localStack: 'agent-local' })

    expect(yielder).not.toHaveBeenCalled()
  })

  // The failure mode worth guarding: an older agent-local with no /yield route, or no daemon at
  // all, must not turn into "your LocalWP site will not start".
  it('starts the site anyway when the other stack refuses or throws', async () => {
    install(stub('agent-local', { releasePrivilegedPorts: vi.fn().mockRejectedValue(new Error('404')) }))
    const localwp = stub('localwp')
    install(localwp)

    const outcome = await startStackWithPortHandover({ path: '/tmp/site', localStack: 'localwp' })

    expect(outcome.ok).toBe(true)
    expect(localwp.ensureRunning).toHaveBeenCalled()
  })

  it('says nothing when the other stack reports it was not holding the ports', async () => {
    install(stub('agent-local', { releasePrivilegedPorts: vi.fn().mockResolvedValue(false) }))
    install(stub('localwp'))

    const status = vi.fn()
    await releasePrivilegedPortsForOtherStacks('localwp', status)

    expect(status).not.toHaveBeenCalled()
  })
})
