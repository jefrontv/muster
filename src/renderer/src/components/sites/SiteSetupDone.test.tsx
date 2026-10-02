// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SetupRunStep } from './site-setup-choices'
import { SiteSetupDone } from './SiteSetupDone'

function step(id: SetupRunStep['id'], state: SetupRunStep['state']): SetupRunStep {
  return { id, state, detail: '', log: [], percent: null, cancellable: false }
}

afterEach(() => {
  cleanup()
})

describe('SiteSetupDone', () => {
  it('opens the local address it shows', () => {
    const onOpenSite = vi.fn()
    render(
      <SiteSetupDone
        steps={[step('serve', 'done'), step('https', 'done')]}
        siteLabel="flex"
        domain="flex.local"
        createdLocalWp={false}
        databaseReplaced={false}
        onClose={() => {}}
        onOpenSite={onOpenSite}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Open flex.local' }))
    expect(onOpenSite).toHaveBeenCalledWith('https://flex.local')
  })

  it('offers Add environment after a bare clone, and no Open button without an address', () => {
    const onAddEnvironment = vi.fn()
    render(
      <SiteSetupDone
        steps={[step('clone', 'done')]}
        siteLabel="flex"
        domain=""
        createdLocalWp={false}
        databaseReplaced={false}
        onClose={() => {}}
        onOpenSite={() => {}}
        onAddEnvironment={onAddEnvironment}
      />
    )
    expect(screen.queryByRole('button', { name: /^Open/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Add environment' }))
    expect(onAddEnvironment).toHaveBeenCalledTimes(1)
  })
})
