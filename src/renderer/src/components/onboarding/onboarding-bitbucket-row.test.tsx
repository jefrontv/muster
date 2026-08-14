// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useAppStore } from '@/store'
import { BitbucketRow } from './onboarding-bitbucket-row'

const beginOAuth = vi.fn()
const cancelOAuth = vi.fn()
const status = vi.fn()

beforeEach(() => {
  beginOAuth.mockReset()
  cancelOAuth.mockReset()
  status.mockReset()
  status.mockResolvedValue({
    configured: false,
    method: null,
    email: null,
    account: null,
    fromEnvironment: false,
    oauthAvailable: true
  })
  Object.assign(window, {
    api: {
      bitbucketAuth: {
        status,
        beginOAuth,
        cancelOAuth,
        clear: vi.fn()
      }
    }
  })
  useAppStore.setState(useAppStore.getInitialState(), true)
  useAppStore.setState({
    preflightStatus: {
      gh: { installed: true, authenticated: false },
      bitbucket: { configured: false, authenticated: false, account: null }
    },
    preflightStatusLoading: false,
    refreshPreflightStatus: vi.fn()
  } as never)
})

afterEach(() => {
  cleanup()
  useAppStore.setState(useAppStore.getInitialState(), true)
  delete (window as { api?: unknown }).api
})

describe('BitbucketRow onboarding connect', () => {
  it('starts OAuth in the onboarding row instead of opening a nested dialog', async () => {
    let resolveOAuth: ((value: { ok: true; account: string }) => void) | undefined
    beginOAuth.mockReturnValue(
      new Promise((resolve) => {
        resolveOAuth = resolve
      })
    )

    render(<BitbucketRow />)
    await act(async () => {
      await Promise.resolve()
    })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }))

    expect(beginOAuth).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText(/Finish signing in in your browser/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()

    await act(async () => {
      resolveOAuth?.({ ok: true, account: 'jake' })
      await Promise.resolve()
    })
  })

  it('cancels the in-flight browser wait from the same row', async () => {
    beginOAuth.mockReturnValue(new Promise(() => undefined))
    render(<BitbucketRow />)
    await act(async () => {
      await Promise.resolve()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(cancelOAuth).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Connect' })).toBeInTheDocument()
  })
})
