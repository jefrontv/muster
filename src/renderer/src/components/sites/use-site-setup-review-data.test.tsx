// @vitest-environment happy-dom
//
// The seam that decides which environment the whole setup is about. It broke twice: once pointing
// the import run at the plan's environment, and once seeding the review from the plan when a
// muster:// link named a different one. Both times the link's credentials landed in one
// environment while the toggles and the run used another, so the import connected to the host
// already on record. This pins the wiring, not just the rule.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PendingSiteBind, SiteBindFields } from '../../../../shared/site-bind-types'
import type { SiteSetupPlan } from '../../../../shared/site-setup-flow-types'
import { useSiteSetupReviewData } from './use-site-setup-review-data'
import type { SiteSetupRequest } from './SiteSetupDialog'

vi.mock('./last-local-stack-choice', () => ({
  readLastLocalStackChoice: () => null,
  rememberLocalStackChoice: vi.fn()
}))

let root: Root | null = null
let container: HTMLDivElement | null = null

/** The plan the site already had before the link was applied. */
function planWithEnvironment(environment: string): SiteSetupPlan {
  return {
    siteId: 'site-1',
    stages: [],
    clone: { connectorConfigured: true, targets: [], error: '' },
    stack: {
      supported: true,
      alreadyLocalWp: false,
      alternatives: [],
      hasWordPress: true,
      stack: 'agent-local',
      suggestedDomain: 'fringe.al',
      reason: ''
    },
    import: { ready: true, blockedBy: [], confirmable: false, environment, enabledStepCount: 4 }
  } as unknown as SiteSetupPlan
}

function linkRequest(environment: string): SiteSetupRequest {
  const fields = {
    reponame: 'efront_au/fringe',
    environment,
    hostname: 'cl.1.efront.digital',
    username: 'fringe',
    rootPath: 'public_html',
    liveDomain: 'sydneyfringe.com',
    localDomain: '',
    notes: ''
  } as unknown as SiteBindFields
  const pending = {
    requestId: 'req-1',
    receivedAt: 0,
    fields,
    passwordProvided: true,
    candidates: [{ path: '/Sites/fringe', siteId: 'site-1', repoId: null, exists: true }],
    suggestedCloneUrl: 'git@bitbucket.org:efront_au/fringe.git'
  } as unknown as PendingSiteBind
  return { kind: 'link', pending }
}

function stubApi(plan: SiteSetupPlan): void {
  Reflect.set(globalThis.window, 'api', {
    siteRoots: { primary: async () => ({ ok: true, value: '/Sites' }) },
    siteStacks: { available: async () => ({ ok: true, value: ['agent-local'] }) },
    siteSetup: {
      plan: async () => ({ ok: true, value: plan }),
      cloneTargets: async () => ({ ok: true, value: { targets: [], connectorConfigured: true } })
    },
    localwpCert: {
      status: async () => ({
        ok: true,
        value: { supported: true, exists: true, trusted: true, reason: '', certPath: '' }
      })
    }
  })
}

async function readEnvironment(request: SiteSetupRequest): Promise<string | undefined> {
  let seen: string | undefined
  function Probe(): null {
    seen = useSiteSetupReviewData(request, null).choices?.import.environment
    return null
  }
  await act(async () => {
    root?.render(<Probe />)
  })
  // The plan and stack probes each settle a render apart before the seed runs.
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await Promise.resolve()
    })
  }
  return seen
}

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
})

describe('useSiteSetupReviewData', () => {
  it('reviews the environment the link names, not the one the site already resolved', async () => {
    // The real failure: the record only had `production`, the link named `master`, and the import
    // ran against production — connecting to the previous host.
    stubApi(planWithEnvironment('production'))
    expect(await readEnvironment(linkRequest('master'))).toBe('master')
  })

  it('falls back to the site’s own environment when the link omits one', async () => {
    stubApi(planWithEnvironment('production'))
    expect(await readEnvironment(linkRequest(''))).toBe('production')
  })
})
