// @vitest-environment happy-dom
//
// The secret's own contract on top of SiteEditableField: the field is masked, a stored secret shows
// as a sentinel the renderer never sends back, an edit starts from an empty box, and saving that
// empty box is how a stored secret gets cleared.
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

function input(): HTMLInputElement {
  const element = container?.querySelector('input')
  if (!element) {
    throw new Error('secret input not rendered')
  }
  return element
}

function button(label: string): HTMLButtonElement {
  const element = container?.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  if (!element) {
    throw new Error(`no button labelled ${label}`)
  }
  return element
}

async function click(element: HTMLElement): Promise<void> {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

// React tracks the input's value on the DOM node, so a plain assignment is swallowed as a no-op.
const setInputValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set as (
  this: HTMLInputElement,
  next: string
) => void

async function type(value: string): Promise<void> {
  await act(async () => {
    setInputValue.call(input(), value)
    input().dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function render(
  isSet: boolean,
  onSetSecret: (kind: SiteSecretKind, value: string) => void
): Promise<void> {
  await act(async () => {
    root?.render(
      <SiteSecretField kind="ssh" label="SSH password" isSet={isSet} onSetSecret={onSetSecret} />
    )
  })
}

describe('SiteSecretField', () => {
  it('masks the value', async () => {
    await render(false, vi.fn())
    expect(input().type).toBe('password')
  })

  it('shows a stored secret as a filled masked field, not an empty box', async () => {
    // Why: an empty box beside a stored secret read as "nothing saved here"; the sentinel makes it
    // read like every other saved password field. The dots are a stand-in — the renderer never
    // holds the real value.
    await render(true, vi.fn())
    expect(input().value).toBe('••••••••')

    await render(false, vi.fn())
    expect(input().value).toBe('')
  })

  it('starts an edit from an empty box so the sentinel can never be sent back', async () => {
    const onSetSecret = vi.fn()
    await render(true, onSetSecret)

    await click(button('Edit SSH password'))
    expect(input().value).toBe('')

    await type('hunter2')
    await click(button('Save SSH password'))
    expect(onSetSecret).toHaveBeenCalledWith('ssh', 'hunter2')
  })

  it('leaves a stored secret alone when the edit is cancelled', async () => {
    const onSetSecret = vi.fn()
    await render(true, onSetSecret)

    await click(button('Edit SSH password'))
    await type('typed-then-abandoned')
    await click(button('Cancel editing SSH password'))

    expect(onSetSecret).not.toHaveBeenCalled()
    expect(input().value).toBe('••••••••')
  })

  it('clears the secret when an edited box is emptied and saved', async () => {
    // Why the edit is required: an untouched box is indistinguishable from an emptied one, so
    // only a box the user actually typed into can clear a stored password.
    const onSetSecret = vi.fn()
    await render(true, onSetSecret)

    await click(button('Edit SSH password'))
    await type('x')
    await type('')
    await click(button('Save SSH password'))

    expect(onSetSecret).toHaveBeenCalledWith('ssh', '')
  })

  it('leaves a stored secret alone when the box is opened and saved untouched', async () => {
    const onSetSecret = vi.fn()
    await render(true, onSetSecret)

    await click(button('Edit SSH password'))
    await click(button('Save SSH password'))

    expect(onSetSecret).not.toHaveBeenCalled()
  })
})
