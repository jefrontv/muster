import type { JSX } from 'react'
import { Loader2 } from 'lucide-react'
import type { FeatureTip } from '../../../../shared/feature-tips'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'

export function FeatureTipActions({
  currentTip,
  primaryBusy,
  onPrimaryAction,
  onSkip,
  showSkip = true,
  fullWidth = false
}: {
  currentTip: FeatureTip
  primaryBusy: boolean
  onPrimaryAction: () => void
  onSkip: () => void
  showSkip?: boolean
  fullWidth?: boolean
}): JSX.Element {
  return (
    <>
      {showSkip ? (
        <Button variant="ghost" onClick={onSkip} disabled={primaryBusy}>
          {translate('auto.components.feature.tips.FeatureTipActions.eb04abece8', 'Maybe Later')}
        </Button>
      ) : null}
      <Button
        className={fullWidth ? 'w-full' : undefined}
        onClick={onPrimaryAction}
        disabled={primaryBusy}
      >
        {primaryBusy ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            {translate('auto.components.feature.tips.FeatureTipActions.working', 'Working...')}
          </>
        ) : (
          currentTip.ctaLabel
        )}
      </Button>
    </>
  )
}
