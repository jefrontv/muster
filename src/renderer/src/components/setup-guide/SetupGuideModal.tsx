import { useCallback, useEffect, useMemo, useState, type JSX } from 'react'
import { EyeOff, School, Sparkles, X } from 'lucide-react'
import {
  getFirstIncompleteFeatureWallSetupStepId,
  getFeatureWallSetupSteps
} from '../../../../shared/feature-wall-setup-steps'
import type { FeatureWallSetupStepId } from '../../../../shared/feature-wall-setup-steps'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAppStore } from '@/store'
import { useModalData } from '@/hooks/use-modal-data'
import { showOnboardingFromRenderer } from '../onboarding/show-onboarding-event'
import { FeatureWallSetupChecklist } from '../feature-wall/FeatureWallSetupChecklist'
import { SetupGuideProgressRing } from './SetupGuideProgressRing'
import { useSetupGuideProgress } from './use-setup-guide-progress'
import { useSetupGuideOpenCloseTelemetry } from './use-setup-guide-telemetry'
import { translate } from '@/i18n/i18n'

export default function SetupGuideModal(): JSX.Element | null {
  const modalData = useModalData('setup-guide')
  const closeModal = useAppStore((s) => s.closeModal)
  const openModal = useAppStore((s) => s.openModal)
  const setSetupGuideSidebarDismissed = useAppStore((s) => s.setSetupGuideSidebarDismissed)
  const isOpen = modalData !== null
  const [userSelectedStep, setUserSelectedStep] = useState(false)
  const progress = useSetupGuideProgress(isOpen)
  const setupSteps = useMemo(() => getFeatureWallSetupSteps(progress.mode), [progress.mode])
  const [activeStepId, setActiveStepId] = useState<FeatureWallSetupStepId>(() =>
    getFirstIncompleteFeatureWallSetupStepId(progress.stepDone, progress.mode)
  )
  const requestedStepId = modalData?.setupStepId ?? null
  const telemetrySource = modalData?.telemetrySource ?? 'unknown'
  const activeStep = setupSteps.find((step) => step.id === activeStepId) ?? setupSteps[0] ?? null

  useSetupGuideOpenCloseTelemetry({
    isOpen,
    source: telemetrySource,
    progress,
    activeStepId: activeStep?.id ?? null
  })

  useEffect(() => {
    if (!isOpen) {
      setUserSelectedStep(false)
      return
    }
    if (requestedStepId === null) {
      return
    }
    setUserSelectedStep(false)
    setActiveStepId(requestedStepId)
  }, [isOpen, requestedStepId])

  useEffect(() => {
    if (!isOpen || userSelectedStep || requestedStepId !== null) {
      return
    }
    setActiveStepId(getFirstIncompleteFeatureWallSetupStepId(progress.stepDone, progress.mode))
  }, [isOpen, progress.mode, progress.stepDone, requestedStepId, userSelectedStep])

  useEffect(() => {
    if (
      !isOpen ||
      userSelectedStep ||
      requestedStepId === null ||
      activeStep?.id !== requestedStepId ||
      !progress.stepDone[activeStep.id]
    ) {
      return
    }
    const nextUnfinishedCoreStepId = getFirstIncompleteFeatureWallSetupStepId(
      progress.stepDone,
      progress.mode
    )
    if (nextUnfinishedCoreStepId !== activeStep.id) {
      setActiveStepId(nextUnfinishedCoreStepId)
    }
  }, [activeStep, isOpen, progress.mode, progress.stepDone, requestedStepId, userSelectedStep])

  const handleSelectStep = (id: FeatureWallSetupStepId): void => {
    setUserSelectedStep(true)
    setActiveStepId(id)
  }

  const handleOpenChange = (open: boolean): void => {
    if (!open) {
      closeModal()
    }
  }

  const handleHideFromSidebar = useCallback((): void => {
    setSetupGuideSidebarDismissed(true)
  }, [setSetupGuideSidebarDismissed])

  if (!isOpen) {
    return null
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        className="grid h-[min(780px,calc(100vh-2rem))] w-[min(1080px,calc(100vw-2rem))] max-w-none grid-rows-[auto_minmax(0,1fr)] gap-0 p-0 sm:max-w-none"
        tabIndex={-1}
        showCloseButton={false}
        onOpenAutoFocus={(event) => {
          // Start on the current step; the header actions are the least likely first move.
          const step = (event.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>(
            '[aria-current="step"]'
          )
          if (step) {
            event.preventDefault()
            step.focus()
          }
        }}
      >
        <div className="absolute top-4 right-4 z-10 flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={translate(
                  'auto.components.setup.guide.SetupGuideModal.f3b5ffb2a6',
                  'Hide checklist from sidebar'
                )}
                onClick={handleHideFromSidebar}
                className="size-7 rounded-full text-muted-foreground"
              >
                <EyeOff className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={4}>
              {translate(
                'auto.components.setup.guide.SetupGuideModal.28cf59fcb4',
                'This will hide the checklist from the sidebar'
              )}
            </TooltipContent>
          </Tooltip>
          <DialogClose asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={translate('auto.components.ui.dialog.f26c4baeda', 'Close')}
              className="size-7 rounded-full text-muted-foreground"
            >
              <X className="size-3.5" />
            </Button>
          </DialogClose>
        </div>
        <DialogHeader className="gap-1 border-b border-border px-7 py-4">
          <div className="flex items-center gap-2">
            <DialogTitle className="text-lg">
              {translate(
                'auto.components.setup.guide.SetupGuideModal.setupGuideTitle',
                'Setup guide'
              )}
            </DialogTitle>
            <SetupGuideProgressRing
              done={progress.coreDoneCount}
              total={progress.coreTotal}
              className="text-status-success"
              sizeClassName="size-5"
            />
            {/* The Help menu's only onboarding entry, so the tour and replay live here. */}
            <div className="mr-14 ml-auto flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="xs"
                // Telemetry enum has no setup-guide source; this replaces the Help menu item.
                onClick={() => openModal('feature-wall', { source: 'help_menu' })}
              >
                <Sparkles />
                {translate(
                  'auto.components.sidebar.SidebarSettingsHelpMenu.exploreMuster',
                  'Explore Muster'
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => {
                  closeModal()
                  void showOnboardingFromRenderer()
                }}
              >
                <School />
                {translate(
                  'auto.components.sidebar.SidebarSettingsHelpMenu.replayOnboarding',
                  'Replay onboarding'
                )}
              </Button>
            </div>
          </div>
          <DialogDescription className="text-sm text-muted-foreground">
            {translate(
              'auto.components.setup.guide.SetupGuideModal.setupGuideDescription',
              'Finish the setup that makes Muster useful for your day-to-day work.'
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 overflow-hidden px-7 py-6">
          <FeatureWallSetupChecklist
            activeStep={activeStep}
            progress={progress}
            onSelectStep={handleSelectStep}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
