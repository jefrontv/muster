import { useEffect, useRef, useState, type JSX } from 'react'
import { Mic } from 'lucide-react'
import { getDefaultVoiceSettings } from '../../../../shared/constants'
import type { FeatureTip } from '../../../../shared/feature-tips'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { useAppStore } from '@/store'
import { useModalData } from '@/hooks/use-modal-data'
import { CmdJPaletteFeatureTipVisual } from './CmdJPaletteFeatureTipVisual'
import { CmdJPaletteTipDialog } from './CmdJPaletteTipDialog'
import { FeatureTipActions } from './FeatureTipActions'
import { getFeatureTipForModal } from './feature-tip-modal-state'
import {
  getOrcaCliFeatureTipTelemetrySource,
  trackCmdJPaletteFeatureTipAcknowledged
} from './feature-tip-telemetry'

const WAVEFORM_BAR_HEIGHTS = [30, 60, 90, 70, 100, 50, 80, 35, 65]

function FeatureTipVisual({ tip }: { tip: FeatureTip }): JSX.Element {
  switch (tip.action) {
    case 'learn-cmd-j-palette':
      // Kept for type exhaustiveness; the cmd-j tip is rendered via
      // CmdJPaletteTipDialog and never reaches this function at runtime.
      return <CmdJPaletteFeatureTipVisual />
    case 'enable-voice':
      return (
        <div className="flex flex-col items-center gap-2.5">
          <div className="flex size-14 items-center justify-center rounded-full bg-foreground text-background">
            <Mic className="size-5" />
          </div>
          {/* Animated waveform — purely decorative, signals "voice" without copy */}
          <div className="flex h-6 items-center justify-center gap-1" aria-hidden="true">
            {WAVEFORM_BAR_HEIGHTS.map((height, i) => (
              <span
                key={i}
                className="block w-[3px] rounded-[2px] bg-foreground/60 animate-waveform"
                style={{ height: `${height}%`, animationDelay: `${i * 0.1}s` }}
              />
            ))}
          </div>
        </div>
      )
  }
}

export default function FeatureTipsModal(): JSX.Element | null {
  const activeModal = useAppStore((s) => s.activeModal)
  const closeModal = useAppStore((s) => s.closeModal)
  const openSettingsPage = useAppStore((s) => s.openSettingsPage)
  const openSettingsTarget = useAppStore((s) => s.openSettingsTarget)
  const settings = useAppStore((s) => s.settings)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const seenTipIds = useAppStore((s) => s.featureTipsSeenIds)
  const featureInteractions = useAppStore((s) => s.featureInteractions)
  const markFeatureTipsSeen = useAppStore((s) => s.markFeatureTipsSeen)
  const modalData = useModalData('feature-tips')
  const activeModalRef = useRef(activeModal)
  const [primaryBusy, setPrimaryBusy] = useState(false)
  const isOpen = activeModal === 'feature-tips'
  const currentTip = getFeatureTipForModal({
    modalData,
    seenTipIds,
    featureInteractions,
    settings
  })

  useEffect(() => {
    activeModalRef.current = activeModal
  }, [activeModal])

  const markCurrentTipSeen = (): void => {
    if (currentTip) {
      markFeatureTipsSeen([currentTip.id])
    }
  }

  const handleOpenChange = (open: boolean): void => {
    if (!open) {
      markCurrentTipSeen()
      setPrimaryBusy(false)
      closeModal()
    }
  }

  const handleSkip = (): void => {
    markCurrentTipSeen()
    setPrimaryBusy(false)
    closeModal()
  }

  const openShortcutsSettings = (): void => {
    // Why: dismiss the tip when navigating away — the tip's job is done once
    // the user clicks through to rebind, and leaving it mounted behind the
    // settings page would re-appear on close.
    markCurrentTipSeen()
    closeModal()
    openSettingsTarget({ pane: 'shortcuts', repoId: null })
    openSettingsPage()
  }

  const handlePrimaryAction = async (): Promise<void> => {
    if (!currentTip) {
      return
    }

    markFeatureTipsSeen([currentTip.id])
    switch (currentTip.action) {
      case 'learn-cmd-j-palette': {
        // Why: passive education tip — acknowledging just dismisses; the rebind
        // path lives in Settings and is reachable from the palette itself.
        trackCmdJPaletteFeatureTipAcknowledged(
          getOrcaCliFeatureTipTelemetrySource(modalData?.source)
        )
        closeModal()
        break
      }
      case 'enable-voice': {
        const voice = settings?.voice ?? getDefaultVoiceSettings()
        void updateSettings({
          voice: {
            ...voice,
            enabled: true
          }
        })
        closeModal()
        openSettingsTarget({ pane: 'voice', repoId: null })
        openSettingsPage()
        break
      }
    }
  }

  if (!isOpen || !currentTip) {
    return null
  }

  if (currentTip.action === 'learn-cmd-j-palette') {
    return (
      <CmdJPaletteTipDialog
        open={isOpen}
        tip={currentTip}
        primaryBusy={primaryBusy}
        onOpenChange={handleOpenChange}
        onPrimaryAction={() => void handlePrimaryAction()}
        onSkip={handleSkip}
        onRebindClick={openShortcutsSettings}
      />
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md gap-4 p-7" showCloseButton>
        <DialogHeader className="items-center gap-4 px-8 text-center sm:text-center">
          <FeatureTipVisual tip={currentTip} />
          <DialogTitle className="text-2xl font-semibold tracking-tight">
            {currentTip.title}
          </DialogTitle>
          <DialogDescription className="max-w-sm text-sm leading-relaxed">
            {currentTip.description}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="sm:justify-center">
          <FeatureTipActions
            currentTip={currentTip}
            primaryBusy={primaryBusy}
            onPrimaryAction={() => void handlePrimaryAction()}
            onSkip={handleSkip}
            showSkip
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
