// @vitest-environment happy-dom
//
// The contract that replaced live-bound inputs: typing writes nothing, a commit is explicit, and
// backing out restores what was there. Blur is inert on purpose — committing on blur is how a
// stray click used to repoint a deployment target.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SiteEditableField } from './SiteEditableField'

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
    throw new Error('field not rendered')
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

function options(): HTMLElement[] {
  return [...(container?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])]
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

async function press(key: string): Promise<void> {
  await act(async () => {
    input().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

// React reads blur off the bubbling focusout event; relatedTarget is what decides whether focus
// left the field or moved to one of its own controls.
async function blurTo(target: HTMLElement | null): Promise<void> {
  await act(async () => {
    input().dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: target }))
  })
}

async function blurAway(): Promise<void> {
  await blurTo(document.body)
}

async function render(props: Partial<Parameters<typeof SiteEditableField>[0]> = {}) {
  const onCommit = props.onCommit ?? vi.fn()
  await act(async () => {
    root?.render(
      <SiteEditableField label="SSH host" value="a.example.com" {...props} onCommit={onCommit} />
    )
  })
  return onCommit as ReturnType<typeof vi.fn>
}

describe('SiteEditableField', () => {
  it('starts locked and only becomes editable on request', async () => {
    await render()

    expect(input().readOnly).toBe(true)
    await click(button('Edit SSH host'))
    expect(input().readOnly).toBe(false)
  })

  it('unlocks when the field itself is clicked, not just the pencil', async () => {
    await render()

    await click(input())
    expect(input().readOnly).toBe(false)
    expect(button('Save SSH host')).toBeTruthy()
  })

  it('writes nothing while the user types', async () => {
    const onCommit = await render()

    await click(button('Edit SSH host'))
    await type('b.example.com')

    expect(onCommit).not.toHaveBeenCalled()
    expect(input().value).toBe('b.example.com')
  })

  it('commits once on save and locks the field again', async () => {
    const onCommit = await render()

    await click(button('Edit SSH host'))
    await type('b.example.com')
    await click(button('Save SSH host'))

    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledWith('b.example.com')
    expect(input().readOnly).toBe(true)
  })

  it('treats Enter as save and Escape as cancel', async () => {
    const onCommit = await render()

    await click(button('Edit SSH host'))
    await type('typed.example.com')
    await press('Enter')
    expect(onCommit).toHaveBeenCalledWith('typed.example.com')

    await click(button('Edit SSH host'))
    await type('discarded.example.com')
    await press('Escape')
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(input().value).toBe('a.example.com')
  })

  it('restores the original value when the edit is cancelled', async () => {
    const onCommit = await render()

    await click(button('Edit SSH host'))
    await type('discarded.example.com')
    await click(button('Cancel editing SSH host'))

    expect(onCommit).not.toHaveBeenCalled()
    expect(input().value).toBe('a.example.com')
  })

  it('does not write when the value was not actually changed', async () => {
    // Why: every write costs a disk save and a git branch read on the main side.
    const onCommit = await render()

    await click(button('Edit SSH host'))
    await click(button('Save SSH host'))

    expect(onCommit).not.toHaveBeenCalled()
  })

  it('commits when focus leaves the field', async () => {
    const onCommit = await render()

    await click(button('Edit SSH host'))
    await type('b.example.com')
    await blurAway()

    expect(onCommit).toHaveBeenCalledWith('b.example.com')
    expect(input().readOnly).toBe(true)
  })

  it('does not write when focus leaves a field nothing was typed into', async () => {
    const onCommit = await render()

    await click(button('Edit SSH host'))
    await blurAway()

    expect(onCommit).not.toHaveBeenCalled()
  })

  it('ignores the blur into its own controls, so cancel still discards', async () => {
    // Why: mousedown on the X blurs the input before the click lands. If that blur committed,
    // the X could never discard anything.
    const onCommit = await render()

    await click(button('Edit SSH host'))
    await type('discarded.example.com')
    await blurTo(button('Cancel editing SSH host'))
    await click(button('Cancel editing SSH host'))

    expect(onCommit).not.toHaveBeenCalled()
    expect(input().value).toBe('a.example.com')
  })

  it('does not clear a stored secret when focus passes through it', async () => {
    // Why: an untouched secret box is indistinguishable from an emptied one, and the old
    // commit-on-blur field wiped passwords for exactly this reason.
    const onCommit = await render({ secret: true, value: '••••••••' })

    await click(button('Edit SSH host'))
    await blurAway()

    expect(onCommit).not.toHaveBeenCalled()
  })

  it('clears a stored secret when the emptied box loses focus', async () => {
    const onCommit = await render({ secret: true, value: '••••••••' })

    await click(button('Edit SSH host'))
    await type('x')
    await type('')
    await blurAway()

    expect(onCommit).toHaveBeenCalledWith('')
  })

  it('stays quiet until the query is worth matching on', async () => {
    await render({ value: '', suggestions: ['dedicated-03.efront.com.au', 'deploy'] })

    await click(button('Edit SSH host'))
    await type('de')
    expect(options()).toEqual([])

    await type('ded')
    expect(options().map((option) => option.textContent)).toEqual(['dedicated-03.efront.com.au'])
  })

  it('offers matching suggestions and fills one without committing it', async () => {
    const onCommit = await render({
      value: '',
      suggestions: ['dedicated-03.efront.com.au', 'shared-11.example.com']
    })

    await click(button('Edit SSH host'))
    await type('dedi')

    expect(options().map((option) => option.textContent)).toEqual(['dedicated-03.efront.com.au'])

    await click(options()[0])
    expect(input().value).toBe('dedicated-03.efront.com.au')
    expect(onCommit).not.toHaveBeenCalled()

    await press('Enter')
    expect(onCommit).toHaveBeenCalledWith('dedicated-03.efront.com.au')
  })

  it('takes the highlighted suggestion on Enter before it takes the draft', async () => {
    const onCommit = await render({ value: '', suggestions: ['shared-11.example.com'] })

    await click(button('Edit SSH host'))
    await type('shared')
    await press('ArrowDown')
    await press('Enter')

    expect(onCommit).not.toHaveBeenCalled()
    expect(input().value).toBe('shared-11.example.com')
  })

  it('closes the suggestion list before Escape cancels the edit', async () => {
    await render({ value: '', suggestions: ['shared-11.example.com'] })

    await click(button('Edit SSH host'))
    await type('shared')
    await press('Escape')

    expect(options().length).toBe(0)
    expect(input().readOnly).toBe(false)

    await press('Escape')
    expect(input().readOnly).toBe(true)
  })
})
