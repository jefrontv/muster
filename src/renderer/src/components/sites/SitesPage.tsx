import { Globe, Search } from 'lucide-react'
import type React from 'react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { SECTION_LABEL } from '@/components/ui/section-label-classes'
import { useMeasuredWidth } from '../right-sidebar/right-sidebar-measured-width'
import { filterSites, sitesOnDisk } from './site-filtering'
import { DiscoveredSiteRow } from './DiscoveredSiteRow'
import { SiteDetailPanel } from './SiteDetailPanel'
import { SiteRootsDialog } from './SiteRootsDialog'
import { SitesEmptyState } from './SitesEmptyState'
import { SitesPageHeader } from './SitesPageHeader'
import { SiteRow } from './SiteRow'
import { useContextualTour } from '@/components/contextual-tours/use-contextual-tour'
import type { DiscoveredSiteCandidate } from '../../../../shared/site-discovery-types'

// Below this page width the list and detail no longer fit side by side, so the page shows one at a time.
const SITES_SPLIT_MIN_WIDTH = 640

export default function SitesPage(): React.JSX.Element {
  const closeSitesPage = useAppStore((state) => state.closeSitesPage)
  const sites = useAppStore((state) => state.sites)
  const sitesLoading = useAppStore((state) => state.sitesLoading)
  const sitesError = useAppStore((state) => state.sitesError)
  const selectedSiteId = useAppStore((state) => state.selectedSiteId)
  const query = useAppStore((state) => state.siteQuery)
  const fetchSites = useAppStore((state) => state.fetchSites)
  const selectSite = useAppStore((state) => state.selectSite)
  const setNewSiteDialogOpen = useAppStore((state) => state.setNewSiteDialogOpen)
  const setSiteQuery = useAppStore((state) => state.setSiteQuery)
  const importSitesFromOcsites = useAppStore((state) => state.importSitesFromOcsites)
  const addDiscoveredSitesToSidebar = useAppStore((state) => state.addDiscoveredSitesToSidebar)
  const updateSettings = useAppStore((state) => state.updateSettings)
  const autoAddDiscovered = useAppStore((state) => state.settings?.sitesAutoAddDiscovered === true)
  const [importing, setImporting] = useState(false)

  const [discovered, setDiscovered] = useState<DiscoveredSiteCandidate[]>([])
  const [roots, setRoots] = useState<string[]>([])
  // Where a new clone lands. Separate from `roots`, whose order is the scan order, not a ranking.
  const [adopting, setAdopting] = useState('')
  const [rootsDialogOpen, setRootsDialogOpen] = useState(false)
  const [pageWidth, setPageWidth] = useState<number | null>(null)
  const pageRef = useMeasuredWidth(setPageWidth)
  const narrow = pageWidth !== null && pageWidth < SITES_SPLIT_MIN_WIDTH
  useContextualTour('sites', true)

  useEffect(() => {
    void fetchSites()
  }, [fetchSites])

  // Why re-run on the watcher event rather than only on mount: this list is the whole point of the
  // live view — a folder created in Finder while the page is open has to appear without a reload.
  useEffect(() => {
    let disposed = false
    const load = async (): Promise<void> => {
      const result = await window.api.siteRoots?.discover()
      if (!disposed && result?.ok) {
        setDiscovered(result.value.candidates)
        // The same call already reports the roots, so the rows can shorten their paths without a
        // second round trip.
        setRoots(result.value.roots)
      }
    }
    void load()
    const unsubscribe = window.api.siteRoots?.onChanged(() => void load())
    return () => {
      disposed = true
      unsubscribe?.()
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') {
        return
      }
      const target = event.target as HTMLElement | null
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) {
        return
      }
      event.preventDefault()
      goBack()
    }
    window.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true })
  })

  // A site whose folder is gone can't be opened, imported, or deployed, so it never reaches the list.
  const availableSites = useMemo(() => sitesOnDisk(sites), [sites])
  const offDiskCount = sites.length - availableSites.length
  const visibleSites = useMemo(() => filterSites(availableSites, query), [availableSites, query])
  const selected = availableSites.find((entry) => entry.site.id === selectedSiteId) ?? null
  // Narrow pages show the list or one site; back from a site returns to the list, not out of Sites.
  const showingDetail = narrow && selected !== null
  const goBack = (): void => (showingDetail ? selectSite(null) : closeSitesPage())
  const backLabel = showingDetail
    ? translate('auto.components.sites.SitesPage.backToList', 'All sites')
    : translate('auto.components.sites.SitesPage.back', 'Back')

  // Main already excludes anything with a Site record, so this only has to survive the race where
  // a site was adopted but the discovery result predates the refetch.
  const configuredPaths = useMemo(() => new Set(sites.map((entry) => entry.site.path)), [sites])
  const visibleDiscovered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return discovered.filter(
      (candidate) =>
        !configuredPaths.has(candidate.path) &&
        (needle.length === 0 ||
          candidate.displayName.toLowerCase().includes(needle) ||
          candidate.path.toLowerCase().includes(needle))
    )
  }, [discovered, configuredPaths, query])

  const adopt = async (candidate: DiscoveredSiteCandidate): Promise<void> => {
    setAdopting(candidate.path)
    try {
      const result = await window.api.sites.create({
        path: candidate.path,
        displayName: candidate.displayName
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      await fetchSites()
      selectSite(result.value.site.id)
    } finally {
      setAdopting('')
    }
  }

  // Adopts every discovered folder and links the lot. Previously this only linked sites that
  // already had records, so a discovered folder had to be clicked first — which is exactly the
  // step the user should not need.
  const runAddToSidebar = async (): Promise<void> => {
    setImporting(true)
    try {
      const result = await addDiscoveredSitesToSidebar()
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      // Sites already bound to a live repo are skipped before counting, so a fully synced machine
      // reports 0/0. Saying "0 added, 0 already present" there reads like a failure; say nothing
      // needed doing instead.
      if (result.adopted === 0 && result.added === 0 && result.linked === 0) {
        toast.success(
          translate(
            'auto.components.sites.SitesPage.sidebarUpToDate',
            'Already up to date. Every site folder is in the sidebar.'
          )
        )
        return
      }
      toast.success(
        translate(
          'auto.components.sites.SitesPage.linkedProjects',
          '{{added}} added, {{linked}} already present.',
          { added: result.added, linked: result.linked }
        )
      )
    } finally {
      setImporting(false)
    }
  }

  // Turning it on runs one pass immediately: the watcher only fires on a folder CHANGE, so without
  // this the setting would appear to do nothing until the next time something on disk moved.
  const handleAutoAddChange = async (next: boolean): Promise<void> => {
    await updateSettings({ sitesAutoAddDiscovered: next })
    if (next) {
      await runAddToSidebar()
    }
  }

  const runImport = async (): Promise<void> => {
    setImporting(true)
    try {
      const result = await importSitesFromOcsites()
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      if (!result.found) {
        toast.info(
          translate(
            'auto.components.sites.SitesPage.importNotFound',
            'No ocsites configuration found at ~/.config/ocsites.'
          )
        )
        return
      }
      toast.success(
        translate(
          'auto.components.sites.SitesPage.importDone',
          'Imported {{created}} new and updated {{updated}} sites, {{secrets}} passwords migrated.',
          {
            created: result.created,
            updated: result.updated,
            secrets: result.secretsStored
          }
        )
      )
      if (result.repos.added > 0) {
        toast.success(
          translate(
            'auto.components.sites.SitesPage.projectsAdded',
            '{{count}} projects added to the sidebar.',
            { count: result.repos.added }
          )
        )
      }
      if (result.secretsFailed.length > 0) {
        toast.warning(
          translate(
            'auto.components.sites.SitesPage.importSecretFailures',
            '{{count}} passwords could not be migrated.',
            { count: result.secretsFailed.length }
          )
        )
      }
    } finally {
      setImporting(false)
    }
  }

  return (
    // border-l: the sidebar and this page share a background, so without it the site list reads as
    // a third sidebar column rather than the start of the page.
    <main
      ref={pageRef}
      className="flex min-h-0 flex-1 flex-col border-l border-border bg-background"
    >
      <SitesPageHeader
        narrow={narrow}
        backLabel={backLabel}
        onBack={goBack}
        count={availableSites.length}
        importing={importing}
        autoAdd={autoAddDiscovered}
        onAddToSidebar={() => void runAddToSidebar()}
        onAutoAddChange={(next) => void handleAutoAddChange(next)}
        onNewSite={() => setNewSiteDialogOpen(true)}
        onChooseFolders={() => setRootsDialogOpen(true)}
        onImport={() => void runImport()}
      />

      <SiteRootsDialog
        open={rootsDialogOpen}
        onOpenChange={setRootsDialogOpen}
        effectiveRoots={roots}
      />

      {sitesError ? (
        <p className="shrink-0 border-b border-border bg-destructive/10 px-5 py-2 text-xs text-destructive">
          {sitesError}
        </p>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <aside
          className={cn(
            'flex flex-col',
            narrow
              ? cn('min-w-0 flex-1', showingDetail && 'hidden')
              : 'w-[clamp(15rem,30%,20rem)] shrink-0 border-r border-border'
          )}
          data-contextual-tour-target="sites-list"
        >
          <div className="shrink-0 p-3">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                className="pl-7"
                placeholder={translate('auto.components.sites.SitesPage.search', 'Search sites')}
                onChange={(event) => setSiteQuery(event.target.value)}
              />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-sleek px-2 pb-3">
            {sitesLoading && sites.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                {translate('auto.components.sites.SitesPage.loading', 'Loading sites…')}
              </p>
            ) : null}
            {!sitesLoading && availableSites.length === 0 ? (
              offDiskCount > 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">
                  {translate(
                    'auto.components.sites.SitesPage.allMissing',
                    'All {{count}} configured sites are missing their folder. Reconnect the drive and refresh.',
                    { count: offDiskCount }
                  )}
                </p>
              ) : (
                <SitesEmptyState
                  importing={importing}
                  onNewSite={() => setNewSiteDialogOpen(true)}
                  onChooseFolders={() => setRootsDialogOpen(true)}
                  onImport={() => void runImport()}
                />
              )
            ) : null}
            {visibleSites.map((summary) => (
              <SiteRow
                key={summary.site.id}
                summary={summary}
                selected={summary.site.id === selectedSiteId}
                roots={roots}
                onSelect={selectSite}
              />
            ))}
            {visibleDiscovered.length > 0 ? (
              <>
                <p className={cn('px-3 pb-1 pt-3', SECTION_LABEL)}>
                  {translate(
                    'auto.components.sites.SitesPage.discoveredHeading',
                    'Found on disk ({{count}})',
                    { count: visibleDiscovered.length }
                  )}
                </p>
                {visibleDiscovered.map((candidate) => (
                  <DiscoveredSiteRow
                    key={candidate.path}
                    candidate={candidate}
                    roots={roots}
                    onConfigure={(entry) => {
                      if (adopting.length === 0) {
                        void adopt(entry)
                      }
                    }}
                  />
                ))}
              </>
            ) : null}
          </div>
        </aside>

        {selected ? (
          <SiteDetailPanel summary={selected} />
        ) : narrow ? null : (
          <div className="flex min-h-0 flex-1 items-center justify-center p-8">
            <div className="flex flex-col items-center gap-1.5 text-center">
              <Globe className="mb-1 size-7 text-muted-foreground/50" strokeWidth={1.5} />
              <p className="text-sm font-medium">
                {translate('auto.components.sites.SitesPage.selectPrompt', 'Select a site')}
              </p>
              <p className="max-w-60 text-xs text-muted-foreground">
                {translate(
                  'auto.components.sites.SitesPage.selectPromptHint',
                  'Choose a site from the list to edit its local setup and environments.'
                )}
              </p>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
