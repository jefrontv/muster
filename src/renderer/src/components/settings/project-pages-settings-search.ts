import { translate } from '@/i18n/i18n'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'
import type { SettingsSearchEntry } from './settings-search'

export const getProjectPagesPaneSearchEntries = createLocalizedCatalog(() => {
  const keywords = ['pages', 'docs', 'notes', 'wiki', 'diagrams', 'notion']
  return {
    enabled: {
      title: translate('auto.components.settings.pages.enabled.title', 'Pages'),
      description: translate(
        'auto.components.settings.pages.enabled.description',
        'Docs, checklists and diagrams for each project that you and your agents can read and edit.'
      ),
      keywords: [...keywords, 'turn off', 'disable']
    },
    openIn: {
      title: translate('auto.components.settings.pages.openIn.title', 'Open pages in'),
      description: translate(
        'auto.components.settings.pages.openIn.description',
        'Where a page you pick in the right sidebar opens.'
      ),
      keywords: [...keywords, 'tab', 'side panel']
    },
    agentDots: {
      title: translate(
        'auto.components.settings.pages.agentDots.title',
        'Show when agents change a page'
      ),
      description: translate(
        'auto.components.settings.pages.agentDots.description',
        'A dot on each page an agent changed since you last opened it, and a count on the Pages icon.'
      ),
      keywords: [...keywords, 'notification', 'badge', 'unread', 'dot']
    },
    intro: {
      title: translate('auto.components.settings.pages.intro.title', 'Pages introduction'),
      description: translate(
        'auto.components.settings.pages.intro.description',
        'Show the "Introducing Muster Pages" window again the next time Muster starts.'
      ),
      keywords: [...keywords, 'intro', 'welcome']
    }
  }
})

export function getProjectPagesSearchEntryList(): SettingsSearchEntry[] {
  return Object.values(getProjectPagesPaneSearchEntries())
}
