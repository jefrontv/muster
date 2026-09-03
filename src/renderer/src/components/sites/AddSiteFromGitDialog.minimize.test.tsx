// @vitest-environment happy-dom
//
// Minimizing must hide the dialog without ending the flow, and restoring must bring the same
// dialog back. Both halves are easy to get wrong in the same way: the dialog is "closed" while
// minimized, so any close handler that treats a close as "the user is done" tears the flow down.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CloneSourceProvider } from '../../../../shared/site-clone-source-types'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAppStore } from '@/store'
import { AddSiteFromGitDialog } from './AddSiteFromGitDialog'

vi.mock('./SiteSetupContinuation', () => ({ SiteSetupContinuation: () => null }))

const BITBUCKET: CloneSourceProvider = {
  id: 'bitbucket',
  label: 'Bitbucket',
  configured: true,
  reason: ''
}

let root: Root | null = null
let container: HTMLDivElement | null = null
/** Every close the dialog asks for, in order — this is what a stray close shows up in. */
let closeRequests: boolean[] = []
/** Mirrors the host: the flow lives while this is true. */
let hostOpen = true

async function render(): Promise<void> {
  await act(async () => {
    root?.render(
      <TooltipProvider>
        <AddSiteFromGitDialog
          open={hostOpen}
          destinationRoot="/tmp/muster-fixture/Sites"
          onOpenChange={(next) => {
            closeRequests.push(next)
            hostOpen = next
          }}
          onAdded={() => {}}
        />
      </TooltipProvider>
    )
  })
}

function minimizeButton(): HTMLButtonElement | null {
  return document.body.querySelector<HTMLButtonElement>('[aria-label*="keep this running"]')
}

function dialogState(): string | null {
  return (
    document.body.querySelector('[data-slot="dialog-content"]')?.getAttribute('data-state') ?? null
  )
}

beforeEach(() => {
  Reflect.set(globalThis.window, 'api', {
    siteCloneSources: {
      providers: vi.fn().mockResolvedValue({ ok: true, value: [BITBUCKET] }),
      repos: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          provider: 'bitbucket',
          repos: [],
          error: '',
          truncated: false,
          searchesRemotely: true
        }
      })
    },
    repos: { onCloneProgress: () => () => {}, onCloneLog: () => () => {} },
    shell: { pickDirectory: vi.fn() },
    sites: { create: vi.fn() }
  })
  closeRequests = []
  hostOpen = true
  useAppStore.setState({ minimizedSiteSetupFlows: {} })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  useAppStore.setState({ minimizedSiteSetupFlows: {} })
})

describe('AddSiteFromGitDialog minimize', () => {
  it('records the flow and closes the dialog without ending it', async () => {
    await render()
    await act(async () => {
      minimizeButton()?.click()
    })

    expect(Object.keys(useAppStore.getState().minimizedSiteSetupFlows)).toEqual(['new-site'])
    expect(dialogState()).toBe('closed')
    // The whole point: minimizing is not closing. A close request here would end the flow.
    expect(closeRequests).toEqual([])
    expect(hostOpen).toBe(true)
  })

  it('reopens the same dialog when the flow is restored, and never asks to close', async () => {
    await render()
    await act(async () => {
      minimizeButton()?.click()
    })

    // What the status-bar chip does: drop the entry, which is what un-hides the dialog.
    await act(async () => {
      useAppStore.getState().clearSiteSetupFlow('new-site')
    })
    await render()

    expect(dialogState()).toBe('open')
    // The bug this guards: a close request arriving after `minimized` flipped back to false was
    // no longer blocked, so restoring destroyed the flow instead of showing it.
    expect(closeRequests).toEqual([])
    expect(hostOpen).toBe(true)
  })

  it('still lets a real close end the flow', async () => {
    await render()
    const close = document.body.querySelector<HTMLButtonElement>('[data-slot="dialog-close"]')
    expect(close).not.toBeNull()
    await act(async () => {
      close?.click()
    })

    // Minimize must not have made the dialog impossible to actually dismiss.
    expect(closeRequests).toEqual([false])
    expect(hostOpen).toBe(false)
  })
})
