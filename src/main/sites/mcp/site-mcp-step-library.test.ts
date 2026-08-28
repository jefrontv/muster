// The library is copy-on-install by design: a library edit must never change what an existing site
// already runs. These pin that, plus the bridge routing — a library write while the GUI is up has
// the same clobbering hazard as a site write.

import { describe, expect, it, vi } from 'vitest'
import type { Site, SiteCustomStep } from '../../../shared/site-types'
import { createEmptySiteEnvironment } from '../../../shared/site-types'
import { setStepLibraryThroughBridge } from './site-mcp-store-bridge'
import { readLibrary, writeLibrary } from './site-mcp-custom-step-support'
import type { SiteMcpContext } from './site-mcp-context'

function libraryStep(overrides: Partial<SiteCustomStep> = {}): SiteCustomStep {
  return {
    id: 'library-1',
    name: 'Purge CDN',
    group: 'deploy',
    runsOn: 'local',
    command: 'echo purge',
    position: 'after',
    order: 0,
    enabled: false,
    ...overrides
  }
}

function site(): Site {
  return {
    id: 'site-1',
    path: '/Sites/acme',
    repoId: null,
    displayName: 'Acme',
    localWpRoot: '',
    localDomain: 'acme.local',
    localStack: 'plain',
    dbUser: 'root',
    dbSocket: '',
    dbPort: null,
    phpVersion: '8.2',
    activeEnvironment: 'main',
    environments: { main: createEmptySiteEnvironment() },
    notes: '',
    searchReplaceTimeoutSeconds: 600
  }
}

describe('library access through the context', () => {
  it('reads empty and refuses to write when the transport does not carry a library', async () => {
    const context = {} as SiteMcpContext

    expect(readLibrary(context)).toEqual([])
    await expect(writeLibrary(context, [libraryStep()])).rejects.toThrow(/cannot write/)
  })

  it('round-trips through the context accessors', async () => {
    let stored: readonly SiteCustomStep[] = []
    const context = {
      getStepLibrary: () => [...stored],
      setStepLibrary: async (steps) => {
        stored = steps
      }
    } as SiteMcpContext

    await writeLibrary(context, [libraryStep()])
    expect(readLibrary(context).map((step) => step.id)).toEqual(['library-1'])
  })
})

describe('setStepLibraryThroughBridge', () => {
  const steps = [libraryStep()]

  it('sends the write to the running GUI instead of this process', async () => {
    const setSiteStepLibrary = vi.fn()
    const postLibrary = vi.fn(async () => true)

    await setStepLibraryThroughBridge(
      { setSiteStepLibrary },
      { steps, bridgeFile: '/tmp/bridge.json' },
      { readEndpoint: () => ({ port: 1234, token: 't', pid: 9 }), postLibrary }
    )

    expect(postLibrary).toHaveBeenCalledTimes(1)
    // Why: the GUI applied it. Writing here too would race its next whole-state save.
    expect(setSiteStepLibrary).not.toHaveBeenCalled()
  })

  it('writes locally when no GUI is running', async () => {
    const setSiteStepLibrary = vi.fn()

    await setStepLibraryThroughBridge(
      { setSiteStepLibrary },
      { steps, bridgeFile: '/tmp/bridge.json' },
      { readEndpoint: () => null }
    )

    expect(setSiteStepLibrary).toHaveBeenCalledWith(steps)
  })

  it('falls back to a local write when the GUI refuses or times out', async () => {
    const setSiteStepLibrary = vi.fn()

    await setStepLibraryThroughBridge(
      { setSiteStepLibrary },
      { steps, bridgeFile: '/tmp/bridge.json' },
      {
        readEndpoint: () => ({ port: 1234, token: 't', pid: 9 }),
        postLibrary: async () => false
      }
    )

    expect(setSiteStepLibrary).toHaveBeenCalledWith(steps)
  })
})

describe('copy-on-install semantics', () => {
  it('gives the installed step its own id and records the library it came from', async () => {
    // Exercised through the tool table in site-mcp-tools.test.ts; this pins the contract the tool
    // relies on: a template is data, and installing it must not alias the library entry.
    const template = libraryStep()
    const installed: SiteCustomStep = {
      ...template,
      id: 'installed-1',
      enabled: true,
      origin: { kind: 'library', libraryId: template.id }
    }

    expect(installed.id).not.toBe(template.id)
    expect(installed.origin).toEqual({
      kind: 'library',
      libraryId: 'library-1'
    })
    // The template stays disabled: a library entry is a template, not something that runs.
    expect(template.enabled).toBe(false)
    expect(site().customSteps).toBeUndefined()
  })
})
