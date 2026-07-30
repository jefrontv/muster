import { describe, expect, it, vi } from 'vitest'
import {
  ensureOrcaCliAvailableForAgentSkillTerminal,
  isOrcaCliAvailableOnPath
} from './agent-skill-cli-prerequisite'

describe('isOrcaCliAvailableOnPath', () => {
  it('always returns true after shell registration was gutted', () => {
    expect(isOrcaCliAvailableOnPath(null)).toBe(true)
    expect(isOrcaCliAvailableOnPath(undefined)).toBe(true)
  })
})

describe('ensureOrcaCliAvailableForAgentSkillTerminal', () => {
  it('does not call the CLI installer', async () => {
    const install = vi.fn()
    const getInstallStatus = vi.fn()
    const onStatusChange = vi.fn()
    vi.stubGlobal('window', {
      api: { cli: { getInstallStatus, install } }
    })

    const status = await ensureOrcaCliAvailableForAgentSkillTerminal({ onStatusChange })

    expect(status?.state).toBe('installed')
    expect(status?.pathConfigured).toBe(true)
    expect(install).not.toHaveBeenCalled()
    expect(getInstallStatus).not.toHaveBeenCalled()
    expect(onStatusChange).toHaveBeenCalledTimes(1)

    vi.unstubAllGlobals()
  })
})
