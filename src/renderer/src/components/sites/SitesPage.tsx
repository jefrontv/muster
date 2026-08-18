import {
  ArrowLeft,
  DownloadCloud,
  FolderCog,
  FolderPlus,
  GitBranchPlus,
  Globe,
  Search
} from 'lucide-react'
import type React from 'react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { filterSites, sitesOnDisk } from './site-filtering'
import { AddSiteFromGitDialog } from './AddSiteFromGitDialog'
import { DiscoveredSiteRow } from './DiscoveredSiteRow'
import { getSiteCloneSourceStrings } from './site-clone-source-strings'
import { SiteDetailPanel } from './SiteDetailPanel'
import { SiteRootsDialog } from './SiteRootsDialog'
import { SiteRow } from './SiteRow'
import { useContextualTour } from '@/components/contextual-tours/use-contextual-tour'
import type { DiscoveredSiteCandidate } from '../../../../shared/site-discovery-types'

export default function SitesPage(): React.JSX.Element {
  const closeSitesPage = useAppStore((state) => state.closeSitesPage)
  const sites = useAppStore((state) => state.sites)
  const sitesLoading = useAppStore((state) => state.sitesLoading)
  const sitesError = useAppStore((state) => state.sitesError)
  const selectedSiteId = useAppStore((state) => state.selectedSiteId)
  const query = useAppStore((state) => state.siteQuery)
  const fetchSites = useAppStore((state) => state.fetchSites)
  const selectSite = useAppStore((state) => state.selectSite)
  const setSiteQuery = useAppStore((state) => state.setSiteQuery)
  const importSitesFromOcsites = useAppStore((state) => state.importSitesFromOcsites)
  const linkSiteRepos = useAppStore((state) => state.linkSiteRepos)
  const [importing, setImporting] = useState(false)

  const [discovered, setDiscovered] = useState<DiscoveredSiteCandidate[]>([])
  const [roots, setRoots] = useState<string[]>([])
  // Where a new clone lands. Separate from `roots`, whose order is the scan order, not a ranking.
  const [primaryRoot, setPrimaryRoot] = useState('')
  const [adopting, setAdopting] = useState('')
  const [cloneDialogOpen, setCloneDialogOpen] = useState(false)
  const [rootsDialogOpen, setRootsDialogOpen] = useState(false)
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
        setPrimaryRoot(result.value.primaryRoot)
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
      closeSitesPage()
    }
    window.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true })
  }, [closeSitesPage])

  // A site whose folder is gone can't be opened, imported, or deployed, so it never reaches the list.
  const availableSites = useMemo(() => sitesOnDisk(sites), [sites])
  const offDiskCount = sites.length - availableSites.length
  const visibleSites = useMemo(() => filterSites(availableSites, query), [availableSites, query])
  const selected = availableSites.find((entry) => entry.site.id === selectedSiteId) ?? null

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

  const runLinkRepos = async (): Promise<void> => {
    setImporting(true)
    try {
      const result = await linkSiteRepos()
      if ('error' in result) {
        toast.error(result.error)
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
          { created: result.created, updated: result.updated, secrets: result.secretsStored }
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
    <main className="flex min-h-0 flex-1 flex-col border-l border-border bg-background">
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-3">
        <Button variant="outline" size="sm" onClick={closeSitesPage} className="shrink-0 gap-1.5">
          <ArrowLeft className="size-3.5" />
          {translate('auto.components.sites.SitesPage.back', 'Back')}
        </Button>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Globe className="size-4 shrink-0 text-muted-foreground" />
          <span className="text-sm font-medium">
            {translate('auto.components.sites.SitesPage.title', 'Sites')}
          </span>
          <span className="text-xs text-muted-foreground">
            {translate('auto.components.sites.SitesPage.count', '{{count}} configured', {
              count: availableSites.length
            })}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 gap-1.5"
          onClick={() => setRootsDialogOpen(true)}
        >
          <FolderCog className="size-3.5" />
          {translate('auto.components.sites.SitesPage.folders', 'Folders')}
        </Button>
        <Button size="sm" className="shrink-0 gap-1.5" onClick={() => setCloneDialogOpen(true)}>
          <GitBranchPlus className="size-3.5" />
          {getSiteCloneSourceStrings().trigger}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 gap-1.5"
          disabled={importing}
          onClick={() => void runLinkRepos()}
        >
          <FolderPlus className="size-3.5" />
          {translate('auto.components.sites.SitesPage.addToSidebar', 'Add to sidebar')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 gap-1.5"
          disabled={importing}
          onClick={() => void runImport()}
        >
          <DownloadCloud className="size-3.5" />
          {translate('auto.components.sites.SitesPage.import', 'Import from ocsites')}
        </Button>
      </header>

      <AddSiteFromGitDialog
        open={cloneDialogOpen}
        destinationRoot={primaryRoot}
        onOpenChange={setCloneDialogOpen}
        onAdded={(siteId) => {
          void fetchSites()
          selectSite(siteId)
        }}
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
          className="flex w-80 shrink-0 flex-col border-r border-border"
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
              <p className="px-3 py-2 text-xs text-muted-foreground">
                {offDiskCount > 0
                  ? translate(
                      'auto.components.sites.SitesPage.allMissing',
                      'All {{count}} configured sites are missing their folder. Reconnect the drive and refresh.',
                      { count: offDiskCount }
                    )
                  : translate(
                      'auto.components.sites.SitesPage.empty',
                      'No sites yet. Point Folders at the directory your sites live in, or import an existing ocsites configuration.'
                    )}
              </p>
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
                <p className="px-3 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
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
        ) : (
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
