// Everything about one extension, and the place its install actually runs.
//
// One button, a progress line, and a version that has already refreshed by the time it says Done.
// Nobody should have to read a package manager to install a tool, so the command never appears in
// the happy path — the log and the command to copy live behind "Show details", which opens by
// itself when something fails and there is a reason to look.
//
// The trade: there is no TTY behind this, so a command that stops to ask a question fails instead
// of waiting. That is the better failure — a hidden prompt would be a hang with nothing on screen —
// and the copyable command is the way out when a real shell is genuinely needed.

import { useEffect } from 'react'
import { ExternalLink, LoaderCircle, Trash2, Wrench } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { ExtensionHarnessId } from '../../../../shared/extension-catalog-types'
import {
  visibleExtensionHarnesses,
  type ExtensionInventoryEntry
} from '../../../../shared/extension-state-types'
import {
  canWireHarnesses,
  extensionCommandSpec,
  extensionUninstallCommand,
  isExtensionEnabled,
  resolveExtensionCommand
} from '../../../../shared/extension-command-resolution'
import { extensionSettingSpecs } from '../../../../shared/extension-setting-values'
import { useConfirmationDialog } from '@/components/confirmation-dialog'
import { publishExtensionInventory, refreshExtensionInventory } from '@/hooks/useExtensionInventory'
import { useExtensionRun } from '@/hooks/useExtensionRun'
import { describeExtensionStatus } from '../extensions/extension-status-presentation'
import { shortenExtensionConfigPath } from '../extensions/extension-config-path'
import { ExtensionHarnessRow } from './extension-harness-row'
import { ExtensionRunPanel } from './extension-run-panel'
import { ExtensionSettingFields } from './extension-setting-fields'
import { SettingsSwitch } from './SettingsFormControls'

export function ExtensionDetailDialog({
  item,
  busyHarness,
  onClose,
  onInstallHarness,
  onUninstallHarness,
  onToggleAutoUpdate,
  settingValues,
  onSaveSettings
}: {
  item: ExtensionInventoryEntry | null
  busyHarness: string | null
  onClose: () => void
  onInstallHarness: (id: string, harnessId: ExtensionHarnessId) => void
  onUninstallHarness: (id: string, harnessId: ExtensionHarnessId) => void
  onToggleAutoUpdate: (id: string, enabled: boolean) => void
  settingValues: Record<string, string>
  onSaveSettings: (id: string, values: Record<string, string>) => Promise<void>
}): React.JSX.Element {
  const openId = item?.entry.id ?? null
  const run = useExtensionRun(openId ?? '')
  const reset = run.reset
  const confirm = useConfirmationDialog()

  // Why keyed on the id: reopening on a different extension must not show the previous one's log,
  // and closing must not leave a stale result waiting for the next open.
  useEffect(() => {
    reset()
  }, [openId, reset])

  if (!item) {
    return <Dialog open={false} onOpenChange={onClose} />
  }

  const { entry, state } = item
  const status = describeExtensionStatus(state.status)
  const action = resolveExtensionCommand(entry, state)
  const unavailable = state.status === 'unsupported-platform' || state.status === 'no-access'
  const running = run.phase === 'running'
  const autoUpdateLabel = translate(
    'auto.components.extensions.auto_update',
    'Update automatically'
  )

  const enabled = isExtensionEnabled(state)
  const canDisable = entry.install.method === 'config-write' && state.harnesses.length > 0

  const removable = extensionUninstallCommand(entry) !== null || state.origin !== undefined
  const harnesses = visibleExtensionHarnesses(state.harnesses)
  const settingSpecs = extensionSettingSpecs(entry)
  const setupCommand = extensionCommandSpec(entry)?.setup ?? null

  const setEnabled = async (next: boolean): Promise<void> => {
    const result = await window.api.extensions.setEnabled({ id: entry.id, enabled: next })
    if (result.ok) {
      publishExtensionInventory(result.value)
    } else {
      toast.error(result.error)
    }
  }

  const remove = async (): Promise<void> => {
    const isSkill = state.origin !== undefined
    const confirmed = await confirm({
      title: translate(
        'auto.components.extensions.remove_title',
        'Remove {{name}}?'
      ).replace('{{name}}', entry.name),
      description: isSkill
        ? translate(
            'auto.components.extensions.remove_skill_body',
            'Muster moves the skill folder to the Trash. You can put it back from there.'
          )
        : translate(
            'auto.components.extensions.remove_tool_body',
            'Muster clears its entry from every harness and removes the program from this machine. Installing it again brings it back.'
          ),
      confirmLabel: translate('auto.components.extensions.remove_confirm', 'Remove'),
      confirmVariant: 'destructive'
    })
    if (!confirmed) {
      return
    }
    const result = isSkill
      ? await window.api.extensions.removeSkill({ id: entry.id })
      : await window.api.extensions.uninstall({ id: entry.id })
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    await refreshExtensionInventory(false)
    toast.success(
      translate('auto.components.extensions.removed', '{{name}} removed').replace(
        '{{name}}',
        entry.name
      )
    )
    onClose()
  }

  const copyCommand = async (): Promise<void> => {
    if (!action) {
      return
    }
    await navigator.clipboard.writeText(action.command)
    toast.success(translate('auto.components.extensions.copied', 'Command copied'))
  }

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-baseline gap-x-2.5">
            <span>{entry.name}</span>
            {state.installedVersion || state.latestVersion ? (
              <span className="font-mono text-xs font-normal tabular-nums text-muted-foreground">
                {state.installedVersion ??
                  (state.installed
                    ? translate('auto.components.extensions.version_unknown', 'version unknown')
                    : translate('auto.components.extensions.version_none', 'not installed'))}
                {state.latestVersion && state.latestVersion !== state.installedVersion ? (
                  <>
                    <span aria-hidden> → </span>
                    <span
                      className={cn(
                        state.status === 'outdated' && 'font-medium text-amber-600 dark:text-amber-400'
                      )}
                    >
                      {state.latestVersion}
                    </span>
                  </>
                ) : null}
              </span>
            ) : null}
          </DialogTitle>
          <DialogDescription>{entry.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{status.label}</span>
            {state.detail ? <span>{state.detail}</span> : null}
            {entry.homepage ? (
              <a
                href={entry.homepage}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-foreground"
              >
                <ExternalLink className="size-3" />
                {translate('auto.components.extensions.action_learn', 'Project page')}
              </a>
            ) : null}
          </div>

          {entry.about ? (
            <p className="text-xs leading-5 text-muted-foreground">{entry.about}</p>
          ) : null}

          {state.origin ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              <dt className="text-muted-foreground">
                {translate('auto.components.extensions.origin_source', 'Source')}
              </dt>
              <dd>{state.origin.label}</dd>
              {state.origin.providers.length > 0 ? (
                <>
                  <dt className="text-muted-foreground">
                    {translate('auto.components.extensions.origin_agents', 'Agents')}
                  </dt>
                  <dd>{state.origin.providers.join(', ')}</dd>
                </>
              ) : null}
              <dt className="text-muted-foreground">
                {translate('auto.components.extensions.origin_file', 'File')}
              </dt>
              <dd className="truncate font-mono text-[11px]" title={state.origin.path}>
                {shortenExtensionConfigPath(state.origin.path)}
              </dd>
            </dl>
          ) : null}

          <ExtensionRunPanel
            run={run}
            updating={action?.kind === 'update'}
            onCopyCommand={action ? () => void copyCommand() : null}
          />

          {canWireHarnesses(entry, state) && harnesses.length > 0 ? (
            <div>
              <p className="mb-1.5 text-xs font-medium">
                {translate('auto.components.extensions.harnesses_title', 'Registered with')}
              </p>
              {state.installed && !state.externallyManaged ? (
                <p className="mb-1.5 text-xs text-muted-foreground">
                  {translate(
                    'auto.components.extensions.harnesses_hint',
                    'Installing registers every agent on this machine. Remove any you do not want it in.'
                  )}
                </p>
              ) : null}
              {state.externallyManaged ? (
                <p className="mb-1.5 text-xs text-muted-foreground">
                  {translate(
                    'auto.components.extensions.externally_managed',
                    'These point at a copy Muster did not install. Installing replaces them.'
                  )}
                </p>
              ) : null}
              <div className="divide-y divide-border/50 overflow-hidden rounded-md border border-border/60 bg-muted/20">
                {harnesses.map((harness) => (
                  <ExtensionHarnessRow
                    key={harness.id}
                    harness={harness}
                    busy={busyHarness === `${entry.id}:${harness.id}`}
                    onInstall={() => onInstallHarness(entry.id, harness.id)}
                    onUninstall={() => onUninstallHarness(entry.id, harness.id)}
                  />
                ))}
              </div>
            </div>
          ) : entry.install.method === 'config-write' ? (
            <p className="text-xs text-muted-foreground">
              {translate(
                'auto.components.extensions.wire_blocked',
                'Install the program first. An entry pointing at a server that is not there fails to start on every session.'
              )}
            </p>
          ) : null}

          {settingSpecs ? (
            <ExtensionSettingFields
              key={entry.id}
              specs={settingSpecs}
              stored={settingValues}
              onSave={(values) => onSaveSettings(entry.id, values)}
            />
          ) : null}

          {canDisable ? (
            <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
              <span className="text-xs text-muted-foreground">
                {translate(
                  'auto.components.extensions.enabled',
                  'Available to your agents'
                )}
              </span>
              <SettingsSwitch
                checked={enabled}
                ariaLabel={translate(
                  'auto.components.extensions.enabled_aria',
                  'Available to your agents \u2014 {{name}}'
                ).replace('{{name}}', entry.name)}
                onChange={() => void setEnabled(!enabled)}
              />
            </div>
          ) : null}

          {state.autoUpdateSupported ? (
            <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
              <span className="text-xs text-muted-foreground">{autoUpdateLabel}</span>
              <SettingsSwitch
                checked={state.autoUpdateEnabled}
                ariaLabel={`${autoUpdateLabel} — ${entry.name}`}
                onChange={() => onToggleAutoUpdate(entry.id, !state.autoUpdateEnabled)}
              />
            </div>
          ) : entry.autoUpdate?.reason ? (
            <p className="border-t border-border pt-3 text-xs text-muted-foreground/70">
              {translate(
                'auto.components.extensions.auto_update_blocked',
                'Updates stay manual here: {{reason}}'
              ).replace('{{reason}}', entry.autoUpdate.reason)}
            </p>
          ) : null}
        </div>

        <DialogFooter className="sm:justify-between">
          {removable && state.installed ? (
            <Button
              variant="outline"
              size="sm"
              disabled={running}
              // Why outlined rather than filled: it is the least-wanted action in the footer, so it
              // reads as destructive without competing with Update for the eye.
              className="border-destructive/40 text-destructive hover:border-destructive/60 hover:bg-destructive/10 hover:text-destructive"
              onClick={() => void remove()}
            >
              <Trash2 className="size-3.5" />
              {translate('auto.components.extensions.remove', 'Remove')}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
          {setupCommand && state.installed && !running ? (
            <Button variant="outline" onClick={() => void run.start('setup')}>
              <Wrench className="size-3.5" />
              {translate('auto.components.extensions.action_setup', 'Run setup')}
            </Button>
          ) : null}
          <Button variant="outline" onClick={running ? run.cancel : onClose}>
            {running
              ? translate('auto.components.extensions.run_cancel', 'Stop')
              : translate('auto.components.extensions.close', 'Close')}
          </Button>
          {action && !unavailable ? (
            <Button
              disabled={running}
              variant={state.status === 'outdated' ? 'default' : 'outline'}
              onClick={() => void run.start()}
            >
              {running ? <LoaderCircle className="animate-spin" /> : null}
              {running
                ? translate('auto.components.extensions.run_running', 'Working…')
                : run.phase === 'failed'
                  ? translate('auto.components.extensions.run_retry', 'Try again')
                  : action.kind === 'update'
                    ? translate('auto.components.extensions.action_update', 'Update')
                    : translate('auto.components.extensions.action_install', 'Install')}
            </Button>
          ) : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
