import { useCallback, useEffect, useState } from 'react'
import type { BotsKeyStatus } from '../../../../shared/bots-types'
import { translate } from '@/i18n/i18n'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'

const COMPOSIO_KEYS_URL = 'https://dashboard.composio.dev'

/** The Composio key bots use for connected apps; the same key the Bots tab's own settings edit. */
export function BotsComposioKeySetting(): React.JSX.Element {
  const [status, setStatus] = useState<BotsKeyStatus | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    void window.api?.bots?.composioKeyStatus().then(setStatus)
  }, [])

  const save = useCallback(async (value: string) => {
    setBusy(true)
    setNotice(null)
    const result = await window.api.bots.setComposioKey(value)
    setBusy(false)
    setStatus(result.status)
    if (!result.ok) {
      setNotice(result.message)
      return
    }
    setDraft('')
  }, [])

  return (
    <div className="space-y-2 rounded-md border border-border/50 bg-muted/20 p-3">
      <Label htmlFor="bots-composio-key" className="text-xs">
        {status?.saved
          ? translate(
              'auto.components.settings.BotsComposioKeySetting.savedLabel',
              'Composio API key (saved, ending {{hint}})',
              { hint: status.hint ?? '' }
            )
          : translate('auto.components.settings.BotsComposioKeySetting.label', 'Composio API key')}
      </Label>
      <p className="text-xs text-muted-foreground">
        {translate(
          'auto.components.settings.BotsComposioKeySetting.copy',
          'Connects bots to apps like Gmail, Slack and Calendar. Stored encrypted on this computer.'
        )}{' '}
        <button
          type="button"
          className="underline underline-offset-2 hover:text-foreground"
          onClick={() => void window.api.shell.openUrl(COMPOSIO_KEYS_URL)}
        >
          {translate('auto.components.settings.BotsComposioKeySetting.getKey', 'Get a key')}
        </button>
      </p>
      <div className="flex items-center gap-2">
        <Input
          id="bots-composio-key"
          type="password"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={
            status?.saved
              ? '••••••••'
              : translate('auto.components.settings.BotsComposioKeySetting.placeholder', 'ak_…')
          }
          autoComplete="off"
          spellCheck={false}
          className="flex-1"
        />
        <Button
          size="default"
          disabled={busy || draft.trim().length === 0}
          onClick={() => void save(draft)}
        >
          {translate('auto.components.settings.BotsComposioKeySetting.save', 'Save')}
        </Button>
        {status?.saved ? (
          <Button size="default" variant="outline" disabled={busy} onClick={() => void save('')}>
            {translate('auto.components.settings.BotsComposioKeySetting.remove', 'Remove')}
          </Button>
        ) : null}
      </div>
      {notice ? <p className="text-xs text-destructive">{notice}</p> : null}
    </div>
  )
}
