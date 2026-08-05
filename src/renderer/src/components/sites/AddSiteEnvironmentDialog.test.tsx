// @vitest-environment happy-dom
//
// The add-environment contract: two option rows, then a name that must be non-empty and unique,
// with branch names as suggestions that never constrain free text. Copy must reach the
// secrets-copying IPC with (siteId, from, to) — a copy that skipped it would drop passwords.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { SiteResult, SiteSummary } from '../../../../shared/site-types'
import { AddSiteEnvironmentDialog } from './AddSiteEnvironmentDialog'

type EnvArgs = { siteId: string; name?: string; from?: string; to?: string }
type EnvMock = Mock<(args: EnvArgs) => Promise<SiteResult<SiteSummary>>>

// The dialog reaches mutations through the store; the store slices forward verbatim to
// window.api.sites, so the mock does the same and the assertions land on the IPC payload.
const apiMocks = vi.hoisted(() => ({
  upsertEnvironment: vi.fn() as EnvMock,
  copyEnvironment: vi.fn() as EnvMock,
  listBranches: vi.fn() as Mock<(siteId: string) => Promise<SiteResult<string[]>>>
}))

vi.mock('@/store', () => {
  const forward = async (call: Promise<SiteResult<SiteSummary>>): Promise<string | null> => {
    const result = await call
    return result.ok ? null : result.error
  }
  const state = {
    upsertSiteEnvironment: (siteId: string, name: string) =>
      forward(apiMocks.upsertEnvironment({ siteId, name })),
    copySiteEnvironment: (siteId: string, from: string, to: string) =>
      forward(apiMocks.copyEnvironment({ siteId, from, to }))
  }
  return { useAppStore: (selector: (s: typeof state) => unknown) => selector(state) }
})

let root: Root | null = null
let container: HTMLDivElement | null = null
let onCreated: Mock<(name: string) => void>
let onOpenChange: Mock<(open: boolean) => void>

async function render(): Promise<void> {
  await act(async () => {
    root?.render(
      <AddSiteEnvironmentDialog
        open
        onOpenChange={onOpenChange}
        siteId="site-1"
        environmentNames={['production', 'dev']}
        defaultSource="dev"
        onCreated={onCreated}
      />
    )
  })
}

/** Radix portals the dialog to the body, so every query starts there. */
function buttonByText(text: string): HTMLButtonElement | null {
  return (
    [...document.body.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === text
    ) ?? null
  )
}

async function click(element: HTMLElement | null): Promise<void> {
  expect(element).not.toBeNull()
  await act(async () => {
    element?.click()
  })
}

function nameInput(): HTMLInputElement | null {
  return document.body.querySelector<HTMLInputElement>('input[role="combobox"]')
}

async function typeName(value: string): Promise<void> {
  const input = nameInput()
  await act(async () => {
    // React tracks the last value it wrote, so the native setter is the only way to make it see a
    // change event as a real edit.
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
    input?.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function options(): string[] {
  return [...document.body.querySelectorAll('[role="option"]')].map(
    (option) => option.textContent?.trim() ?? ''
  )
}

beforeEach(() => {
  onCreated = vi.fn()
  onOpenChange = vi.fn()
  apiMocks.upsertEnvironment.mockResolvedValue({ ok: false, error: 'unexpected upsert' })
  apiMocks.copyEnvironment.mockResolvedValue({ ok: false, error: 'unexpected copy' })
  apiMocks.listBranches.mockResolvedValue({ ok: true, value: ['main', 'develop', 'feature/login'] })
  Reflect.set(globalThis.window, 'api', { sites: apiMocks })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  if (root) {
    act(() => root?.unmount())
  }
  container?.remove()
  root = null
  container = null
  vi.clearAllMocks()
})

describe('AddSiteEnvironmentDialog', () => {
  it('steps from the two option rows to the name step', async () => {
    await render()
    expect(buttonByText('Create new environment')).not.toBeNull()
    expect(buttonByText('Copy existing environment')).not.toBeNull()
    expect(nameInput()).toBeNull()

    await click(buttonByText('Create new environment'))
    expect(nameInput()).not.toBeNull()
    expect(document.body.querySelector('[role="radiogroup"]')).toBeNull()
  })

  it('rejects an empty or duplicate name', async () => {
    await render()
    await click(buttonByText('Create new environment'))

    expect(buttonByText('Create')?.disabled).toBe(true)
    await typeName('   ')
    expect(buttonByText('Create')?.disabled).toBe(true)

    await typeName('production')
    expect(buttonByText('Create')?.disabled).toBe(true)
    expect(document.body.textContent).toContain('already exists')

    await click(buttonByText('Create'))
    expect(apiMocks.upsertEnvironment).not.toHaveBeenCalled()
  })

  it('creates a blank environment with the trimmed name and reports it back', async () => {
    apiMocks.upsertEnvironment.mockResolvedValue({ ok: true, value: {} as SiteSummary })
    await render()
    await click(buttonByText('Create new environment'))
    await typeName('  staging  ')

    await click(buttonByText('Create'))
    expect(apiMocks.upsertEnvironment).toHaveBeenCalledWith({ siteId: 'site-1', name: 'staging' })
    expect(onCreated).toHaveBeenCalledWith('staging')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('copies from the currently selected chip by default and hits the secrets-copy IPC', async () => {
    apiMocks.copyEnvironment.mockResolvedValue({ ok: true, value: {} as SiteSummary })
    await render()
    await click(buttonByText('Copy existing environment'))

    const checked = document.body.querySelector('[role="radio"][aria-checked="true"]')
    expect(checked?.textContent?.trim()).toBe('dev')

    await typeName('staging')
    await click(buttonByText('Copy'))
    expect(apiMocks.copyEnvironment).toHaveBeenCalledWith({
      siteId: 'site-1',
      from: 'dev',
      to: 'staging'
    })
    expect(onCreated).toHaveBeenCalledWith('staging')
  })

  it('copies from another environment when picked', async () => {
    apiMocks.copyEnvironment.mockResolvedValue({ ok: true, value: {} as SiteSummary })
    await render()
    await click(buttonByText('Copy existing environment'))
    await click(buttonByText('production'))
    await typeName('prod-2')

    await click(buttonByText('Copy'))
    expect(apiMocks.copyEnvironment).toHaveBeenCalledWith({
      siteId: 'site-1',
      from: 'production',
      to: 'prod-2'
    })
  })

  it('suggests the stubbed branches and filters them as the user types', async () => {
    await render()
    await click(buttonByText('Create new environment'))

    await typeName('e')
    expect(options()).toEqual(['develop', 'feature/login'])

    await typeName('dev')
    expect(options()).toEqual(['develop'])

    await click(buttonByText('develop'))
    expect(nameInput()?.value).toBe('develop')
  })

  it('accepts free text untouched by the suggestions', async () => {
    apiMocks.upsertEnvironment.mockResolvedValue({ ok: true, value: {} as SiteSummary })
    await render()
    await click(buttonByText('Create new environment'))

    await typeName('totally-custom')
    expect(options()).toEqual([])
    expect(buttonByText('Create')?.disabled).toBe(false)

    await click(buttonByText('Create'))
    expect(apiMocks.upsertEnvironment).toHaveBeenCalledWith({
      siteId: 'site-1',
      name: 'totally-custom'
    })
  })
})
