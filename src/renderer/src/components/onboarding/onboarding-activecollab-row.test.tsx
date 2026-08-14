// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import { useAppStore } from '@/store'
import { ActiveCollabRow } from './onboarding-activecollab-row'

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState(), true)
  useAppStore.setState({
    settings: { activeRuntimeEnvironmentId: null },
    activeCollabStatus: { configured: false, connection: null, reason: '' },
    activeCollabStatusChecked: true,
    activeCollabStatusContextKey: getProviderRuntimeContextKey({
      activeRuntimeEnvironmentId: null
    }),
    checkActiveCollabConnection: vi.fn()
  } as never)
})

afterEach(() => {
  cleanup()
  useAppStore.setState(useAppStore.getInitialState(), true)
})

describe('ActiveCollabRow onboarding connect', () => {
  it('opens the credential form above the onboarding overlay', () => {
    render(<ActiveCollabRow />)

    expect(screen.getByRole('button', { name: 'Connect' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Connect ActiveCollab' })).toBeInTheDocument()
    const overlay = document.querySelector('[data-slot="dialog-overlay"]')
    expect(overlay?.className).toContain('z-[120]')
  })
})
