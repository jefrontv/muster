import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchCodexRateLimits } from './codex-fetcher'
import { readRecentCodexSessionQuota } from './codex-session-quota'

vi.mock('node-pty', () => ({ spawn: vi.fn() }))

const identity = { accountId: 'account', userId: 'user' }
let home: string
let folder: string

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'codex-quota-'))
  folder = join(home, 'sessions', ...new Date().toISOString().slice(0, 10).split('-'))
  await mkdir(folder, { recursive: true })
})

afterEach(async () => {
  vi.unstubAllGlobals()
  await rm(home, { recursive: true, force: true })
})

function writeRollout(options: {
  name: string
  user?: string
  observedAt?: number
  resetAt?: number
}) {
  const lines = [
    {
      type: 'session_meta',
      payload: {
        account_scoped: true,
        creator_account_id: identity.accountId,
        creator_user_id: options.user ?? identity.userId
      }
    },
    {
      type: 'event_msg',
      timestamp: new Date(options.observedAt ?? Date.now()).toISOString(),
      payload: {
        type: 'token_count',
        info: null,
        rate_limits: {
          limit_id: 'codex',
          primary: {
            used_percent: 37,
            window_minutes: 300,
            resets_at: options.resetAt ?? Math.floor(Date.now() / 1000) + 3600
          }
        }
      }
    }
  ]
  return writeFile(
    join(folder, `rollout-${options.name}.jsonl`),
    `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`
  )
}

describe('local Codex quota', () => {
  it('skips network and CLI reads for a fresh, account-scoped rollout', async () => {
    const claims = Buffer.from(
      JSON.stringify({
        'https://api.openai.com/auth': {
          chatgpt_account_id: identity.accountId,
          chatgpt_user_id: identity.userId
        }
      })
    ).toString('base64url')
    await writeFile(
      join(home, 'auth.json'),
      JSON.stringify({
        tokens: { access_token: `header.${claims}.signature`, account_id: identity.accountId }
      })
    )
    await writeRollout({ name: 'matching' })
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    await expect(
      fetchCodexRateLimits({ codexHomePath: home, preferSessionSnapshot: true })
    ).resolves.toMatchObject({
      status: 'ok',
      session: { usedPercent: 37 },
      usageMetadata: { source: 'live-session' }
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('ignores other users, expired windows, and old observations', async () => {
    await writeRollout({ name: 'other', user: 'other' })
    await writeRollout({ name: 'expired', resetAt: Math.floor(Date.now() / 1000) - 1 })
    await writeRollout({ name: 'stale', observedAt: Date.now() - 20 * 60_000 })
    await expect(
      readRecentCodexSessionQuota(home, identity, new AbortController().signal)
    ).resolves.toBeNull()
  })
})
