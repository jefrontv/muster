import { useCallback, useEffect, useState } from 'react'
import { KeyRound, TriangleAlert } from 'lucide-react'
import type {
  BundledExtensionInfo,
  WordPressLoginAutofillStatus
} from '../../../../shared/browser-extension-types'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { SearchableSetting } from './SearchableSetting'
import { SettingsSwitchRow } from './SettingsFormControls'
import { translate } from '@/i18n/i18n'

function WordPressLoginConfig({ enabled }: { enabled: boolean }): React.JSX.Element {
  const [status, setStatus] = useState<WordPressLoginAutofillStatus | null>(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    void window.api.browser.extensions.getWordPressLogin().then((next) => {
      setStatus(next)
      setUsername(next.username)
    })
  }, [])

  const persist = useCallback(
    async (overrides: { autoLogin?: boolean } = {}) => {
      setNotice(null)
      const result = await window.api.browser.extensions.setWordPressLogin({
        username,
        // An empty field means "keep the stored password", never "clear it".
        password: password.length > 0 ? password : null,
        autoLogin: overrides.autoLogin ?? status?.autoLogin === true
      })
      if (!result.ok) {
        setNotice(result.message)
        return
      }
      setStatus(result.status)
      setPassword('')
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
    [password, status?.autoLogin, username]
  )

  const clearPassword = useCallback(async () => {
    setStatus(await window.api.browser.extensions.clearWordPressLoginPassword())
  }, [])

  return (
    <div className="space-y-3 rounded-md border border-border/50 bg-muted/20 p-3">
      <div className="space-y-2">
        <Label className="text-xs">
          {translate('auto.components.settings.BundledExtensionsSection.a91b3e70cd', 'Username')}
        </Label>
        <Input
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="admin"
          autoComplete="off"
        />
      </div>
      <div className="space-y-2">
        <Label className="text-xs">
          {status?.hasPassword
            ? translate(
                'auto.components.settings.BundledExtensionsSection.b7c04f12ae',
                'Password (stored — type to replace)'
              )
            : translate('auto.components.settings.BundledExtensionsSection.c58e29a4d1', 'Password')}
        </Label>
        <Input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder={status?.hasPassword ? '••••••••' : ''}
          autoComplete="new-password"
        />
      </div>

      <SettingsSwitchRow
        label={translate(
          'auto.components.settings.BundledExtensionsSection.d3f8017b62',
          'Submit the form automatically'
        )}
        description={translate(
          'auto.components.settings.BundledExtensionsSection.e40a5c1936',
          'Off fills the fields only. A failed login or a deliberate logout is never resubmitted.'
        )}
        checked={status?.autoLogin === true}
        disabled={!enabled}
        onChange={() => void persist({ autoLogin: status?.autoLogin !== true })}
      />

      {notice ? (
        <div className="flex items-start gap-1.5 text-xs text-destructive">
          <TriangleAlert className="mt-0.5 size-3 shrink-0" />
          <span>{notice}</span>
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <Button type="button" size="sm" disabled={!enabled} onClick={() => void persist()}>
          {saved
            ? translate('auto.components.settings.BundledExtensionsSection.f16b8d05c7', 'Saved')
            : translate(
                'auto.components.settings.BundledExtensionsSection.a2c7e94013',
                'Save Credentials'
              )}
        </Button>
        {status?.hasPassword ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => void clearPassword()}>
            {translate(
              'auto.components.settings.BundledExtensionsSection.b8e1490fd2',
              'Clear Password'
            )}
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        {translate(
          'auto.components.settings.BundledExtensionsSection.c04d7fe158',
          'The password is stored in your OS keychain and written into the extension only while it is enabled.'
        )}
      </p>
    </div>
  )
}

export function BundledExtensionsSection(): React.JSX.Element {
  const [bundled, setBundled] = useState<BundledExtensionInfo[]>([])
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const title = translate(
    'auto.components.settings.BundledExtensionsSection.d5910be3c7',
    'Muster Extensions'
  )
  const description = translate(
    'auto.components.settings.BundledExtensionsSection.e6b204af91',
    'Extensions Muster ships for the in-app browser. Install one to load it into every browser tab.'
  )

  const refresh = useCallback(async () => {
    setBundled(await window.api.browser.extensions.listBundled())
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const run = useCallback(
    async (action: 'installBundled' | 'disableBundled' | 'uninstallBundled', id: string) => {
      setBusy(true)
      setNotice(null)
      try {
        const result = await window.api.browser.extensions[action]({ id })
        if (!result.ok) {
          setNotice(result.message)
        }
        await refresh()
      } finally {
        setBusy(false)
      }
    },
    [refresh]
  )

  return (
    <SearchableSetting
      title={title}
      description={description}
      keywords={['browser', 'extension', 'wordpress', 'login', 'autofill', 'muster', 'bundled']}
      className="space-y-3 py-2"
    >
      <div className="space-y-1">
        <div className="text-sm font-medium">{title}</div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>

      {bundled.map((entry) => (
        <div key={entry.id} className="space-y-3 rounded-md border border-border/50 px-3 py-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-0.5">
              <div className="flex items-center gap-2 text-sm font-medium">
                <KeyRound className="size-3.5 shrink-0 text-muted-foreground" />
                {entry.name}
                <span className="text-xs font-normal text-muted-foreground">
                  {entry.enabled
                    ? translate(
                        'auto.components.settings.BundledExtensionsSection.f2705ce8b4',
                        'Enabled'
                      )
                    : entry.installed
                      ? translate(
                          'auto.components.settings.BundledExtensionsSection.a4b90cd671',
                          'Installed'
                        )
                      : translate(
                          'auto.components.settings.BundledExtensionsSection.b615e0f2a8',
                          'Not installed'
                        )}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{entry.description}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {entry.enabled ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => void run('disableBundled', entry.id)}
                >
                  {translate(
                    'auto.components.settings.BundledExtensionsSection.c8123fe4a0',
                    'Disable'
                  )}
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  disabled={busy}
                  onClick={() => void run('installBundled', entry.id)}
                >
                  {entry.installed
                    ? translate(
                        'auto.components.settings.BundledExtensionsSection.d97e6015bc',
                        'Enable'
                      )
                    : translate(
                        'auto.components.settings.BundledExtensionsSection.e2a3b7c941',
                        'Install'
                      )}
                </Button>
              )}
              {entry.installed ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => void run('uninstallBundled', entry.id)}
                >
                  {translate(
                    'auto.components.settings.BundledExtensionsSection.f5028cd731',
                    'Remove'
                  )}
                </Button>
              ) : null}
            </div>
          </div>

          {entry.id === 'wordpress-login-autofill' && entry.installed ? (
            <WordPressLoginConfig enabled={entry.enabled} />
          ) : null}
        </div>
      ))}

      {notice ? <p className="text-xs text-destructive">{notice}</p> : null}
    </SearchableSetting>
  )
}
