import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { credentialDecryptionMessage } from '../../shared/integration-credential-errors'

const { userDataDir } = vi.hoisted(() => ({ userDataDir: { current: '' } }))

vi.mock('electron', () => ({ safeStorage: { isEncryptionAvailable: () => false } }))
vi.mock('../persistence', () => ({ getCanonicalUserDataPath: () => userDataDir.current }))
vi.mock('../integration-credential-file', () => ({
  readStoredCredentialToken: () => {
    throw new Error(credentialDecryptionMessage('Bitbucket'))
  }
}))

import {
  _resetBitbucketAuthLossForTests,
  dismissBitbucketAuthLoss,
  getPendingBitbucketAuthLoss,
  reportBitbucketAuthLoss,
  resetBitbucketAuthLoss,
  wireBitbucketAuthLoss
} from './auth-loss'
import { getStoredBitbucketCredential } from './credential-store'

describe('Bitbucket auth loss dedupe', () => {
  const onChange = vi.fn()

  beforeEach(() => {
    _resetBitbucketAuthLossForTests()
    onChange.mockReset()
    wireBitbucketAuthLoss({ shouldReport: () => true, onChange })
  })

  it('reports the first failure and swallows repeats from polls and retries', () => {
    reportBitbucketAuthLoss('refresh-rejected', 100)
    reportBitbucketAuthLoss('token-rejected', 200)
    reportBitbucketAuthLoss('token-rejected', 300)

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith({ reason: 'refresh-rejected', detectedAt: 100 })
    expect(getPendingBitbucketAuthLoss()).toEqual({ reason: 'refresh-rejected', detectedAt: 100 })
  })

  it('stays quiet after "Not now" until the user reconnects or disconnects', () => {
    reportBitbucketAuthLoss('token-rejected', 1)
    dismissBitbucketAuthLoss()
    reportBitbucketAuthLoss('token-rejected', 2)

    expect(onChange.mock.calls).toEqual([[{ reason: 'token-rejected', detectedAt: 1 }], [null]])
    expect(getPendingBitbucketAuthLoss()).toBeNull()

    resetBitbucketAuthLoss()
    reportBitbucketAuthLoss('token-rejected', 3)
    expect(onChange).toHaveBeenLastCalledWith({ reason: 'token-rejected', detectedAt: 3 })
  })

  it('closes an open prompt when the credential is replaced', () => {
    reportBitbucketAuthLoss('token-rejected', 1)
    resetBitbucketAuthLoss()

    expect(onChange).toHaveBeenLastCalledWith(null)
    expect(getPendingBitbucketAuthLoss()).toBeNull()
  })

  it('does not announce a reset when nothing was pending', () => {
    resetBitbucketAuthLoss()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('records nothing when the wiring says the user cannot act on it', () => {
    wireBitbucketAuthLoss({ shouldReport: () => false, onChange })
    reportBitbucketAuthLoss('token-rejected')

    expect(onChange).not.toHaveBeenCalled()
    expect(getPendingBitbucketAuthLoss()).toBeNull()
  })

  it('is a no-op when unwired, as in the muster-sites MCP server', () => {
    wireBitbucketAuthLoss(null)
    reportBitbucketAuthLoss('token-rejected')

    expect(getPendingBitbucketAuthLoss()).toBeNull()
  })
})

describe('Bitbucket credential store keychain failure', () => {
  const onChange = vi.fn()

  beforeEach(() => {
    _resetBitbucketAuthLossForTests()
    onChange.mockReset()
    wireBitbucketAuthLoss({ shouldReport: () => true, onChange })
    userDataDir.current = mkdtempSync(path.join(tmpdir(), 'bitbucket-auth-loss-'))
  })

  afterEach(() => {
    rmSync(userDataDir.current, { recursive: true, force: true })
  })

  it('reports an undecryptable saved credential once and still throws', () => {
    const secrets = path.join(userDataDir.current, 'integration-secrets')
    mkdirSync(secrets, { recursive: true })
    writeFileSync(
      path.join(secrets, 'bitbucket-review-credential.enc'),
      Buffer.from('ciphertext').toString('base64')
    )

    expect(() => getStoredBitbucketCredential()).toThrow(/decrypt/i)
    expect(() => getStoredBitbucketCredential()).toThrow(/decrypt/i)

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'keychain-unreadable' })
    )
  })

  it('treats a missing credential file as never connected', () => {
    expect(getStoredBitbucketCredential()).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
  })
})
