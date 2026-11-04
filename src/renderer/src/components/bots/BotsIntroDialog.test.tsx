// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { info: vi.fn() } }))

import { toast } from 'sonner'
import type { GlobalSettings } from '../../../../shared/types'
import { useAppStore } from '@/store'
import { BotsIntroDialog } from './BotsIntroDialog'

function seed(settings: Partial<GlobalSettings>): {
  updateSettings: ReturnType<typeof vi.fn>
  leaveBotsPage: ReturnType<typeof vi.fn>
} {
  const updateSettings = vi.fn(async () => {})
  const leaveBotsPage = vi.fn()
  useAppStore.setState({
    settings: { experimentalBots: true, ...settings } as GlobalSettings,
    updateSettings,
    leaveBotsPage
  })
  return { updateSettings, leaveBotsPage }
}

afterEach(cleanup)

describe('BotsIntroDialog', () => {
  it('shows on the first visit and marks itself seen on Explore', () => {
    const { updateSettings, leaveBotsPage } = seed({})
    render(<BotsIntroDialog active />)
    expect(screen.getByRole('dialog', { name: 'Meet Muster Bots' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Explore' })).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: 'Explore' }))
    expect(updateSettings).toHaveBeenCalledWith({ botsIntroSeen: true })
    expect(leaveBotsPage).not.toHaveBeenCalled()
  })

  it('turns Bots off, leaves the tab and says where to turn it back on', () => {
    const { updateSettings, leaveBotsPage } = seed({})
    render(<BotsIntroDialog active />)
    fireEvent.click(screen.getByRole('button', { name: 'Disable Bots' }))
    expect(leaveBotsPage).toHaveBeenCalledTimes(1)
    expect(updateSettings).toHaveBeenCalledWith({ botsIntroSeen: true, experimentalBots: false })
    expect(toast.info).toHaveBeenCalledWith('Bots is off', {
      description: 'Turn it back on in Settings → Experimental → Muster Bots.'
    })
  })

  it('stays hidden once seen, while Bots is off, or while the tab is not shown', () => {
    seed({ botsIntroSeen: true })
    const { rerender } = render(<BotsIntroDialog active />)
    expect(screen.queryByRole('dialog')).toBeNull()
    seed({ experimentalBots: false })
    rerender(<BotsIntroDialog active />)
    expect(screen.queryByRole('dialog')).toBeNull()
    seed({})
    rerender(<BotsIntroDialog active={false} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
