// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RepoIcon } from '../../../../shared/repo-icon'
import { RepositoryIconTabs } from './RepositoryIconTabs'

const apiMocks = { fetchFavicon: vi.fn() }
Object.assign(window, { api: { repos: apiMocks } })

const FAVICON: RepoIcon = {
  type: 'image',
  src: 'data:image/png;base64,AAAA',
  source: 'favicon',
  label: 'acme.local'
}

let container: HTMLDivElement
let root: Root

function render(currentIcon: RepoIcon | null, onSetIcon: (icon: RepoIcon | null) => void): void {
  act(() => {
    root.render(
      <RepositoryIconTabs
        initialTab="favicon"
        selectedLucideName={null}
        selectedEmoji=""
        currentIcon={currentIcon}
        loadingGitHub={false}
        defaultFaviconDomain="acme.local"
        onSetIcon={onSetIcon}
        onUseGitHubAvatar={() => {}}
      />
    )
  })
}

function swatch(label: string): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  if (!button) {
    throw new Error(`No "${label}" control rendered`)
  }
  return button
}

describe('RepositoryIconTabs icon recolour', () => {
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

  it('offers no recolour row until an image icon exists to recolour', () => {
    render(null, vi.fn())
    expect(container.querySelector('button[aria-label="Recolor the icon #ef4444"]')).toBeNull()
  })

  it('recolours the current icon without disturbing its artwork', () => {
    const onSetIcon = vi.fn()
    render(FAVICON, onSetIcon)

    act(() => swatch('Recolor the icon #ef4444').click())

    expect(onSetIcon).toHaveBeenCalledWith({ ...FAVICON, tint: '#ef4444' })
  })

  it('drops the tint entirely when None is chosen, rather than storing a colour', () => {
    const onSetIcon = vi.fn()
    render({ ...FAVICON, tint: '#ef4444' }, onSetIcon)

    act(() => swatch('Keep the original icon colors').click())

    expect(onSetIcon).toHaveBeenCalledWith(FAVICON)
    expect(onSetIcon.mock.calls[0]?.[0]).not.toHaveProperty('tint')
  })

  it('marks None as the selection for an untinted icon', () => {
    render(FAVICON, vi.fn())
    expect(swatch('Keep the original icon colors').getAttribute('aria-pressed')).toBe('true')
    expect(swatch('Recolor the icon #ef4444').getAttribute('aria-pressed')).toBe('false')
  })

  it('keeps the chosen recolour when a new favicon replaces the artwork', async () => {
    const dataUrl = 'data:image/png;base64,BBBB'
    apiMocks.fetchFavicon.mockResolvedValueOnce({ ok: true, dataUrl })
    const onSetIcon = vi.fn()
    render({ ...FAVICON, tint: '#22c55e' }, onSetIcon)

    const fetchButton = [...container.querySelectorAll('button')].find(
      (b) => b.textContent === 'Fetch'
    )
    act(() => fetchButton?.click())
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    const apply = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Apply')
    act(() => apply?.click())

    expect(onSetIcon).toHaveBeenCalledWith({
      type: 'image',
      src: dataUrl,
      source: 'favicon',
      label: 'acme.local',
      tint: '#22c55e'
    })
  })
})
