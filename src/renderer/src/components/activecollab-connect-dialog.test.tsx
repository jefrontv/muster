// @vitest-environment happy-dom

import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { ActiveCollabResult } from '../../../shared/activecollab-api-types'
import type { ActiveCollabConnection } from '../../../shared/activecollab-types'

type ConnectArgs = { instanceUrl: string; email: string; password: string }
type ConnectResult = ActiveCollabResult<ActiveCollabConnection>

const mocks = vi.hoisted(() => ({
  connect: vi.fn<(args: ConnectArgs) => Promise<ConnectResult>>()
}))

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    selector({
      connectActiveCollab: mocks.connect,
      settings: { activeRuntimeEnvironmentId: null }
    })
}))

// Radix portals its content outside the render container; a structural stand-in keeps the
// assertions on the dialog's own markup.
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children?: ReactNode }) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children?: ReactNode }) => <footer>{children}</footer>,
  DialogHeader: ({ children }: { children?: ReactNode }) => <header>{children}</header>,
  DialogTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>
}))

import { ActiveCollabConnectDialog } from './activecollab-connect-dialog'

const CONNECTION: ActiveCollabConnection = {
  instanceUrl: 'https://projects.example.com',
  userId: 42,
  userName: 'Ada Lovelace',
  userEmail: 'ada@example.com'
}

const PASSWORD = 'correct-horse-battery-staple'

let container: HTMLDivElement
let root: Root
let onConnected: Mock

beforeEach(() => {
  mocks.connect.mockReset()
  onConnected = vi.fn()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root.render(<ActiveCollabConnectDialog open onOpenChange={vi.fn()} onConnected={onConnected} />)
  })
})

afterEach(() => {
  act(() => {
    root.unmount()
  })
  container.remove()
})

function urlField(): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>(
    'input[placeholder="https://projects.example.com"]'
  )
  expect(input).toBeTruthy()
  return input as HTMLInputElement
}

function emailField(): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>('input[type="email"]')
  expect(input).toBeTruthy()
  return input as HTMLInputElement
}

function passwordField(): HTMLInputElement | null {
  return container.querySelector<HTMLInputElement>('input[type="password"]')
}

function type(input: HTMLInputElement, value: string): void {
  act(() => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setValue?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function submitForm(): Promise<void> {
  const form = container.querySelector('form')
  expect(form).toBeTruthy()
  await act(async () => {
    form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
}

async function fillAndSubmit(instanceUrl: string): Promise<void> {
  type(urlField(), instanceUrl)
  type(emailField(), 'ada@example.com')
  const password = passwordField()
  expect(password).toBeTruthy()
  type(password as HTMLInputElement, PASSWORD)
  await submitForm()
}

function errorText(): string {
  const alert = container.querySelector('[role="alert"]')
  expect(alert).toBeTruthy()
  return alert?.textContent ?? ''
}

describe('ActiveCollabConnectDialog instance URL validation', () => {
  it('refuses a bare host that is not a parseable URL', async () => {
    await fillAndSubmit('projects.example.com')

    expect(mocks.connect).not.toHaveBeenCalled()
    expect(errorText()).toContain('starting with http:// or https://')
  })

  it('refuses a URL whose scheme is neither http nor https', async () => {
    await fillAndSubmit('ftp://projects.example.com')

    expect(mocks.connect).not.toHaveBeenCalled()
    expect(errorText()).toContain('starting with http:// or https://')
  })
})

describe('ActiveCollabConnectDialog credential exchange', () => {
  it('trims the inputs, exchanges them once, and surfaces the connected account', async () => {
    mocks.connect.mockResolvedValue({ ok: true, value: CONNECTION })

    await fillAndSubmit('  https://projects.example.com/  ')

    expect(mocks.connect).toHaveBeenCalledTimes(1)
    expect(mocks.connect).toHaveBeenCalledWith({
      instanceUrl: 'https://projects.example.com',
      email: 'ada@example.com',
      password: PASSWORD
    })
    expect(container.textContent).toContain('Ada Lovelace')
    expect(container.textContent).toContain('ada@example.com')
    expect(container.textContent).toContain('https://projects.example.com')
    expect(onConnected).toHaveBeenCalledTimes(1)
  })

  it('tells a rejected credential apart from one that was never stored', async () => {
    // status 500 is ActiveCollab's real answer to a bad password; the message must follow `kind`.
    mocks.connect.mockResolvedValue({ ok: false, kind: 'auth', error: 'raw', status: 500 })
    await fillAndSubmit('https://projects.example.com')
    const authMessage = errorText()

    mocks.connect.mockResolvedValue({
      ok: false,
      kind: 'not-configured',
      error: 'raw',
      status: null
    })
    await fillAndSubmit('https://projects.example.com')
    const notConfiguredMessage = errorText()

    expect(authMessage).not.toBe(notConfiguredMessage)
    expect(authMessage).toContain('rejected those credentials')
    expect(notConfiguredMessage).toContain('not connected yet')
    // Neither message echoes the transport's raw text back at the user.
    expect(authMessage).not.toContain('raw')
    expect(notConfiguredMessage).not.toContain('raw')
  })

  it('never keeps the password once the exchange has it', async () => {
    let settle: (result: ConnectResult) => void = () => {}
    mocks.connect.mockReturnValue(
      new Promise<ConnectResult>((resolve) => {
        settle = resolve
      })
    )

    await fillAndSubmit('https://projects.example.com')

    // Cleared while the request is still in flight, not merely after it resolves.
    expect(passwordField()?.value).toBe('')
    expect(container.textContent).toContain('Exchanging…')
    // The reusable fields survive so a retry only retypes the secret.
    expect(urlField().value).toBe('https://projects.example.com')
    expect(emailField().value).toBe('ada@example.com')

    await act(async () => {
      settle({ ok: true, value: CONNECTION })
    })

    // The success panel replaces the form outright, so no password input remains at all.
    expect(passwordField()).toBeNull()
    expect(container.textContent).not.toContain(PASSWORD)
  })

  it('keeps the password out of the form after a failed exchange too', async () => {
    mocks.connect.mockResolvedValue({ ok: false, kind: 'auth', error: 'raw', status: 500 })

    await fillAndSubmit('https://projects.example.com')

    expect(passwordField()?.value).toBe('')
    expect(container.textContent).not.toContain(PASSWORD)
  })

  it('blocks a second submit while the first exchange is in flight', async () => {
    mocks.connect.mockReturnValue(new Promise<ConnectResult>(() => {}))

    await fillAndSubmit('https://projects.example.com')

    const submit = Array.from(container.querySelectorAll('button')).find(
      (button) => button.getAttribute('type') === 'submit'
    )
    expect(submit?.disabled).toBe(true)
    expect(urlField().disabled).toBe(true)

    await submitForm()

    expect(mocks.connect).toHaveBeenCalledTimes(1)
  })
})
