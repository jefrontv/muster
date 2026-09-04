// @vitest-environment happy-dom
//
// Review is where every setup choice is edited before anything runs, so the risk is copy that
// overclaims ("Created" before a click) and controls that stay live when the row underneath them
// is unavailable or locked. These tests pin both.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { CloneSourceRepo } from '../../../../shared/site-clone-source-types'
import type { SiteSetupPlan } from '../../../../shared/site-setup-flow-types'
import { allImportToggles, type SiteSetupChoices, type SiteSetupSource } from './site-setup-choices'
import { SiteSetupReview } from './SiteSetupReview'

const REPO: CloneSourceRepo = {
  provider: 'github',
  fullName: 'owner/name',
  cloneUrl: 'git@github.com:owner/name.git',
  description: '',
  updatedAt: null,
  isPrivate: false
}

const SITE_SOURCE: SiteSetupSource = { kind: 'site', siteId: 'site-1' }

const REPO_SOURCE: SiteSetupSource = {
  kind: 'repo',
  repo: REPO,
  destinationRoot: 'root'
}

function choices(overrides: Partial<SiteSetupChoices> = {}): SiteSetupChoices {
  return {
    serve: { enabled: true, stack: 'localwp', domain: 'name.local' },
    https: true,
    import: {
      enabled: true,
      environment: 'production',
      toggles: allImportToggles(),
      confirmMismatch: false
    },
    ...overrides
  }
}

function stackReadiness(overrides: Partial<SiteSetupPlan['stack']> = {}): SiteSetupPlan['stack'] {
  return {
    supported: true,
    alreadyLocalWp: false,
    alternatives: [],
    hasWordPress: true,
    stack: 'plain',
    suggestedDomain: 'name.local',
    reason: '',
    ...overrides
  }
}

function plan(overrides: Partial<SiteSetupPlan> = {}): SiteSetupPlan {
  return {
    siteId: 'site-1',
    stages: [],
    clone: { connectorConfigured: true, targets: [], error: '' },
    stack: stackReadiness(),
    import: {
      ready: true,
      blockedBy: [],
      confirmable: false,
      environment: 'production',
      enabledStepCount: 4
    },
    ...overrides
  }
}

let root: Root | null = null
let container: HTMLDivElement | null = null

async function render(element: React.ReactElement): Promise<void> {
  await act(async () => {
    root?.render(element)
  })
}

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => {
    root?.unmount()
  })
  container?.remove()
  root = null
  container = null
})

describe('SiteSetupReview', () => {
  it('shows the clone row and a will-create serve summary for a repo source with no plan yet', async () => {
    let latest: SiteSetupChoices = choices()
    await render(
      <SiteSetupReview
        source={REPO_SOURCE}
        plan={null}
        availableStacks={['localwp']}
        cert={null}
        choices={latest}
        onChange={(next) => {
          latest = next
        }}
      />
    )
    expect(document.body.textContent).toContain('owner/name → root/name')
    expect(document.body.textContent).toContain('Create a LocalWP site at name.local')
  })

  it('marks Serve unavailable with the plan reason and hides HTTPS entirely', async () => {
    await render(
      <SiteSetupReview
        source={REPO_SOURCE}
        plan={plan({
          stack: stackReadiness({ supported: false, reason: 'Not supported on this OS.' })
        })}
        availableStacks={['localwp']}
        cert={{
          supported: true,
          domain: 'name.local',
          certPath: '',
          exists: false,
          trusted: false,
          reason: ''
        }}
        choices={choices({ serve: { enabled: false, stack: null, domain: 'name.local' } })}
        onChange={() => {}}
      />
    )
    expect(document.body.textContent).toContain('Not supported on this OS.')
    expect(document.body.textContent).not.toContain('HTTPS')
  })

  it('unchecking Serve calls onChange with serve.enabled false and hides HTTPS on the next render', async () => {
    let latest: SiteSetupChoices = choices()
    const onChange = (next: SiteSetupChoices): void => {
      latest = next
    }
    const view = (c: SiteSetupChoices): React.ReactElement => (
      <SiteSetupReview
        source={REPO_SOURCE}
        plan={null}
        availableStacks={['localwp']}
        cert={null}
        choices={c}
        onChange={onChange}
      />
    )
    await render(view(latest))
    expect(document.body.textContent).toContain('HTTPS')

    const serveCheckbox = document.body.querySelector<HTMLButtonElement>('button[role="checkbox"]')
    expect(serveCheckbox).not.toBeNull()
    await act(async () => {
      serveCheckbox?.click()
    })
    expect(latest.serve.enabled).toBe(false)

    await render(view(latest))
    expect(document.body.textContent).not.toContain('HTTPS')
  })

  it('disables the Import checkbox until Import anyway is ticked when confirmable', async () => {
    let latest = choices()
    const onChange = (next: SiteSetupChoices): void => {
      latest = next
    }
    const view = (c: SiteSetupChoices): React.ReactElement => (
      <SiteSetupReview
        source={SITE_SOURCE}
        plan={plan({
          import: {
            ready: false,
            blockedBy: ['unmatched-branch'],
            confirmable: true,
            environment: 'production',
            enabledStepCount: 4
          }
        })}
        availableStacks={['localwp']}
        cert={null}
        choices={c}
        onChange={onChange}
      />
    )
    await render(view(latest))

    const importCheckbox =
      document.body.querySelectorAll<HTMLButtonElement>('button[role="checkbox"]')[2]
    const confirmCheckbox = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>('button[role="checkbox"]')
    ).at(-1) as HTMLButtonElement
    expect(importCheckbox.disabled).toBe(true)

    await act(async () => {
      confirmCheckbox.click()
    })
    expect(latest.import.confirmMismatch).toBe(true)

    await render(view(latest))
    const refreshedImportCheckbox =
      document.body.querySelectorAll<HTMLButtonElement>('button[role="checkbox"]')[2]
    expect(refreshedImportCheckbox.disabled).toBe(false)
  })

  it('renders Serve as locked when lockedSteps includes serve', async () => {
    await render(
      <SiteSetupReview
        source={REPO_SOURCE}
        plan={null}
        availableStacks={['localwp']}
        cert={null}
        choices={choices()}
        onChange={() => {}}
        lockedSteps={['serve']}
      />
    )
    const serveCheckbox = document.body.querySelector<HTMLButtonElement>('button[role="checkbox"]')
    expect(serveCheckbox?.disabled).toBe(true)
  })

  it('toggling an import toggle flips only that key', async () => {
    let latest = choices()
    await render(
      <SiteSetupReview
        source={SITE_SOURCE}
        plan={null}
        availableStacks={['localwp']}
        cert={null}
        choices={latest}
        onChange={(next) => {
          latest = next
        }}
      />
    )
    const filesLabel = Array.from(document.body.querySelectorAll('label')).find((label) =>
      label.textContent?.includes('Pull server files')
    )
    const toggle = filesLabel?.querySelector<HTMLButtonElement>('button[role="checkbox"]')
    expect(toggle).toBeDefined()
    await act(async () => {
      toggle?.click()
    })
    expect(latest.import.toggles.exportFiles).toBe(false)
    expect(latest.import.toggles.exportDatabase).toBe(true)
    expect(latest.import.toggles.wpUploadRewrite).toBe(true)
    expect(latest.import.toggles.wpSearchReplace).toBe(true)
  })
  it('shows no Import row for a bare clone, which carries no server configuration', async () => {
    await render(
      <SiteSetupReview
        source={REPO_SOURCE}
        plan={null}
        availableStacks={['localwp']}
        cert={null}
        choices={choices()}
        onChange={() => {}}
      />
    )
    expect(document.body.textContent).not.toContain('Import from production')
  })
  it('expands the serve editor in place from the pencil and edits the domain through onChange', async () => {
    const changes: SiteSetupChoices[] = []
    await render(
      <SiteSetupReview
        source={REPO_SOURCE}
        plan={null}
        availableStacks={['localwp', 'agent-local']}
        cert={null}
        choices={choices()}
        onChange={(next) => changes.push(next)}
      />
    )
    expect(document.getElementById('site-setup-serve-editor')).toBeNull()
    const pencil = document.querySelector<HTMLButtonElement>('button[aria-expanded]')
    await act(async () => {
      pencil?.click()
    })
    expect(pencil?.getAttribute('aria-expanded')).toBe('true')
    const editor = document.getElementById('site-setup-serve-editor')
    expect(editor).not.toBeNull()
    // Inline, not floating: the editor is inside the same row as the pencil.
    expect(pencil?.parentElement?.parentElement?.contains(editor)).toBe(true)
    const input = editor?.querySelector<HTMLInputElement>('input')
    await act(async () => {
      if (input) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
        setter?.call(input, 'flex.test')
        input.dispatchEvent(new Event('input', { bubbles: true }))
      }
    })
    expect(changes.at(-1)?.serve.domain).toBe('flex.test')
  })
})
