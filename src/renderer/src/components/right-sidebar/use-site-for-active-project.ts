import { useEffect, useMemo, useRef } from 'react'
import { useAppStore } from '@/store'
import type { SiteSummary } from '../../../../shared/site-types'
import { findSiteForProject } from './site-for-project'

const NO_SITES: SiteSummary[] = []

/**
 * Resolves the active workspace's project to its Site record. Pure store read — refreshing the
 * list is owned by useSiteListRefreshOnProjectChange so a second consumer (the panel) does not
 * double the IPC on every workspace switch.
 */
export function useSiteForActiveProject(projectPath: string | null): SiteSummary | null {
  const sites = useAppStore((s) => s.sites ?? NO_SITES)
  return useMemo(() => findSiteForProject(sites, projectPath), [sites, projectPath])
}

/**
 * Refetches site summaries whenever the active project changes, so the Site tab appears or
 * disappears with current data. Mounted once, in the right sidebar shell. Run-settlement
 * refreshes are the panel's own concern (it also reloads its run history).
 */
export function useSiteListRefreshOnProjectChange(projectPath: string | null): void {
  const fetchSites = useAppStore((s) => s.fetchSites)
  const fetchSitesRef = useRef(fetchSites)
  fetchSitesRef.current = fetchSites

  useEffect(() => {
    if (!projectPath) {
      return
    }
    void fetchSitesRef.current()
  }, [projectPath])
}
