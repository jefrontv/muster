import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GlobalSettings } from '../../shared/types'

const { generateBranchNameFromContext, resolveTextGenerationParams, resolveGenerationTarget } =
  vi.hoisted(() => ({
    generateBranchNameFromContext: vi.fn(),
    resolveTextGenerationParams: vi.fn(),
    resolveGenerationTarget: vi.fn()
  }))

vi.mock('../text-generation/commit-message-text-generation', () => ({
  generateBranchNameFromContext,
  resolveTextGenerationParams
}))
vi.mock('../agent-hooks/first-work-generation-target', () => ({ resolveGenerationTarget }))

import { generateChatThreadTitle } from './chat-thread-title-generation'

const deps = {
  getSettings: () => ({}) as GlobalSettings,
  getAgentEnvResolvers: () => undefined
}

function configured(): void {
  resolveTextGenerationParams.mockReturnValue({ ok: true, params: { agentId: 'claude' } })
  resolveGenerationTarget.mockResolvedValue({ kind: 'local', cwd: '/Sites/acme' })
}

describe('generateChatThreadTitle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('names the chat from the first turn', async () => {
    configured()
    generateBranchNameFromContext.mockResolvedValue({ success: true, slug: 'staging-500-triage' })

    const result = await generateChatThreadTitle(
      {
        firstPrompt: 'why is staging 500ing',
        assistantMessage: 'nginx upstream',
        cwd: '/Sites/acme'
      },
      deps
    )

    expect(result).toEqual({ ok: true, title: 'Staging 500 triage' })
    expect(generateBranchNameFromContext).toHaveBeenCalledWith(
      { firstPrompt: 'why is staging 500ing', assistantMessage: 'nginx upstream' },
      { agentId: 'claude' },
      { kind: 'local', cwd: '/Sites/acme' }
    )
  })

  it('reports rather than guesses when no generation agent is configured', async () => {
    resolveTextGenerationParams.mockReturnValue({ ok: false, error: 'no agent configured' })
    const result = await generateChatThreadTitle({ firstPrompt: 'hello' }, deps)
    expect(result).toEqual({ ok: false, error: 'no agent configured' })
    expect(generateBranchNameFromContext).not.toHaveBeenCalled()
  })

  it('surfaces a generation failure instead of an empty title', async () => {
    configured()
    generateBranchNameFromContext.mockResolvedValue({ success: false, error: 'CLI failed' })
    const result = await generateChatThreadTitle({ firstPrompt: 'hello' }, deps)
    expect(result).toEqual({ ok: false, error: 'CLI failed' })
  })

  it('refuses an empty prompt', async () => {
    const result = await generateChatThreadTitle({ firstPrompt: '   ' }, deps)
    expect(result.ok).toBe(false)
  })
})
