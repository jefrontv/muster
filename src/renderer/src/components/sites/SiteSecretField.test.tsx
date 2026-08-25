// @vitest-environment happy-dom
//
// The contract that replaced the Save/Clear buttons: an untouched field never writes, an edited
// one commits on blur, and emptying an edited one is how a stored secret gets cleared.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SiteSecretKind } from '../../../../shared/site-types'
import { SiteSecretField } from './SiteSecretField'

let root: Root | null = null
let container: HTMLDivElement | null = null

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
})

async function render(isSet: boolean, onSetSecret: (kind: SiteSecretKind, value: string) => void) {
  await act(async () => {
    root?.render(
      <SiteSecretField kind="ssh" label="SSH password" isSet={isSet} onSetSecret={onSetSecret} />
    )
  })
  const input = container?.querySelector('input')
  if (!input) {
    throw new Error('secret input not rendered')
  }
  return input
}

async function type(input: HTMLInputElement, value: string): Promise<void> {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set as (
      this: HTMLInputElement,
      next: string
    ) => void
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function blur(input: HTMLInputElement): Promise<void> {
  // React delegates blur through the bubbling `focusout` event, not `blur`.
  await act(async () => {
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
  })
}

describe('SiteSecretField', () => {
  it('masks the value', async () => {
    const input = await render(false, vi.fn())
    expect(input.type).toBe('password')
  })

  it('shows a stored secret as a filled masked field, not an empty box', async () => {
    // Why: an empty box beside a stored secret read as "nothing saved here"; the sentinel makes it
    // read like every other saved password field. The dots are a stand-in — the renderer never
    // holds the real value.
    const stored = await render(true, vi.fn())
    expect(stored.value).toBe('••••••••')

    const unset = await render(false, vi.fn())
    expect(unset.value).toBe('')
  })

  it('saves an edited value on blur and empties the box', async () => {
    const onSetSecret = vi.fn()
    const input = await render(false, onSetSecret)

    await type(input, 'hunter2')
    await blur(input)

    expect(onSetSecret).toHaveBeenCalledWith('ssh', 'hunter2')
    expect(input.value).toBe('')
  })

  it('replaces the sentinel with what the user types, never sending the dots', async () => {
    // Why: the select-all-on-focus can be defeated (arrow key, then type); a value typed around
    // the sentinel must strip it — the dots were never the secret.
    const onSetSecret = vi.fn()
    const input = await render(true, onSetSecret)

    await type(input, '••••••••hunter2')
    await blur(input)

    expect(onSetSecret).toHaveBeenCalledWith('ssh', 'hunter2')
  })

  it('leaves a stored secret alone when the field was never edited', async () => {
    // Why: blurring past the sentinel must not clear or overwrite the stored value.
    const onSetSecret = vi.fn()
    const input = await render(true, onSetSecret)

    await blur(input)

    expect(onSetSecret).not.toHaveBeenCalled()
    expect(input.value).toBe('••••••••')
  })

  it('clears the secret when an edited field is left empty', async () => {
    const onSetSecret = vi.fn()
    const input = await render(true, onSetSecret)

    await type(input, 'x')
    await type(input, '')
    await blur(input)

    expect(onSetSecret).toHaveBeenCalledWith('ssh', '')
  })
})
