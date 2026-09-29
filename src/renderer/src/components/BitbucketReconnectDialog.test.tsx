// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useAppStore } from '@/store'
import type { BitbucketAuthLoss } from '../../../shared/bitbucket-auth-types'
import { BitbucketReconnectDialog } from './BitbucketReconnectDialog'

const beginOAuth = vi.fn()
const cancelOAuth = vi.fn()
const dismissLoss = vi.fn()
const pendingLoss = vi.fn()
const refreshPreflightStatus = vi.fn()
let emitLoss: ((loss: BitbucketAuthLoss | null) => void) | null = null

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
  })
}

beforeEach(() => {
  for (const mock of [beginOAuth, cancelOAuth, dismissLoss, pendingLoss, refreshPreflightStatus]) {
    mock.mockReset()
  }
  pendingLoss.mockResolvedValue(null)
  dismissLoss.mockResolvedValue({ ok: true })
  emitLoss = null
  Object.assign(window, {
    api: {
      bitbucketAuth: {
        beginOAuth,
        cancelOAuth,
        dismissLoss,
        pendingLoss,
        onLossChanged: (callback: (loss: BitbucketAuthLoss | null) => void) => {
          emitLoss = callback
          return () => {
            emitLoss = null
          }
        }
      }
    }
  })
  useAppStore.setState({ refreshPreflightStatus } as never)
})

afterEach(() => {
  cleanup()
  useAppStore.setState(useAppStore.getInitialState(), true)
  delete (window as { api?: unknown }).api
})

describe('BitbucketReconnectDialog', () => {
  it('renders nothing until main reports a loss', async () => {
    render(<BitbucketReconnectDialog />)
    await flush()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows a loss detected before this window mounted, with its reason', async () => {
    pendingLoss.mockResolvedValue({ reason: 'refresh-rejected', detectedAt: 1 })
    render(<BitbucketReconnectDialog />)
    await flush()

    expect(screen.getByRole('dialog', { name: 'Reconnect Bitbucket' })).toBeInTheDocument()
    expect(screen.getByText(/refused to renew the saved sign-in/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reconnect' })).toHaveFocus()
  })

  it('dismisses through main on "Not now"', async () => {
    render(<BitbucketReconnectDialog />)
    await flush()
    act(() => emitLoss?.({ reason: 'token-rejected', detectedAt: 2 }))

    fireEvent.click(screen.getByRole('button', { name: 'Not now' }))

    expect(dismissLoss).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('runs the OAuth flow and closes when main clears the loss', async () => {
    let finish: ((value: { ok: true; account: string }) => void) | undefined
    beginOAuth.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    render(<BitbucketReconnectDialog />)
    await flush()
    act(() => emitLoss?.({ reason: 'keychain-unreadable', detectedAt: 3 }))

    fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }))
    expect(beginOAuth).toHaveBeenCalledTimes(1)
    expect(screen.getByText(/Finish signing in in your browser/)).toBeInTheDocument()

    await act(async () => {
      emitLoss?.(null)
      finish?.({ ok: true, account: 'me' })
      await Promise.resolve()
    })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(refreshPreflightStatus).toHaveBeenCalledWith({ force: true })
  })

  it('keeps the prompt open with the error when sign-in fails', async () => {
    beginOAuth.mockResolvedValue({ error: 'Bitbucket sign-in was cancelled.' })
    render(<BitbucketReconnectDialog />)
    await flush()
    act(() => emitLoss?.({ reason: 'token-rejected', detectedAt: 4 }))

    fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }))
    await flush()

    expect(screen.getByRole('alert')).toHaveTextContent('Bitbucket sign-in was cancelled.')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('cancels an in-flight browser sign-in on "Not now"', async () => {
    beginOAuth.mockReturnValue(new Promise(() => undefined))
    render(<BitbucketReconnectDialog />)
    await flush()
    act(() => emitLoss?.({ reason: 'token-rejected', detectedAt: 5 }))

    fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }))
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }))

    expect(cancelOAuth).toHaveBeenCalledTimes(1)
    expect(dismissLoss).toHaveBeenCalledTimes(1)
  })
})
