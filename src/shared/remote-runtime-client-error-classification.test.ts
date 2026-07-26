import { describe, expect, it } from 'vitest'
import {
  isRecoverableRemoteRuntimeConnectionError,
  toRemoteRuntimeClientErrorLike
} from './remote-runtime-client-error-classification'

describe('remote runtime client error classification', () => {
  it.each(['remote_runtime_unavailable', 'runtime_timeout', 'runtime_unavailable', 'reconnecting'])(
    'treats %s as recoverable',
    (code) => {
      expect(isRecoverableRemoteRuntimeConnectionError({ code, message: 'transport failed' })).toBe(
        true
      )
    }
  )

  it('does not retry authentication or protocol failures', () => {
    expect(
      isRecoverableRemoteRuntimeConnectionError({ code: 'unauthorized', message: 'bad token' })
    ).toBe(false)
    expect(
      isRecoverableRemoteRuntimeConnectionError({
        code: 'invalid_runtime_response',
        message: 'bad frame'
      })
    ).toBe(false)
  })

  it.each([
    'Could not connect to the remote Muster runtime.',
    'Remote Muster runtime closed the connection.',
    'Remote Muster runtime connection closed.',
    'Remote Muster runtime is not connected.',
    'Remote runtime subscription closed before it started.'
  ])('normalizes unstructured connection failure: %s', (message) => {
    const error = toRemoteRuntimeClientErrorLike(new Error(message))
    expect(isRecoverableRemoteRuntimeConnectionError(error)).toBe(true)
  })
})
