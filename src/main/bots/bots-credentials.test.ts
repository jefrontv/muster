import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ dir: '', encryption: true }))

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => mocks.encryption,
    encryptString: (value: string) => Buffer.from(`enc:${value}`),
    decryptString: (value: Buffer) => value.toString().replace(/^enc:/, '')
  }
}))
vi.mock('../persistence', () => ({ getCanonicalUserDataPath: () => mocks.dir }))

import {
  botsCredentialHint,
  isBotsCredentialEnvName,
  readBotsCredentialEnv,
  writeBotsCredentialEnv
} from './bots-credentials'

const file = (): string =>
  path.join(mocks.dir, 'integration-secrets', 'muster-bots-credentials.enc')

beforeEach(() => {
  mocks.dir = mkdtempSync(path.join(tmpdir(), 'bots-credentials-'))
  mocks.encryption = true
})

afterEach(() => {
  rmSync(mocks.dir, { recursive: true, force: true })
})

describe('bots credentials', () => {
  it('stores keys encrypted and reads them back as env', () => {
    writeBotsCredentialEnv({ COMPOSIO_API_KEY: ' ak_123456 ' })
    expect(readFileSync(file(), 'utf8')).not.toContain('ak_123456')
    expect(readBotsCredentialEnv()).toEqual({ COMPOSIO_API_KEY: 'ak_123456' })
    expect(botsCredentialHint('COMPOSIO_API_KEY')).toBe('3456')
  })

  it('removes a cleared key and the file once nothing is left', () => {
    writeBotsCredentialEnv({ COMPOSIO_API_KEY: 'ak_1', OMB_GROQ_API_KEY: 'gsk_2' })
    writeBotsCredentialEnv({ COMPOSIO_API_KEY: '' })
    expect(readBotsCredentialEnv()).toEqual({ OMB_GROQ_API_KEY: 'gsk_2' })
    writeBotsCredentialEnv({ OMB_GROQ_API_KEY: '' })
    expect(existsSync(file())).toBe(false)
  })

  it('accepts secret names only, never settings or cloud tokens', () => {
    expect(isBotsCredentialEnvName('COMPOSIO_API_KEY')).toBe(true)
    expect(isBotsCredentialEnvName('OPENAI_COMPAT_URL')).toBe(false)
    expect(isBotsCredentialEnvName('OMB_CLOUD_AI_TOKEN')).toBe(false)
    expect(isBotsCredentialEnvName('NODE_OPTIONS')).toBe(false)
    writeBotsCredentialEnv({ NODE_OPTIONS: '--inspect', PATH_KEY: 'x' })
    expect(readBotsCredentialEnv()).toEqual({ PATH_KEY: 'x' })
  })

  it('refuses to write when secure storage is unavailable', () => {
    mocks.encryption = false
    expect(() => writeBotsCredentialEnv({ COMPOSIO_API_KEY: 'ak_1' })).toThrow(/Secure storage/)
    expect(existsSync(file())).toBe(false)
  })
})
