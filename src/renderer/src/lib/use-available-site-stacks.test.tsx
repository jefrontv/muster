// @vitest-environment happy-dom
//
// The probe is the only thing that decides whether a local stack is offered, and it used to be
// asked once per mount: a stack installed while Muster was open stayed invisible until the panel
// was closed and reopened. These pin the triggers, not the transport.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SiteLocalStack } from '../../../shared/site-types'
import { useAvailableSiteStacks } from './use-available-site-stacks'

type Answer = { ok: true; value: SiteLocalStack[] } | { ok: false; error: string } | undefined

const roots: Root[] = []
const answer: { current: Answer } = { current: { ok: true, value: [] } }
const available = vi.fn(async (): Promise<Answer> => answer.current)
let seen: SiteLocalStack[] | null = null

function Harness(): null {
  seen = useAvailableSiteStacks()
  return null
}

async function mount(): Promise<void> {
  const container = document.createElement('div')
  const root = createRoot(container)
  roots.push(root)
  await act(async () => {
    root.render(<Harness />)
  })
}

/** The stub settles on a microtask, so a probe needs a turn of the loop before it is visible. */
async function settle(): Promise<void> {
  for (let i = 0; i < 3; i += 1) {
    await act(async () => {
      await Promise.resolve()
    })
  }
}

async function render(): Promise<void> {
  await mount()
  await settle()
}

async function dispatchFocus(): Promise<void> {
  await act(async () => {
    window.dispatchEvent(new Event('focus'))
  })
  await settle()
}

describe('useAvailableSiteStacks', () => {
  beforeEach(() => {
    available.mockClear()
    seen = null
    answer.current = { ok: true, value: [] }
    // @ts-expect-error test harness shim for the preload bridge
    window.api = { siteStacks: { available } }
  })

  afterEach(async () => {
    vi.useRealTimers()
    for (const root of roots.splice(0)) {
      await act(async () => {
        root.unmount()
      })
    }
  })

  it('asks on mount, so the chooser is not rendered as if nothing were installed', async () => {
    answer.current = { ok: true, value: ['localwp'] }

    await render()

    expect(seen).toEqual(['localwp'])
  })

  it('re-asks on focus, so a stack installed meanwhile appears without reopening the panel', async () => {
    answer.current = { ok: true, value: ['localwp'] }
    await render()

    answer.current = { ok: true, value: ['localwp', 'agent-local'] }
    await dispatchFocus()

    expect(seen).toEqual(['localwp', 'agent-local'])
  })

  it('re-asks on its own while the window stays visible', async () => {
    vi.useFakeTimers()
    answer.current = { ok: true, value: ['localwp'] }
    await render()

    answer.current = { ok: true, value: ['localwp', 'agent-local'] }
    await act(async () => {
      vi.advanceTimersByTime(30_000)
    })
    await settle()

    expect(seen).toEqual(['localwp', 'agent-local'])
  })

  it('collapses triggers that land on a probe already in flight into one follow-up', async () => {
    answer.current = { ok: true, value: ['localwp'] }
    const gate = Promise.withResolvers<Answer>()
    available.mockImplementationOnce(async () => await gate.promise)

    await mount()
    await dispatchFocus()
    await dispatchFocus()

    expect(available).toHaveBeenCalledTimes(1)

    await act(async () => {
      gate.resolve({ ok: true, value: ['localwp'] })
    })
    await settle()

    expect(available).toHaveBeenCalledTimes(2)
    expect(seen).toEqual(['localwp'])
  })

  it('keeps the last good answer when a later probe fails', async () => {
    answer.current = { ok: true, value: ['localwp'] }
    await render()

    answer.current = { ok: false, error: 'daemon wedged' }
    await dispatchFocus()

    expect(seen).toEqual(['localwp'])
  })

  it('answers empty on a first-probe failure, so the review seeds rather than waits', async () => {
    answer.current = { ok: false, error: 'daemon wedged' }

    await render()

    expect(seen).toEqual([])
  })

  it('survives a bridge that answers nothing at all, which is what the web client has', async () => {
    answer.current = undefined

    await render()

    expect(seen).toEqual([])
  })
})
