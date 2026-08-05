// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RepositoryIconTabs } from './RepositoryIconTabs'

const apiMocks = {
  fetchFavicon: vi.fn()
}

// Why: the tabs component reads window.api.repos.fetchFavicon; keep happy-dom's
// window intact (radix tabs listen on it) and only graft the preload surface.
Object.assign(window, { api: { repos: apiMocks } })

let container: HTMLDivElement
let root: Root

function renderFaviconTab(onSetIcon: (icon: unknown) => void, defaultFaviconDomain: string): void {
  act(() => {
    root.render(
      <RepositoryIconTabs
        initialTab="favicon"
        selectedLucideName={null}
        selectedEmoji=""
        loadingGitHub={false}
        defaultFaviconDomain={defaultFaviconDomain}
        onSetIcon={onSetIcon}
        onUseGitHubAvatar={() => {}}
      />
    )
  })
}

function findButton(label: string): HTMLButtonElement {
  const button = [...container.querySelectorAll('button')].find(
    (candidate) => candidate.textContent === label
  )
  if (!button) {
    throw new Error(`No "${label}" button rendered`)
  }
  return button
}

async function flushEffects(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('RepositoryIconTabs favicon tab', () => {
  beforeEach(() => {
    apiMocks.fetchFavicon.mockReset()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    document.body.replaceChildren()
  })

  it("prefills the domain input with the matched Site's live domain", () => {
    renderFaviconTab(vi.fn(), 'acme.local')
    const input = container.querySelector<HTMLInputElement>('input[aria-label="Website domain"]')
    expect(input?.value).toBe('acme.local')
  })

  it('leaves the input empty and disables Fetch when no Site matches', () => {
    renderFaviconTab(vi.fn(), '')
    const input = container.querySelector<HTMLInputElement>('input[aria-label="Website domain"]')
    expect(input?.value).toBe('')
    expect(findButton('Fetch').disabled).toBe(true)
  })

  it('fetches, previews, and applies the favicon through the repo icon path', async () => {
    const dataUrl = 'data:image/png;base64,AAAA'
    apiMocks.fetchFavicon.mockResolvedValueOnce({ ok: true, dataUrl })
    const onSetIcon = vi.fn()
    renderFaviconTab(onSetIcon, 'acme.local')

    act(() => findButton('Fetch').click())
    await flushEffects()

    expect(apiMocks.fetchFavicon).toHaveBeenCalledWith({ domain: 'acme.local' })
    expect(container.querySelector(`img[src="${dataUrl}"]`)).not.toBeNull()

    act(() => findButton('Apply').click())
    expect(onSetIcon).toHaveBeenCalledWith({
      type: 'image',
      src: dataUrl,
      source: 'favicon',
      label: 'acme.local'
    })
  })

  it('shows the fetch error verbatim without applying anything', async () => {
    apiMocks.fetchFavicon.mockResolvedValueOnce({
      ok: false,
      error: 'Favicon is larger than 256KB.'
    })
    const onSetIcon = vi.fn()
    renderFaviconTab(onSetIcon, 'acme.local')

    act(() => findButton('Fetch').click())
    await flushEffects()

    expect(container.textContent).toContain('Favicon is larger than 256KB.')
    expect(container.querySelector('img')).toBeNull()
    expect(onSetIcon).not.toHaveBeenCalled()
  })
})
