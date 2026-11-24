// @vitest-environment happy-dom

import { act } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../../shared/constants'
import { ProjectPagesPane } from './ProjectPagesPane'

const store = vi.hoisted(() => ({
  state: {
    settingsSearchQuery: '',
    activeView: 'pages',
    openFiles: [
      { id: 'wt-1::project-pages', mode: 'project-pages' },
      { id: '/repo/a.ts', mode: 'edit' }
    ],
    closePagesPage: vi.fn(),
    closeFile: vi.fn()
  }
}))

vi.mock('@/store', () => {
  const useAppStore = (selector: (state: typeof store.state) => unknown) => selector(store.state)
  useAppStore.getState = () => store.state
  return { useAppStore }
})

vi.mock('./ProjectPagesAgentAccessSection', () => ({
  ProjectPagesAgentAccessSection: () => <div>Agent access</div>
}))

describe('ProjectPagesPane', () => {
  it('defaults Pages on, opening in a tab, with change dots', () => {
    const settings = getDefaultSettings('/tmp')
    expect(settings.experimentalProjectPages).toBe(true)
    expect(settings.projectPagesOpenIn).toBe('tab')
    expect(settings.projectPagesAgentChangeDots).toBe(true)

    const markup = renderToStaticMarkup(
      <ProjectPagesPane settings={settings} updateSettings={vi.fn()} />
    )
    expect(markup).toContain('Open pages in')
    expect(markup).toContain('Show when agents change a page')
    expect(markup).toContain('Agent access')
  })

  it('shows only the main switch while Pages is off', () => {
    const settings = { ...getDefaultSettings('/tmp'), experimentalProjectPages: false }
    const markup = renderToStaticMarkup(
      <ProjectPagesPane settings={settings} updateSettings={vi.fn()} />
    )
    expect(markup).toContain('aria-checked="false"')
    expect(markup).not.toContain('Open pages in')
    expect(markup).not.toContain('Agent access')
  })

  it('turning Pages off closes the Pages view and Pages tabs', async () => {
    const updateSettings = vi.fn()
    const container = document.createElement('div')
    const root = createRoot(container)
    await act(async () => {
      root.render(
        <ProjectPagesPane settings={getDefaultSettings('/tmp')} updateSettings={updateSettings} />
      )
    })
    const toggle = container.querySelector<HTMLButtonElement>(
      '#pages-enabled button[role="switch"]'
    )
    await act(async () => {
      toggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(updateSettings).toHaveBeenCalledWith({ experimentalProjectPages: false })
    expect(store.state.closePagesPage).toHaveBeenCalled()
    expect(store.state.closeFile).toHaveBeenCalledWith('wt-1::project-pages')
    expect(store.state.closeFile).not.toHaveBeenCalledWith('/repo/a.ts')
    root.unmount()
  })
})
