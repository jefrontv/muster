// The Sites list with nothing in it: every way to get a first site, as actions on screen. The old
// text pointed at a "Folders" control that lived in an overflow menu.

import { DownloadCloud, FolderCog, GitBranchPlus } from 'lucide-react'
import type React from 'react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'

export function SitesEmptyState({
  importing,
  onNewSite,
  onChooseFolders,
  onImport
}: {
  importing: boolean
  onNewSite: () => void
  onChooseFolders: () => void
  onImport: () => void
}): React.JSX.Element {
  const ocsitesDetected = useAppStore((state) => state.preflightStatus?.ocsites?.detected === true)
  return (
    <div className="space-y-2 px-3 py-2" data-testid="sites-empty-state">
      <p className="text-xs text-muted-foreground">
        {translate('auto.components.sites.SitesPage.emptyTitle', 'No sites yet.')}
      </p>
      <div className="flex flex-col items-stretch gap-1.5">
        <Button size="sm" className="justify-start gap-1.5" onClick={onNewSite}>
          <GitBranchPlus className="size-3.5" />
          {translate('auto.components.sites.SitesPage.emptyNewSite', 'New site from a repository')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="justify-start gap-1.5"
          onClick={onChooseFolders}
        >
          <FolderCog className="size-3.5" />
          {translate('auto.components.sites.SitesPage.emptyFolders', 'Choose site folders')}
        </Button>
        {ocsitesDetected ? (
          <Button
            variant="outline"
            size="sm"
            className="justify-start gap-1.5"
            disabled={importing}
            onClick={onImport}
          >
            <DownloadCloud className="size-3.5" />
            {translate('auto.components.sites.SitesPage.import', 'Import from ocsites')}
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        {translate(
          'auto.components.sites.SitesPage.emptyLink',
          'Or open a site link from Central.'
        )}
      </p>
    </div>
  )
}
