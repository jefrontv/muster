import { translate } from '@/i18n/i18n'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'
import { translateSearchKeyword } from './settings-search-keywords'
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
      keywords: [
        ...keywords,
        ...translateSearchKeyword('auto.components.settings.pages.keyword.turnOff', 'turn off'),
        ...translateSearchKeyword('auto.components.settings.pages.keyword.disable', 'disable')
      ]
    },
    openIn: {
      title: translate('auto.components.settings.pages.openIn.title', 'Open pages in'),
      description: translate(
        'auto.components.settings.pages.openIn.description',
        'Where a page you pick in the right sidebar opens.'
      ),
      keywords: [
        ...keywords,
        ...translateSearchKeyword('auto.components.settings.pages.keyword.tab', 'tab'),
        ...translateSearchKeyword('auto.components.settings.pages.keyword.sidePanel', 'side panel')
      ]
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
      keywords: [
        ...keywords,
        ...translateSearchKeyword(
          'auto.components.settings.pages.keyword.notification',
          'notification'
        ),
        ...translateSearchKeyword('auto.components.settings.pages.keyword.badge', 'badge'),
        ...translateSearchKeyword('auto.components.settings.pages.keyword.unread', 'unread'),
        ...translateSearchKeyword('auto.components.settings.pages.keyword.dot', 'dot')
      ]
    },
    outline: {
      title: translate('auto.components.settings.pages.outline.title', 'Show page outline'),
      description: translate(
        'auto.components.settings.pages.outline.description',
        'A rail of headings on the right of pages with two or more headings.'
      ),
      keywords: [
        ...keywords,
        ...translateSearchKeyword('auto.components.settings.pages.keyword.outline', 'outline'),
        ...translateSearchKeyword(
          'auto.components.settings.pages.keyword.toc',
          'table of contents'
        ),
        ...translateSearchKeyword('auto.components.settings.pages.keyword.tocShort', 'toc'),
        ...translateSearchKeyword('auto.components.settings.pages.keyword.headings', 'headings')
      ]
    },
    intro: {
      title: translate('auto.components.settings.pages.intro.title', 'Pages introduction'),
      description: translate(
        'auto.components.settings.pages.intro.description',
        'Show the "Introducing Muster Pages" window again the next time Muster starts.'
      ),
      keywords: [
        ...keywords,
        ...translateSearchKeyword('auto.components.settings.pages.keyword.intro', 'intro'),
        ...translateSearchKeyword('auto.components.settings.pages.keyword.welcome', 'welcome')
      ]
    }
  }
})

export function getProjectPagesSearchEntryList(): SettingsSearchEntry[] {
  return Object.values(getProjectPagesPaneSearchEntries())
}
