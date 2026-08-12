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

  it('saves an edited value on blur and empties the box', async () => {
    const onSetSecret = vi.fn()
    const input = await render(false, onSetSecret)

    await type(input, 'hunter2')
    await blur(input)

    expect(onSetSecret).toHaveBeenCalledWith('ssh', 'hunter2')
    expect(input.value).toBe('')
  })

  it('leaves a stored secret alone when the field was never edited', async () => {
    // Why: the box always renders empty beside a stored secret, so blurring past it must not clear it.
    const onSetSecret = vi.fn()
    const input = await render(true, onSetSecret)

    await blur(input)

    expect(onSetSecret).not.toHaveBeenCalled()
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
