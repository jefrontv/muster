import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { Buffer } from 'node:buffer'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { credentialDecryptionMessage } from '../../shared/integration-credential-errors'

const { safeStorageMock, userDataPathMock, writeSecureFileMock } = vi.hoisted(() => ({
  safeStorageMock: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((value: string) => Buffer.from(`enc:${value}`, 'utf8')),
    decryptString: vi.fn((value: Buffer) => {
      const text = value.toString('utf8')
      if (!text.startsWith('enc:')) {
        throw new Error('safeStorage refused the payload')
      }
      return text.slice('enc:'.length)
    })
  },
  userDataPathMock: vi.fn(() => ''),
  writeSecureFileMock: vi.fn()
}))

vi.mock('electron', () => ({ safeStorage: safeStorageMock }))
vi.mock('../persistence', () => ({ getCanonicalUserDataPath: userDataPathMock }))
vi.mock('../../shared/secure-file', () => ({ writeSecureFile: writeSecureFileMock }))

import {
  ActiveCollabSecretUnavailableError,
  clearActiveCollabCredential,
  getActiveCollabConnectionStatus,
  getActiveCollabCredential,
  setActiveCollabCredential,
  type ActiveCollabCredentialRecord
} from './credential-store'

const RECORD: ActiveCollabCredentialRecord = {
  instanceUrl: 'https://projects.efront.com.au',
  token: 'ac-token-secret',
  userId: 42,
  userName: 'Ada Lovelace',
  userEmail: 'ada@efront.com.au'
}

let userDataDir = ''

function credentialFile(): string {
  return join(userDataDir, 'integration-secrets', 'activecollab-credential.enc')
}

/** Bytes that are neither decryptable nor printable UTF-8 — i.e. a real keychain refusal. */
function writeUndecryptableCredential(): void {
  const target = credentialFile()
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, Buffer.from([0x76, 0x31, 0x30, 0xff, 0xfe]).toString('base64'), 'utf8')
}

describe('ActiveCollab credential store', () => {
  beforeEach(() => {
    userDataDir = mkdtempSync(join(tmpdir(), 'muster-ac-cred-'))
    userDataPathMock.mockReturnValue(userDataDir)
    safeStorageMock.isEncryptionAvailable.mockReturnValue(true)
    writeSecureFileMock.mockImplementation((target: string, contents: string) => {
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, contents, 'utf8')
    })
  })

  afterEach(() => {
    rmSync(userDataDir, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  it('treats "nothing stored" as a clean state with an actionable reason', () => {
    expect(getActiveCollabCredential()).toBeNull()
    expect(getActiveCollabConnectionStatus()).toEqual({
      configured: false,
      connection: null,
      reason: 'ActiveCollab is not connected. Add your instance URL and sign in to connect.'
    })
  })

  it('round-trips the record through safeStorage, never writing the token in the clear', () => {
    setActiveCollabCredential(RECORD)

    expect(getActiveCollabCredential()).toEqual(RECORD)
    const onDisk = readFileSync(credentialFile(), 'utf8')
    expect(onDisk).not.toContain(RECORD.token)
    expect(Buffer.from(onDisk, 'base64').toString('utf8')).toBe(`enc:${JSON.stringify(RECORD)}`)
  })

  it('exposes the connection but not the token once configured', () => {
    setActiveCollabCredential(RECORD)

    const status = getActiveCollabConnectionStatus()

    expect(status).toEqual({
      configured: true,
      connection: {
        instanceUrl: 'https://projects.efront.com.au',
        userId: 42,
        userName: 'Ada Lovelace',
        userEmail: 'ada@efront.com.au'
      },
      reason: ''
    })
    expect(JSON.stringify(status)).not.toContain(RECORD.token)
  })

  it('strips trailing slashes so a permalink join never doubles them', () => {
    setActiveCollabCredential({ ...RECORD, instanceUrl: 'https://projects.efront.com.au//' })

    expect(getActiveCollabCredential()?.instanceUrl).toBe('https://projects.efront.com.au')
  })

  it('reports a readable reason instead of throwing when the credential cannot be decrypted', () => {
    writeUndecryptableCredential()

    expect(getActiveCollabConnectionStatus()).toEqual({
      configured: false,
      connection: null,
      reason: credentialDecryptionMessage('ActiveCollab')
    })
  })

  it('still throws for callers that need the token, so they can prompt for a reconnect', () => {
    writeUndecryptableCredential()

    expect(() => getActiveCollabCredential()).toThrow(credentialDecryptionMessage('ActiveCollab'))
  })

  it('removes the stored credential on clear', () => {
    setActiveCollabCredential(RECORD)
    expect(existsSync(credentialFile())).toBe(true)

    clearActiveCollabCredential()

    expect(existsSync(credentialFile())).toBe(false)
    expect(getActiveCollabCredential()).toBeNull()
    expect(getActiveCollabConnectionStatus().configured).toBe(false)
  })

  it('drops a record that cannot address the API rather than storing a half-connection', () => {
    setActiveCollabCredential(RECORD)

    setActiveCollabCredential({ ...RECORD, userId: 0 })

    expect(existsSync(credentialFile())).toBe(false)
    expect(getActiveCollabCredential()).toBeNull()
  })

  it('refuses to save when secure storage is unavailable rather than writing plaintext', () => {
    safeStorageMock.isEncryptionAvailable.mockReturnValue(false)

    expect(() => setActiveCollabCredential(RECORD)).toThrow(ActiveCollabSecretUnavailableError)
    expect(writeSecureFileMock).not.toHaveBeenCalled()
    expect(existsSync(credentialFile())).toBe(false)
  })
})
