import { ArrowUpRight } from 'lucide-react'
import type React from 'react'
import type { SiteSummary } from '../../../../shared/site-types'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { SiteDetailPanel } from '../sites/SiteDetailPanel'

/** The Sites page's detail pane in a modal, so a site can be edited without leaving the session. */
export function SiteEditDialog({
  summary,
  open,
  onOpenChange,
  onOpenInSites
}: {
  summary: SiteSummary
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpenInSites: () => void
}): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
      >
        {/* SiteDetailPanel draws the visible heading. */}
        <DialogTitle className="sr-only">{summary.site.displayName}</DialogTitle>
        <SiteDetailPanel summary={summary} />
        <footer className="flex justify-end border-t border-border px-5 py-3">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              onOpenChange(false)
              onOpenInSites()
            }}
          >
            <ArrowUpRight className="size-3.5" />
            {translate('auto.components.right.sidebar.SitePanel.openInSites', 'Open in Sites')}
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  )
}
