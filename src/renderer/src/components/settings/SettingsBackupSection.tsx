// Export/import of the settings file.
//
// The two buttons do nothing clever themselves: the main process owns the dialogs, the redaction,
// and the validation (see shared/settings-transfer.ts). This file only turns the tagged outcome
// into a sentence, because "it failed" without a reason is what makes settings files unfixable.

import { useState } from 'react'
import type React from 'react'
import { Download, Loader2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import type { SettingsImportOutcome } from '../../../../shared/settings-transfer'
import { useMountedRef } from '@/hooks/useMountedRef'
import { Button } from '../ui/button'
import { SearchableSetting } from './SearchableSetting'
import { SettingsRow, SettingsSubsectionHeader } from './SettingsFormControls'
import { getSettingsBackupSearchEntries } from './settings-backup-search'
import { translate } from '@/i18n/i18n'

export { getSettingsBackupSearchEntries }

/** Maps a rejection reason from `parseSettingsImport` onto something a user can act on. */
function importFailureMessage(reason: string): string {
  if (reason === 'notJson' || reason === 'notAnObject') {
    return translate(
      'auto.components.settings.SettingsBackup.errorNotJson',
      'That file is not valid JSON.'
    )
  }
  if (reason === 'notASettingsExport') {
    return translate(
      'auto.components.settings.SettingsBackup.errorNotAnExport',
      'That file was not exported from Muster settings.'
    )
  }
  if (reason === 'unsupportedVersion') {
    return translate(
      'auto.components.settings.SettingsBackup.errorVersion',
      'That file was written by a newer version of Muster.'
    )
  }
  if (reason === 'containsExcludedKey') {
    return translate(
      'auto.components.settings.SettingsBackup.errorExcludedKey',
      'That file contains credentials or machine-specific paths, which Muster never exports. It was not imported.'
    )
  }
  if (reason === 'invalidValue') {
    return translate(
      'auto.components.settings.SettingsBackup.errorInvalidValue',
      'A setting in that file has the wrong kind of value. Nothing was changed.'
    )
  }
  if (reason === 'missingSettings' || reason === 'noRecognizedSettings') {
    return translate(
      'auto.components.settings.SettingsBackup.errorNothingToImport',
      'That file has no settings this version of Muster understands.'
    )
  }
  return reason
}

function reportImportSuccess(outcome: Extract<SettingsImportOutcome, { ok: true }>): void {
  const applied = translate(
    'auto.components.settings.SettingsBackup.imported',
    'Imported {{value0}} settings.',
    { value0: outcome.appliedKeys.length }
  )
  if (outcome.ignoredKeys.length === 0) {
    toast.success(applied)
    return
  }
  toast.success(applied, {
    description: translate(
      'auto.components.settings.SettingsBackup.importedWithIgnored',
      'Skipped {{value0}} setting(s) this version does not recognise.',
      { value0: outcome.ignoredKeys.length }
    )
  })
}

export function SettingsBackupSection(): React.JSX.Element {
  const mountedRef = useMountedRef()
  const [busy, setBusy] = useState<'export' | 'import' | null>(null)
  const [exportEntry, importEntry] = getSettingsBackupSearchEntries()

  const runExport = async (): Promise<void> => {
    setBusy('export')
    try {
      const outcome = await window.api.settings.exportToFile()
      if (!outcome.ok) {
        if (!('cancelled' in outcome)) {
          toast.error(
            translate(
              'auto.components.settings.SettingsBackup.exportFailed',
              'Could not write the settings file.'
            ),
            { description: outcome.reason }
          )
        }
        return
      }
      toast.success(
        translate(
          'auto.components.settings.SettingsBackup.exported',
          'Exported {{value0}} settings.',
          { value0: outcome.settingCount }
        ),
        { description: outcome.filePath }
      )
    } finally {
      if (mountedRef.current) {
        setBusy(null)
      }
    }
  }

  const runImport = async (): Promise<void> => {
    setBusy('import')
    try {
      const outcome = await window.api.settings.importFromFile()
      if (!outcome.ok) {
        if (!('cancelled' in outcome)) {
          toast.error(
            translate(
              'auto.components.settings.SettingsBackup.importFailed',
              'Could not import that settings file.'
            ),
            { description: importFailureMessage(outcome.reason) }
          )
        }
        return
      }
      reportImportSuccess(outcome)
    } finally {
      if (mountedRef.current) {
        setBusy(null)
      }
    }
  }

  return (
    <section className="space-y-3">
      <SettingsSubsectionHeader
        title={translate('auto.components.settings.SettingsBackup.title', 'Settings backup')}
        description={translate(
          'auto.components.settings.SettingsBackup.description',
          'Move your preferences to another machine. Credentials and machine-specific paths are deliberately left out of the file.'
        )}
      />

      <SearchableSetting {...exportEntry}>
        <SettingsRow
          label={exportEntry.title}
          description={exportEntry.description}
          control={
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={busy !== null}
              onClick={() => void runExport()}
            >
              {busy === 'export' ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Download className="size-3.5" />
              )}
              {translate('auto.components.settings.SettingsBackup.exportAction', 'Export…')}
            </Button>
          }
        />
      </SearchableSetting>

      <SearchableSetting {...importEntry}>
        <SettingsRow
          label={importEntry.title}
          description={importEntry.description}
          control={
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={busy !== null}
              onClick={() => void runImport()}
            >
              {busy === 'import' ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Upload className="size-3.5" />
              )}
              {translate('auto.components.settings.SettingsBackup.importAction', 'Import…')}
            </Button>
          }
        />
      </SearchableSetting>
    </section>
  )
}
