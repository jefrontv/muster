// Header menu for copying a project's pages out to markdown files, or bringing a folder in.
import { Download, MoreHorizontal, Upload, Workflow } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'

type Props = { scopeKey: string; projectName: string }

function pageCount(count: number): string {
  return count === 1 ? '1 page' : `${count} pages`
}

export function ProjectPagesTransferMenu({ scopeKey, projectName }: Props): React.JSX.Element {
  const [busy, setBusy] = useState(false)

  const run = async (kind: 'export' | 'import' | 'importFiles'): Promise<void> => {
    setBusy(true)
    try {
      const api = window.api.projectPages
      const result =
        kind === 'export'
          ? await api.exportToFolder(scopeKey, projectName)
          : kind === 'import'
            ? await api.importFromFolder(scopeKey)
            : await api.importFiles(scopeKey)
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      const done = result.value
      if (!done) {
        return
      }
      if (kind !== 'export') {
        const skipped = done.skipped ?? []
        if (skipped.length > 0) {
          toast.warning(`Imported ${pageCount(done.count)}, skipped ${skipped.length}`, {
            description: skipped.slice(0, 3).join('\n')
          })
        } else {
          toast.success(`Imported ${pageCount(done.count)}`)
        }
        return
      }
      toast.success(`Exported ${pageCount(done.count)}`, {
        action: {
          label: translate('auto.components.projectPages.transfer.show', 'Show folder'),
          onClick: () => void window.api.shell.openInFileManager(done.path)
        }
      })
    } finally {
      setBusy(false)
    }
  }

  const label = translate('auto.components.projectPages.transfer.menu', 'More')
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="shrink-0 text-muted-foreground"
              aria-label={label}
              disabled={busy}
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>
          {label}
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => void run('export')}>
          <Download className="size-4" />
          {translate('auto.components.projectPages.transfer.export', 'Export to folder…')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void run('import')}>
          <Upload className="size-4" />
          {translate('auto.components.projectPages.transfer.import', 'Import folder…')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void run('importFiles')}>
          <Workflow className="size-4" />
          {translate('auto.components.projectPages.transfer.importFiles', 'Import diagram files…')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
