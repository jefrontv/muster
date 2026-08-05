// Settings-search entries for the Backup & Restore section of the Advanced pane.

import type { SettingsSearchEntry } from './settings-search'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'
import { translate } from '@/i18n/i18n'
import { translateSearchKeyword } from './settings-search-keywords'

const sharedKeywords = (): string[] => [
  ...translateSearchKeyword('auto.components.settings.settingsBackup.search.settings', 'settings'),
  ...translateSearchKeyword('auto.components.settings.settingsBackup.search.backup', 'backup'),
  ...translateSearchKeyword('auto.components.settings.settingsBackup.search.restore', 'restore'),
  ...translateSearchKeyword('auto.components.settings.settingsBackup.search.json', 'json', {
    englishOnly: true
  })
]

export const getSettingsBackupSearchEntries = createLocalizedCatalog((): SettingsSearchEntry[] => [
  {
    title: translate(
      'auto.components.settings.settingsBackup.search.exportTitle',
      'Export settings'
    ),
    description: translate(
      'auto.components.settings.settingsBackup.search.exportDescription',
      'Save your preferences to a JSON file. Secrets and machine-specific paths are left out.'
    ),
    keywords: [
      ...sharedKeywords(),
      ...translateSearchKeyword('auto.components.settings.settingsBackup.search.export', 'export'),
      ...translateSearchKeyword('auto.components.settings.settingsBackup.search.save', 'save'),
      ...translateSearchKeyword('auto.components.settings.settingsBackup.search.migrate', 'migrate')
    ]
  },
  {
    title: translate(
      'auto.components.settings.settingsBackup.search.importTitle',
      'Import settings'
    ),
    description: translate(
      'auto.components.settings.settingsBackup.search.importDescription',
      'Load a settings file exported from Muster. Unrecognised files are rejected.'
    ),
    keywords: [
      ...sharedKeywords(),
      ...translateSearchKeyword('auto.components.settings.settingsBackup.search.import', 'import'),
      ...translateSearchKeyword('auto.components.settings.settingsBackup.search.load', 'load'),
      ...translateSearchKeyword(
        'auto.components.settings.settingsBackup.search.transfer',
        'transfer'
      )
    ]
  }
])

export const getHiddenSettingsSectionsSearchEntry = createLocalizedCatalog(
  (): SettingsSearchEntry => ({
    title: translate(
      'auto.components.settings.hiddenSections.search.title',
      'Show hidden settings pages'
    ),
    description: translate(
      'auto.components.settings.hiddenSections.search.description',
      'Restore the Orchestration and Mobile pages this build hides by default.'
    ),
    keywords: [
      ...translateSearchKeyword('auto.components.settings.hiddenSections.search.hidden', 'hidden'),
      ...translateSearchKeyword('auto.components.settings.hiddenSections.search.show', 'show'),
      ...translateSearchKeyword('auto.components.settings.hiddenSections.search.pages', 'pages'),
      ...translateSearchKeyword(
        'auto.components.settings.hiddenSections.search.orchestration',
        'orchestration'
      ),
      ...translateSearchKeyword('auto.components.settings.hiddenSections.search.mobile', 'mobile')
    ]
  })
)
