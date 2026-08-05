import type { ComponentType } from 'react'
import type { LucideProps } from 'lucide-react'
import { Keyboard } from 'lucide-react'
import {
  KEYBINDING_DEFINITIONS,
  type KeybindingActionId,
  type KeybindingDefinition
} from '../../../../shared/keybindings'
import type { SettingsNavSection } from '@/lib/settings-navigation-types'
import type { CmdJQuickAction } from '../cmd-j/quick-actions'
import { buildCmdJSettingsResults, type CmdJSettingsResult } from '../cmd-j/palette-results'

export type ActionPaletteIcon = ComponentType<LucideProps>

export type ActionPaletteGroup = 'action' | 'command' | 'settings'

/** Group order doubles as the empty-query sort key, so actions stay above commands and settings. */
const GROUP_ORDER: Record<ActionPaletteGroup, number> = { action: 0, command: 1, settings: 2 }

type ActionPaletteEntryBase = {
  id: string
  group: ActionPaletteGroup
  groupOrder: number
  title: string
  /** Secondary line — the shortcut group for commands, the Settings path for panes. */
  detail: string
  icon: ActionPaletteIcon
  /** Chord to display; null when the entry has no remappable shortcut of its own. */
  keybindingActionId: KeybindingActionId | null
  keywords: readonly string[]
  order: number
}

export type ActionPaletteEntry = ActionPaletteEntryBase &
  (
    | { target: 'quick-action'; quickAction: CmdJQuickAction }
    | {
        target: 'command'
        commandActionId: KeybindingActionId
        /** False → the chord needs a focused pane, so selecting reveals it in Settings → Shortcuts. */
        invocable: boolean
      }
    | { target: 'settings'; settings: CmdJSettingsResult }
  )

/**
 * Links a Cmd+J quick action to the shortcut that already triggers it. Keeps the
 * palette from listing the same verb twice and lets the action row show a chord.
 */
export const QUICK_ACTION_KEYBINDING_IDS: Readonly<Record<string, KeybindingActionId>> = {
  'new-terminal-tab': 'tab.newTerminal',
  'new-browser-tab': 'tab.newBrowser',
  'new-markdown-file': 'tab.newMarkdown',
  'create-workspace': 'workspace.create',
  'delete-workspace': 'workspace.delete'
}

export function buildActionPaletteQuickActionEntries(
  actions: readonly CmdJQuickAction[],
  isAvailable: (action: CmdJQuickAction) => boolean
): ActionPaletteEntry[] {
  const entries: ActionPaletteEntry[] = []
  for (const [index, action] of actions.entries()) {
    if (!isAvailable(action)) {
      continue
    }
    entries.push({
      id: `action:${action.id}`,
      group: 'action',
      groupOrder: GROUP_ORDER.action,
      title: action.title,
      detail: action.description,
      icon: action.icon,
      keybindingActionId: QUICK_ACTION_KEYBINDING_IDS[action.id] ?? null,
      keywords: action.verbKeywords,
      order: index,
      target: 'quick-action',
      quickAction: action
    })
  }
  return entries
}

export function buildActionPaletteCommandEntries(
  definitions: readonly KeybindingDefinition[],
  isInvocable: (actionId: KeybindingActionId) => boolean,
  hiddenActionIds: ReadonlySet<KeybindingActionId> = new Set()
): ActionPaletteEntry[] {
  const entries: ActionPaletteEntry[] = []
  for (const [index, definition] of definitions.entries()) {
    // Opening the palette from inside the palette is a no-op the user can't undo cheaply.
    if (definition.id === 'app.actionPalette' || hiddenActionIds.has(definition.id)) {
      continue
    }
    entries.push({
      id: `command:${definition.id}`,
      group: 'command',
      groupOrder: GROUP_ORDER.command,
      title: definition.title,
      detail: definition.group,
      icon: Keyboard,
      keybindingActionId: definition.id,
      keywords: [definition.group, ...definition.searchKeywords],
      order: index,
      target: 'command',
      commandActionId: definition.id,
      invocable: isInvocable(definition.id)
    })
  }
  return entries
}

export function buildActionPaletteSettingsEntries(
  sections: readonly SettingsNavSection[]
): ActionPaletteEntry[] {
  const paneTitles = new Map(sections.map((section) => [section.id, section.title]))
  return buildCmdJSettingsResults(sections).map((result) => {
    const paneTitle = paneTitles.get(result.sectionId) ?? result.sectionId
    // The path is part of the search corpus so "terminal font" finds Appearance → Terminal Font.
    const path = result.targetSectionId ? `${paneTitle} › ${result.title}` : paneTitle
    return {
      id: `settings:${result.id}`,
      group: 'settings',
      groupOrder: GROUP_ORDER.settings,
      title: result.title,
      detail: path,
      icon: result.icon,
      keybindingActionId: null,
      keywords: [path, ...result.configKeywords],
      order: result.order,
      target: 'settings',
      settings: result
    }
  })
}

export function buildActionPaletteEntries({
  quickActions,
  settingsSections,
  definitions = KEYBINDING_DEFINITIONS,
  isQuickActionAvailable,
  isCommandInvocable,
  hiddenCommandActionIds
}: {
  quickActions: readonly CmdJQuickAction[]
  settingsSections: readonly SettingsNavSection[]
  definitions?: readonly KeybindingDefinition[]
  isQuickActionAvailable: (action: CmdJQuickAction) => boolean
  isCommandInvocable: (actionId: KeybindingActionId) => boolean
  hiddenCommandActionIds?: ReadonlySet<KeybindingActionId>
}): ActionPaletteEntry[] {
  const actionEntries = buildActionPaletteQuickActionEntries(quickActions, isQuickActionAvailable)
  const claimedByActions = new Set<KeybindingActionId>(
    actionEntries.flatMap((entry) =>
      entry.keybindingActionId === null ? [] : [entry.keybindingActionId]
    )
  )
  for (const actionId of hiddenCommandActionIds ?? []) {
    claimedByActions.add(actionId)
  }

  return [
    ...actionEntries,
    ...buildActionPaletteCommandEntries(definitions, isCommandInvocable, claimedByActions),
    ...buildActionPaletteSettingsEntries(settingsSections)
  ]
}
