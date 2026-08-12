export type OpenSiteInSitesPageDeps = {
  siteId: string
  selectSite: (siteId: string) => void
  openSitesPage: () => void
  setRightSidebarOpen: (open: boolean) => void
}

/** Hands the site off to the full Sites page and closes the panel behind it —
 *  leaving it open would keep a duplicate of the same site squeezing that page. */
export function openSiteInSitesPage({
  siteId,
  selectSite,
  openSitesPage,
  setRightSidebarOpen
}: OpenSiteInSitesPageDeps): void {
  selectSite(siteId)
  openSitesPage()
  setRightSidebarOpen(false)
}
