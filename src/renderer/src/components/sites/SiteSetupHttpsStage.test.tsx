// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LocalWpCertStatus } from '../../../../shared/localwp-cert-types'
import { SiteSetupHttpsStage } from './SiteSetupHttpsStage'

function status(overrides: Partial<LocalWpCertStatus> = {}): LocalWpCertStatus {
  return {
    supported: true,
    domain: 'ebes.local',
    certPath: '',
    exists: false,
    trusted: false,
    reason: 'LocalWP has not written the HTTPS certificate yet.',
    ...overrides
  }
}

describe('SiteSetupHttpsStage', () => {
  let root: Root | null = null
  let container: HTMLDivElement | null = null

  afterEach(() => {
    act(() => {
      root?.unmount()
    })
    container?.remove()
    root = null
    container = null
  })

  function render(cert: LocalWpCertStatus, onTrust = vi.fn()): HTMLButtonElement | undefined {
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    act(() => {
      root?.render(<SiteSetupHttpsStage cert={cert} trusting={false} onTrust={onTrust} />)
    })
    return [...container.querySelectorAll('button')].find((button) =>
      /HTTPS|Trust/.test(button.textContent ?? '')
    )
  }

  it('offers Set up HTTPS when LocalWP has not written the certificate', () => {
    const button = render(status())
    expect(button?.textContent).toContain('Set up HTTPS')
  })

  it('offers Trust certificate when the file exists but is untrusted', () => {
    const button = render(status({ exists: true, certPath: '/certs/ebes.local.crt' }))
    expect(button?.textContent).toContain('Trust certificate')
  })

  it('hides the action once the certificate is trusted', () => {
    expect(render(status({ exists: true, trusted: true, reason: '' }))).toBeUndefined()
  })
})
