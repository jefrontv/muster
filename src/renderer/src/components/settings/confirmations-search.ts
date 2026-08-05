// Settings-search entries for the Confirmations section of the General pane. Each destructive
// prompt gets its own entry so searching "delete worktree" lands on the switch that controls it.
//
// Keyed rather than positional: the section renders one row per key, so a row and its search entry
// cannot drift apart the way an index into a flat array can.

import type { SettingsSearchEntry } from './settings-search'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'
import { translate } from '@/i18n/i18n'
import { translateSearchKeyword } from './settings-search-keywords'

export type ConfirmationSearchKey =
  | 'section'
  | 'deleteWorkspace'
  | 'closeBusyTerminal'
  | 'deleteAutomation'
  | 'codexRateLimitReset'
  | 'closePinnedTab'

const sharedKeywords = (): string[] => [
  ...translateSearchKeyword('auto.components.settings.confirmations.search.confirm', 'confirm'),
  ...translateSearchKeyword(
    'auto.components.settings.confirmations.search.confirmation',
    'confirmation'
  ),
  ...translateSearchKeyword('auto.components.settings.confirmations.search.prompt', 'prompt'),
  ...translateSearchKeyword('auto.components.settings.confirmations.search.warning', 'warning'),
  ...translateSearchKeyword('auto.components.settings.confirmations.search.dialog', 'dialog')
]

export const getConfirmationSearchEntry = createLocalizedCatalog(
  (): Record<ConfirmationSearchKey, SettingsSearchEntry> => ({
    section: {
      title: translate(
        'auto.components.settings.confirmations.search.sectionTitle',
        'Confirmations'
      ),
      description: translate(
        'auto.components.settings.confirmations.search.sectionDescription',
        'Every "are you sure?" prompt you can turn off, in one place.'
      ),
      keywords: [
        ...sharedKeywords(),
        ...translateSearchKeyword('auto.components.settings.confirmations.search.skip', 'skip'),
        ...translateSearchKeyword(
          'auto.components.settings.confirmations.search.doNotAsk',
          'do not ask again'
        ),
        ...translateSearchKeyword('auto.components.settings.confirmations.search.reset', 'reset')
      ]
    },
    deleteWorkspace: {
      title: translate(
        'auto.components.settings.confirmations.search.deleteWorkspaceTitle',
        'Confirm before deleting a workspace'
      ),
      description: translate(
        'auto.components.settings.confirmations.search.deleteWorkspaceDescription',
        'Deleting a workspace removes its working directory from disk.'
      ),
      keywords: [
        ...sharedKeywords(),
        ...translateSearchKeyword('auto.components.settings.confirmations.search.delete', 'delete'),
        ...translateSearchKeyword(
          'auto.components.settings.confirmations.search.worktree',
          'worktree'
        ),
        ...translateSearchKeyword(
          'auto.components.settings.confirmations.search.workspace',
          'workspace'
        )
      ]
    },
    closeBusyTerminal: {
      title: translate(
        'auto.components.settings.confirmations.search.closeTerminalTitle',
        'Confirm before closing a busy terminal'
      ),
      description: translate(
        'auto.components.settings.confirmations.search.closeTerminalDescription',
        'Closing a terminal with running processes kills whatever is in the foreground.'
      ),
      keywords: [
        ...sharedKeywords(),
        ...translateSearchKeyword(
          'auto.components.settings.confirmations.search.terminal',
          'terminal'
        ),
        ...translateSearchKeyword('auto.components.settings.confirmations.search.close', 'close'),
        ...translateSearchKeyword(
          'auto.components.settings.confirmations.search.process',
          'process'
        )
      ]
    },
    deleteAutomation: {
      title: translate(
        'auto.components.settings.confirmations.search.deleteAutomationTitle',
        'Confirm before deleting an automation'
      ),
      description: translate(
        'auto.components.settings.confirmations.search.deleteAutomationDescription',
        'Deleting an automation also discards its run history.'
      ),
      keywords: [
        ...sharedKeywords(),
        ...translateSearchKeyword(
          'auto.components.settings.confirmations.search.automation',
          'automation'
        ),
        ...translateSearchKeyword('auto.components.settings.confirmations.search.delete', 'delete')
      ]
    },
    codexRateLimitReset: {
      title: translate(
        'auto.components.settings.confirmations.search.codexResetTitle',
        'Confirm before resetting a Codex rate limit'
      ),
      description: translate(
        'auto.components.settings.confirmations.search.codexResetDescription',
        'A reset spends a scarce credit on the live account.'
      ),
      keywords: [
        ...sharedKeywords(),
        ...translateSearchKeyword('auto.components.settings.confirmations.search.codex', 'codex', {
          englishOnly: true
        }),
        ...translateSearchKeyword(
          'auto.components.settings.confirmations.search.rateLimit',
          'rate limit'
        )
      ]
    },
    closePinnedTab: {
      title: translate(
        'auto.components.settings.confirmations.search.pinnedTabTitle',
        'Confirm before closing a pinned tab'
      ),
      description: translate(
        'auto.components.settings.confirmations.search.pinnedTabDescription',
        'Pinned tabs can still be closed from the keyboard and the native menu.'
      ),
      keywords: [
        ...sharedKeywords(),
        ...translateSearchKeyword('auto.components.settings.confirmations.search.pinned', 'pinned'),
        ...translateSearchKeyword('auto.components.settings.confirmations.search.tab', 'tab')
      ]
    }
  })
)

export const getConfirmationsSearchEntries = createLocalizedCatalog((): SettingsSearchEntry[] =>
  Object.values(getConfirmationSearchEntry())
)
