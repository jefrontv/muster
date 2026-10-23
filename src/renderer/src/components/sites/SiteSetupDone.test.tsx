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
  it('opens the site as a project', () => {
    const onOpenProject = vi.fn()
    render(
      <SiteSetupDone
        steps={[step('serve', 'done'), step('https', 'done')]}
        siteLabel="flex"
        domain="flex.local"
        createdLocalWp={false}
        databaseReplaced={false}
        onClose={() => {}}
        onOpenProject={onOpenProject}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Open project' }))
    expect(onOpenProject).toHaveBeenCalledTimes(1)
  })

  it('offers Add environment after a bare clone, and no Open button without a folder', () => {
    const onAddEnvironment = vi.fn()
    render(
      <SiteSetupDone
        steps={[step('clone', 'done')]}
        siteLabel="flex"
        domain=""
        createdLocalWp={false}
        databaseReplaced={false}
        onClose={() => {}}
        onOpenProject={null}
        onAddEnvironment={onAddEnvironment}
      />
    )
    expect(screen.queryByRole('button', { name: /^Open/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Add environment' }))
    expect(onAddEnvironment).toHaveBeenCalledTimes(1)
  })
})
