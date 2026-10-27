import type React from 'react'
import { useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { CliInstallStatus } from '../../../../shared/cli-install-types'
import { useMountedRef } from '@/hooks/useMountedRef'
import { translate } from '@/i18n/i18n'
import { Button } from '../ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../ui/dialog'
import { SearchableSetting } from './SearchableSetting'
import { SettingsRow, SettingsSubsectionHeader } from './SettingsFormControls'
import { getGeneralShellCommandSearchEntries } from './general-search'

type BusyAction = 'install' | 'replace' | 'remove' | null

function describeStatus(status: CliInstallStatus | null): React.ReactNode {
  if (!status) {
    return translate('auto.components.settings.GeneralShellCommandSection.checking', 'Checking…')
  }
  if (status.state === 'conflict' && status.commandPath) {
    return translate(
      'auto.components.settings.GeneralShellCommandSection.conflict',
      'Another `{{value0}}` command is installed at {{value1}}.',
      { value0: status.commandName, value1: status.commandPath }
    )
  }
  if (status.state === 'installed' && status.pathConfigured === false && status.pathDirectory) {
    return translate(
      'auto.components.settings.GeneralShellCommandSection.notOnPath',
      'Installed, but {{value0}} is not on your PATH.',
      { value0: status.pathDirectory }
    )
  }
  return status.detail
}

export function GeneralShellCommandSection(): React.JSX.Element {
  const [status, setStatus] = useState<CliInstallStatus | null>(null)
  const [busy, setBusy] = useState<BusyAction>(null)
  const [confirmReplace, setConfirmReplace] = useState(false)
  const mountedRef = useMountedRef()
  const [entry] = getGeneralShellCommandSearchEntries()

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const next = await window.api.cli.getInstallStatus()
      if (mountedRef.current) {
        setStatus(next)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }, [mountedRef])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const run = async (action: Exclude<BusyAction, null>): Promise<void> => {
    setBusy(action)
    try {
      const next =
        action === 'remove'
          ? await window.api.cli.remove()
          : await window.api.cli.install({ replace: action === 'replace' })
      if (mountedRef.current) {
        setStatus(next)
        setConfirmReplace(false)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      if (mountedRef.current) {
        setBusy(null)
      }
    }
  }

  const commandName = status?.commandName ?? 'muster'
  const control = !status?.supported ? null : status.state === 'installed' ? (
    <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => void run('remove')}>
      {busy === 'remove' ? <Loader2 className="size-3.5 animate-spin" /> : null}
      {translate('auto.components.settings.GeneralShellCommandSection.remove', 'Remove')}
    </Button>
  ) : status.state === 'conflict' ? (
    <Button
      variant="outline"
      size="sm"
      disabled={busy !== null}
      onClick={() => setConfirmReplace(true)}
    >
      {translate('auto.components.settings.GeneralShellCommandSection.replace', 'Replace…')}
    </Button>
  ) : (
    <Button
      variant="default"
      size="sm"
      disabled={busy !== null}
      onClick={() => void run('install')}
    >
      {busy === 'install' ? <Loader2 className="size-3.5 animate-spin" /> : null}
      {translate('auto.components.settings.GeneralShellCommandSection.install', 'Install')}
    </Button>
  )

  return (
    <section className="space-y-4">
      <SettingsSubsectionHeader
        title={translate(
          'auto.components.settings.GeneralShellCommandSection.title',
          'Shell Command'
        )}
      />
      <SearchableSetting {...entry}>
        <SettingsRow
          label={
            <>
              {translate(
                'auto.components.settings.GeneralShellCommandSection.label',
                'Run Muster from a terminal'
              )}{' '}
              <code className="font-mono text-xs">{commandName}</code>
            </>
          }
          description={describeStatus(status)}
          control={control}
        />
      </SearchableSetting>

      <Dialog open={confirmReplace} onOpenChange={setConfirmReplace}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {translate(
                'auto.components.settings.GeneralShellCommandSection.replaceTitle',
                'Replace the existing `{{value0}}` command?',
                { value0: commandName }
              )}
            </DialogTitle>
            <DialogDescription>
              {translate(
                'auto.components.settings.GeneralShellCommandSection.replaceDescription',
                'Muster deletes {{value0}} and links its own command there. This cannot be undone.',
                { value0: status?.commandPath ?? '' }
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmReplace(false)}>
              {translate('auto.components.settings.GeneralShellCommandSection.cancel', 'Cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={busy !== null}
              onClick={() => void run('replace')}
            >
              {busy === 'replace' ? <Loader2 className="size-3.5 animate-spin" /> : null}
              {translate(
                'auto.components.settings.GeneralShellCommandSection.replaceConfirm',
                'Replace'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
