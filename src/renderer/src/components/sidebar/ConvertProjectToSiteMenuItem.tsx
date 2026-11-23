// Manual escape hatch for any project the site detection misses.
import type { ReactElement } from 'react'
import { Globe } from 'lucide-react'
import { toast } from 'sonner'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { getRepoExecutionHostId, LOCAL_EXECUTION_HOST_ID } from '../../../../shared/execution-host'
import type { Repo } from '../../../../shared/types'
import { findSiteForProject, siteFolderForProjectPath } from '../right-sidebar/site-for-project'

type Props = {
  repo:
    | Pick<Repo, 'id' | 'path' | 'displayName' | 'connectionId' | 'executionHostId'>
    | null
    | undefined
  disabled?: boolean
}

export function canConvertProjectToSite(repo: Props['repo']): repo is NonNullable<Props['repo']> {
  // Site records and their tooling live on this machine only.
  return repo != null && getRepoExecutionHostId(repo) === LOCAL_EXECUTION_HOST_ID
}

export async function convertProjectToSite(repo: NonNullable<Props['repo']>): Promise<boolean> {
  const result = await window.api.sites.create({
    path: siteFolderForProjectPath(repo.path),
    displayName: repo.displayName,
    repoId: repo.id
  })
  if (!result.ok) {
    toast.error(
      translate('auto.components.sidebar.ConvertProjectToSite.failed', 'Could not convert to site'),
      { description: result.error }
    )
    return false
  }
  await useAppStore.getState().fetchSites()
  toast.success(
    translate('auto.components.sidebar.ConvertProjectToSite.done', 'Converted to site'),
    {
      description: repo.displayName
    }
  )
  return true
}

export function ConvertProjectToSiteMenuItem({ repo, disabled }: Props): ReactElement | null {
  const hasSite = useAppStore(
    (state) => repo != null && findSiteForProject(state.sites ?? [], repo.path) !== null
  )
  if (!canConvertProjectToSite(repo) || hasSite) {
    return null
  }
  return (
    <DropdownMenuItem disabled={disabled} onSelect={() => void convertProjectToSite(repo)}>
      <Globe className="size-3.5" />
      {translate('auto.components.sidebar.ConvertProjectToSite.label', 'Convert to site')}
    </DropdownMenuItem>
  )
}
