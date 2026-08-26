import type { StateCreator } from 'zustand'
import type {
  OcsitesImportApplyResult,
  SiteRepoLinkResult,
  SiteSidebarSyncResult,
  Site,
  SiteEnvironment,
  SiteSecretKind,
  SiteSummary
} from '../../../../shared/site-types'
import type { AppState } from '../types'

type SiteFieldPatch = Partial<
  Pick<
    Site,
    | 'displayName'
    | 'localWpRoot'
    | 'localDomain'
    | 'localStack'
    | 'dbUser'
    | 'dbSocket'
    | 'dbPort'
    | 'phpVersion'
    | 'activeEnvironment'
    | 'notes'
    | 'searchReplaceTimeoutSeconds'
  >
>

export type SitesSlice = {
  sites: SiteSummary[]
  sitesLoading: boolean
  sitesError: string | null
  selectedSiteId: string | null
  siteQuery: string
  fetchSites: () => Promise<void>
  /** Replaces one summary in place — a targeted write for cheap edits that already have the fresh
   *  summary in hand, sparing the full list rebuild (one git spawn per site). */
  applySiteSummary: (summary: SiteSummary) => void
  selectSite: (siteId: string | null) => void
  setSiteQuery: (query: string) => void
  updateSite: (siteId: string, patch: SiteFieldPatch) => Promise<string | null>
  removeSite: (siteId: string) => Promise<string | null>
  setSiteSecret: (
    siteId: string,
    environment: string,
    kind: SiteSecretKind,
    value: string
  ) => Promise<string | null>
  upsertSiteEnvironment: (
    siteId: string,
    name: string,
    patch?: Partial<SiteEnvironment>
  ) => Promise<string | null>
  copySiteEnvironment: (siteId: string, from: string, to: string) => Promise<string | null>
  renameSiteEnvironment: (siteId: string, from: string, to: string) => Promise<string | null>
  removeSiteEnvironment: (siteId: string, name: string) => Promise<string | null>
  importSitesFromOcsites: () => Promise<
    (OcsitesImportApplyResult & { found: boolean; repos: SiteRepoLinkResult }) | { error: string }
  >
  linkSiteRepos: () => Promise<SiteRepoLinkResult | { error: string }>
  /** Adopts every discovered folder and links the lot; also the refresh path for the auto-add push. */
  addDiscoveredSitesToSidebar: () => Promise<SiteSidebarSyncResult | { error: string }>
}

/** Replaces one summary in place so the list does not reorder while the user is editing it. */
function replaceSummary(sites: SiteSummary[], next: SiteSummary): SiteSummary[] {
  const index = sites.findIndex((entry) => entry.site.id === next.site.id)
  return index === -1 ? [...sites, next] : sites.map((entry, i) => (i === index ? next : entry))
}

export const createSitesSlice: StateCreator<AppState, [], [], SitesSlice> = (set, get) => {
  // Every mutation returns the refreshed summary, so one helper covers all of them.
  const applyMutation = async (
    run: () => Promise<{ ok: true; value: SiteSummary } | { ok: false; error: string }>
  ): Promise<string | null> => {
    const result = await run()
    if (!result.ok) {
      set({ sitesError: result.error })
      return result.error
    }
    set({ sites: replaceSummary(get().sites, result.value), sitesError: null })
    return null
  }

  return {
    sites: [],
    sitesLoading: false,
    sitesError: null,
    selectedSiteId: null,
    siteQuery: '',

    fetchSites: async () => {
      set({ sitesLoading: true })
      const result = await window.api.sites.list()
      if (!result.ok) {
        set({ sitesLoading: false, sitesError: result.error })
        return
      }
      const selected = get().selectedSiteId
      set({
        sites: result.value,
        sitesLoading: false,
        sitesError: null,
        selectedSiteId:
          selected && result.value.some((entry) => entry.site.id === selected) ? selected : null
      })
    },

    applySiteSummary: (summary) =>
      set({
        sites: get().sites.map((entry) => (entry.site.id === summary.site.id ? summary : entry))
      }),

    selectSite: (siteId) => set({ selectedSiteId: siteId }),
    setSiteQuery: (query) => set({ siteQuery: query }),

    updateSite: (siteId, patch) => applyMutation(() => window.api.sites.update({ siteId, patch })),

    removeSite: async (siteId) => {
      const result = await window.api.sites.remove(siteId)
      if (!result.ok) {
        set({ sitesError: result.error })
        return result.error
      }
      set((state) => ({
        sites: state.sites.filter((entry) => entry.site.id !== siteId),
        selectedSiteId: state.selectedSiteId === siteId ? null : state.selectedSiteId,
        sitesError: null
      }))
      return null
    },

    setSiteSecret: async (siteId, environment, kind, value) => {
      const result = await window.api.sites.setSecret({ siteId, environment, kind, value })
      if (!result.ok) {
        set({ sitesError: result.error })
        return result.error
      }
      // Presence flags live on the summary, so refetch this one site to reflect the change.
      const refreshed = await window.api.sites.get(siteId)
      if (refreshed.ok) {
        set({ sites: replaceSummary(get().sites, refreshed.value), sitesError: null })
      }
      return null
    },

    upsertSiteEnvironment: (siteId, name, patch) =>
      applyMutation(() => window.api.sites.upsertEnvironment({ siteId, name, patch })),

    copySiteEnvironment: (siteId, from, to) =>
      applyMutation(() => window.api.sites.copyEnvironment({ siteId, from, to })),

    renameSiteEnvironment: (siteId, from, to) =>
      applyMutation(() => window.api.sites.renameEnvironment({ siteId, from, to })),

    removeSiteEnvironment: (siteId, name) =>
      applyMutation(() => window.api.sites.removeEnvironment({ siteId, name })),

    importSitesFromOcsites: async () => {
      const result = await window.api.sites.importFromOcsites()
      if (!result.ok) {
        set({ sitesError: result.error })
        return { error: result.error }
      }
      await get().fetchSites()
      // Newly added projects only reach the sidebar once the repo list refetches.
      await get().fetchRepos()
      return result.value
    },

    linkSiteRepos: async () => {
      const result = await window.api.sites.linkRepos()
      if (!result.ok) {
        set({ sitesError: result.error })
        return { error: result.error }
      }
      await get().fetchSites()
      await get().fetchRepos()
      return result.value
    },

    addDiscoveredSitesToSidebar: async () => {
      const result = await window.api.sites.addDiscoveredToSidebar()
      if (!result.ok) {
        set({ sitesError: result.error })
        return { error: result.error }
      }
      await get().fetchSites()
      // Newly adopted folders only reach the sidebar once the repo list refetches.
      await get().fetchRepos()
      return result.value
    }
  }
}
