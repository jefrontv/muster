import { describe, expect, it } from 'vitest'
import { Terminal } from 'lucide-react'
import {
  buildActionPaletteCommandEntries,
  buildActionPaletteEntries,
  buildActionPaletteSettingsEntries
} from './action-palette-entries'
import type { CmdJQuickAction } from '../cmd-j/quick-actions'
import type { KeybindingActionId, KeybindingDefinition } from '../../../../shared/keybindings'
import type { SettingsNavSection } from '@/lib/settings-navigation-types'

function makeQuickAction(id: string, available = true): CmdJQuickAction {
  return {
    id,
    kind: 'action',
    title: `Title ${id}`,
    description: `Description ${id}`,
    icon: Terminal,
    verbKeywords: [`verb-${id}`],
    isAvailable: () => (available ? { available: true } : { available: false, reason: 'loading' }),
    run: async () => ({ status: 'ok' })
  }
}

function makeDefinition(
  id: KeybindingActionId,
  overrides: Partial<KeybindingDefinition> = {}
): KeybindingDefinition {
  return {
    id,
    title: `Command ${id}`,
    group: 'Global',
    scope: 'global',
    searchKeywords: ['keyword'],
    defaultBindings: { darwin: [], linux: [], win32: [] },
    ...overrides
  }
}

function makeSection(overrides: Partial<SettingsNavSection> = {}): SettingsNavSection {
  return {
    id: 'terminal',
    title: 'Terminal',
    description: 'Terminal settings',
    icon: Terminal,
    searchEntries: [],
    group: 'workbench',
    ...overrides
  }
}

describe('buildActionPaletteCommandEntries', () => {
  it('never lists the palette that is currently open', () => {
    const entries = buildActionPaletteCommandEntries(
      [makeDefinition('app.actionPalette'), makeDefinition('app.settings')],
      () => true
    )

    expect(entries.map((entry) => entry.id)).toEqual(['command:app.settings'])
  })

  it('marks pane-scoped commands as not invocable so the row can reveal the shortcut', () => {
    const [invocable, paneScoped] = buildActionPaletteCommandEntries(
      [
        makeDefinition('app.settings'),
        makeDefinition('terminal.splitRight', { scope: 'terminal' })
      ],
      (actionId) => actionId === 'app.settings'
    )

    expect(invocable).toMatchObject({ target: 'command', invocable: true })
    expect(paneScoped).toMatchObject({ target: 'command', invocable: false })
  })

  it('searches the shortcut group alongside the registry keywords', () => {
    const [entry] = buildActionPaletteCommandEntries(
      [makeDefinition('terminal.splitRight', { group: 'Terminal Panes' })],
      () => true
    )

    expect(entry.detail).toBe('Terminal Panes')
    expect(entry.keywords).toEqual(['Terminal Panes', 'keyword'])
  })
})

describe('buildActionPaletteSettingsEntries', () => {
  it('renders a pane row and one row per targeted search entry', () => {
    const entries = buildActionPaletteSettingsEntries([
      makeSection({
        searchEntries: [
          { title: 'Font Size', targetSectionId: 'terminal-font' },
          { title: 'Untargeted' }
        ]
      })
    ])

    expect(entries.map((entry) => [entry.title, entry.detail])).toEqual([
      ['Terminal', 'Terminal'],
      ['Font Size', 'Terminal › Font Size']
    ])
  })

  it('puts the settings path in the search corpus', () => {
    const [, targeted] = buildActionPaletteSettingsEntries([
      makeSection({
        searchEntries: [
          { title: 'Font Size', targetSectionId: 'terminal-font', cmdJKeywords: ['typeface'] }
        ]
      })
    ])

    expect(targeted.keywords).toContain('Terminal › Font Size')
    expect(targeted.keywords).toContain('typeface')
    expect(targeted.keybindingActionId).toBeNull()
  })
})

describe('buildActionPaletteEntries', () => {
  it('drops the command row a quick action already covers and links its chord', () => {
    const entries = buildActionPaletteEntries({
      quickActions: [makeQuickAction('new-terminal-tab')],
      settingsSections: [],
      definitions: [makeDefinition('tab.newTerminal'), makeDefinition('app.settings')],
      isQuickActionAvailable: (action) => action.isAvailable({} as never).available,
      isCommandInvocable: () => true
    })

    expect(entries.map((entry) => entry.id)).toEqual([
      'action:new-terminal-tab',
      'command:app.settings'
    ])
    expect(entries[0].keybindingActionId).toBe('tab.newTerminal')
  })

  it('omits unavailable quick actions but keeps the command that shares their chord', () => {
    const entries = buildActionPaletteEntries({
      quickActions: [makeQuickAction('new-terminal-tab', false)],
      settingsSections: [],
      definitions: [makeDefinition('tab.newTerminal')],
      isQuickActionAvailable: (action) => action.isAvailable({} as never).available,
      isCommandInvocable: () => true
    })

    expect(entries.map((entry) => entry.id)).toEqual(['command:tab.newTerminal'])
  })

  it('orders actions before commands before settings', () => {
    const entries = buildActionPaletteEntries({
      quickActions: [makeQuickAction('open-sites')],
      settingsSections: [makeSection()],
      definitions: [makeDefinition('app.settings')],
      isQuickActionAvailable: () => true,
      isCommandInvocable: () => true
    })

    expect(entries.map((entry) => entry.group)).toEqual(['action', 'command', 'settings'])
  })

  it('honors an explicit hidden-command list', () => {
    const entries = buildActionPaletteEntries({
      quickActions: [],
      settingsSections: [],
      definitions: [makeDefinition('app.settings'), makeDefinition('view.tasks')],
      isQuickActionAvailable: () => true,
      isCommandInvocable: () => true,
      hiddenCommandActionIds: new Set<KeybindingActionId>(['view.tasks'])
    })

    expect(entries.map((entry) => entry.id)).toEqual(['command:app.settings'])
  })
})
