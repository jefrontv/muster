import { describe, expect, it, vi } from 'vitest'
import { openSiteInSitesPage } from './site-panel-open-in-sites'

describe('openSiteInSitesPage', () => {
  it('selects the site, opens the page, and collapses the right sidebar', () => {
    const selectSite = vi.fn()
    const openSitesPage = vi.fn()
    const setRightSidebarOpen = vi.fn()

    openSiteInSitesPage({ siteId: 'site-1', selectSite, openSitesPage, setRightSidebarOpen })

    expect(selectSite).toHaveBeenCalledWith('site-1')
    expect(openSitesPage).toHaveBeenCalledTimes(1)
    // Why asserted explicitly: the panel and the page would otherwise show the same site side by side.
    expect(setRightSidebarOpen).toHaveBeenCalledWith(false)
  })
})
