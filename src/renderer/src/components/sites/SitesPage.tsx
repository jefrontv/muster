import { ArrowLeft, DownloadCloud, FolderPlus, Globe, Search } from 'lucide-react'
import type React from 'react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { filterSites, sitesOnDisk } from './site-filtering'
import { SiteDetailPanel } from './SiteDetailPanel'
import { SiteRow } from './SiteRow'

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

  useEffect(() => {
    void fetchSites()
  }, [fetchSites])

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
    <main className="flex min-h-0 flex-1 flex-col bg-background">
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

      {sitesError ? (
        <p className="shrink-0 border-b border-border bg-destructive/10 px-5 py-2 text-xs text-destructive">
          {sitesError}
        </p>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-80 shrink-0 flex-col border-r border-border">
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
                      'No sites yet. Import an existing ocsites configuration to get started.'
                    )}
              </p>
            ) : null}
            {visibleSites.map((summary) => (
              <SiteRow
                key={summary.site.id}
                summary={summary}
                selected={summary.site.id === selectedSiteId}
                onSelect={selectSite}
              />
            ))}
          </div>
        </aside>

        {selected ? (
          <SiteDetailPanel summary={selected} />
        ) : (
          <div className="flex min-h-0 flex-1 items-center justify-center p-8">
            <p className="text-sm text-muted-foreground">
              {translate('auto.components.sites.SitesPage.selectPrompt', 'Select a site.')}
            </p>
          </div>
        )}
      </div>
    </main>
  )
}
