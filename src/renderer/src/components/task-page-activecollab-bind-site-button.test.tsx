// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ActiveCollabBindSiteButton } from './task-page-activecollab-bind-site-button'

const mocks = vi.hoisted(() => ({
  state: {
    sites: [] as unknown[],
    settings: { activeCollabProjectSites: {} as Record<string, string> },
    activeCollabStatus: null as unknown,
    updateSettings: vi.fn(async () => {})
  }
}))

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: unknown) => unknown) => selector(mocks.state)
}))

afterEach(() => {
  cleanup()
})

function setState(next: Partial<typeof mocks.state>): void {
  Object.assign(mocks.state, next)
}

describe('ActiveCollabBindSiteButton', () => {
  it('offers to link an unbound project', () => {
    setState({ sites: [], settings: { activeCollabProjectSites: {} }, activeCollabStatus: null })
    render(<ActiveCollabBindSiteButton projectId={5937} projectName="Orleton" />)

    expect(screen.getByRole('button', { name: /link this project to a site/i })).toBeTruthy()
  })

  it('names the bound site so the row explains itself without a click', () => {
    setState({
      sites: [{ site: { id: 'acme', displayName: 'Acme', repoId: 'r1', path: '/Sites/acme' } }],
      settings: { activeCollabProjectSites: { 'unknown-instance::5937': 'acme' } },
      activeCollabStatus: null
    })
    render(<ActiveCollabBindSiteButton projectId={5937} projectName="Orleton" />)

    expect(screen.getByRole('button', { name: /acme/i })).toBeTruthy()
  })

  it('reads a binding scoped to the connected instance', () => {
    setState({
      sites: [{ site: { id: 'acme', displayName: 'Acme', repoId: 'r1', path: '/Sites/acme' } }],
      settings: {
        activeCollabProjectSites: { 'https://projects.efront.com.au::5937': 'acme' }
      },
      activeCollabStatus: { connection: { instanceUrl: 'https://projects.efront.com.au' } }
    })
    render(<ActiveCollabBindSiteButton projectId={5937} projectName="Orleton" />)

    expect(screen.getByRole('button', { name: /acme/i })).toBeTruthy()
  })

  it('draws against a partial store rather than taking the Tasks surface down', () => {
    // This row mounts against partial store stand-ins in several suites; a bare read of an absent
    // slice would throw during render and fail the whole list, not just this control.
    setState({ sites: undefined as never, settings: undefined as never, activeCollabStatus: null })
    render(<ActiveCollabBindSiteButton projectId={5937} projectName="Orleton" />)

    expect(screen.getByRole('button', { name: /link this project to a site/i })).toBeTruthy()
  })
})
