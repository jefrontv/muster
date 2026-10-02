// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PendingSiteBind } from '../../../../shared/site-bind-types'

const { toastInfo, pendingRef } = vi.hoisted(() => ({
  toastInfo: vi.fn(),
  pendingRef: { current: null as PendingSiteBind | null }
}))

vi.mock('sonner', () => ({ toast: { info: toastInfo, error: vi.fn() } }))
vi.mock('./SiteSetupDialog', () => ({
  SiteSetupDialog: () => <div data-testid="site-setup-dialog" />
}))
vi.mock('./use-pending-site-bind', () => ({
  siteBindApi: () => null,
  usePendingSiteBind: () => ({ pending: pendingRef.current, dismiss: vi.fn(), clear: vi.fn() })
}))

import { SiteSetupHost } from './SiteSetupHost'

afterEach(() => {
  cleanup()
  toastInfo.mockReset()
})

describe('SiteSetupHost', () => {
  it('holds a site link while onboarding is open, says so once, then opens it', () => {
    pendingRef.current = { requestId: 'r1' } as PendingSiteBind
    const { rerender } = render(<SiteSetupHost holdLinks />)
    expect(screen.queryByTestId('site-setup-dialog')).toBeNull()
    expect(toastInfo).toHaveBeenCalledWith('Site link received. It opens when you finish setup.')
    rerender(<SiteSetupHost holdLinks />)
    expect(toastInfo).toHaveBeenCalledTimes(1)
    rerender(<SiteSetupHost holdLinks={false} />)
    expect(screen.getByTestId('site-setup-dialog')).toBeInTheDocument()
  })
})
