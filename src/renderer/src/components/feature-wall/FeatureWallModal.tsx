import type { JSX } from 'react'
import { useModalData } from '@/hooks/use-modal-data'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { useAppStore } from '@/store'
import { FeatureWallTourSurface } from './FeatureWallTourSurface'
import { translate } from '@/i18n/i18n'

export default function FeatureWallModal(): JSX.Element | null {
  const modalData = useModalData('feature-wall')
  const closeModal = useAppStore((s) => s.closeModal)
  const isOpen = modalData !== null
  const source = modalData?.source ?? 'unknown'

  const handleOpenChange = (open: boolean): void => {
    if (!open) {
      closeModal()
    }
  }

  if (!isOpen) {
    return null
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        className="grid h-[min(780px,calc(100vh-2rem))] w-[min(1240px,calc(100vw-2rem))] max-w-none grid-rows-[auto_minmax(0,1fr)] gap-0 p-0 sm:max-w-none"
        tabIndex={-1}
      >
        <DialogHeader className="gap-1 border-b border-border px-7 py-4">
          <DialogTitle className="text-lg">
            {translate(
              'auto.components.feature.wall.FeatureWallModal.3567e147c8',
              'Get to know Muster'
            )}
          </DialogTitle>
          {/* Why: Radix requires a description for the dialog to be a11y-compliant,
              but we don't want it visible - the rail and step copy already orient users. */}
          <DialogDescription className="sr-only">
            {translate(
              'auto.components.feature.wall.FeatureWallModal.33dca8bbbe',
              'A short, workflow-by-workflow tour of Muster.'
            )}
          </DialogDescription>
        </DialogHeader>

        <FeatureWallTourSurface isOpen={isOpen} source={source} onDone={closeModal} />
      </DialogContent>
    </Dialog>
  )
}
