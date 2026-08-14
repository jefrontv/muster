import type { ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { OnboardingWelcome } from './onboarding-welcome'

function renderWelcome(props: ComponentProps<typeof OnboardingWelcome>): string {
  return renderToStaticMarkup(<OnboardingWelcome {...props} />)
}

describe('onboarding welcome', () => {
  it('waits for Get started instead of auto-advancing', () => {
    const onContinue = vi.fn()
    const html = renderWelcome({ onContinue })

    expect(html).toContain('data-onboarding-welcome="true"')
    expect(html).not.toContain('data-exiting')
    expect(html).toContain('Get started')
    expect(html).toContain('>M</span>')
    expect(onContinue).not.toHaveBeenCalled()
  })
})
