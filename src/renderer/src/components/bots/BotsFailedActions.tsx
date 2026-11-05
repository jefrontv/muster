import type React from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'

export function BotsFailedActions({
  error,
  onRestart
}: {
  error: string
  onRestart: () => void
}): React.JSX.Element {
  const copyError = (): void => {
    void window.api.ui
      .writeClipboardText(error)
      .then(() =>
        toast.success(translate('auto.components.bots.BotsPage.errorCopied', 'Error copied'))
      )
  }
  const openLog = (): void => {
    void window.api.bots.openLog().then((failure) => {
      if (failure) {
        toast.error(
          translate('auto.components.bots.BotsPage.openLogFailed', "Couldn't open the log"),
          { description: failure }
        )
      }
    })
  }
  return (
    <div className="mt-1 flex flex-wrap justify-center gap-2">
      <Button size="sm" onClick={onRestart}>
        {translate('auto.components.bots.BotsPage.restart', 'Restart')}
      </Button>
      <Button size="sm" variant="outline" onClick={copyError}>
        {translate('auto.components.bots.BotsPage.copyError', 'Copy error')}
      </Button>
      <Button size="sm" variant="ghost" onClick={openLog}>
        {translate('auto.components.bots.BotsPage.openLog', 'Open log')}
      </Button>
    </div>
  )
}
