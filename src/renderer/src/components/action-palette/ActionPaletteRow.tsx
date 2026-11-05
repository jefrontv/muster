import React from 'react'
import { CommandItem } from '@/components/ui/command'
import { ShortcutKeyCombo } from '@/components/ShortcutKeyCombo'
import { formatShortcutKeyComboDetails } from '@/hooks/useShortcutLabel'
import type { KeybindingOverrides } from '../../../../shared/keybindings'
import { translate } from '@/i18n/i18n'
import type { ActionPaletteEntry } from './action-palette-entries'

export function ActionPaletteRow({
  entry,
  keybindings,
  onSelect
}: {
  entry: ActionPaletteEntry
  keybindings: KeybindingOverrides
  onSelect: (entry: ActionPaletteEntry) => void
}): React.JSX.Element {
  const Icon = entry.icon
  const combo =
    entry.keybindingActionId === null
      ? null
      : (formatShortcutKeyComboDetails(entry.keybindingActionId, keybindings)[0] ?? null)
  const revealsShortcut = entry.target === 'command' && !entry.invocable

  return (
    <CommandItem
      value={entry.id}
      onSelect={() => onSelect(entry)}
      className="flex items-center gap-2.5 px-3 py-1.5"
    >
      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 truncate text-foreground">{entry.title}</span>
      {entry.detail ? (
        // Shrinks first, so the description ellipsizes before the title loses a character.
        <span className="min-w-0 shrink-[1000] truncate text-muted-foreground">{entry.detail}</span>
      ) : null}
      <span className="ml-auto flex shrink-0 items-center gap-2">
        {revealsShortcut ? (
          <span className="text-xs text-muted-foreground">
            {translate(
              'auto.components.action.palette.ActionPaletteRow.revealShortcut',
              'Shows shortcut'
            )}
          </span>
        ) : null}
        {combo !== null && combo.keys.length > 0 ? (
          <ShortcutKeyCombo
            keys={combo.keys}
            doubleTap={combo.doubleTap}
            keyCapClassName="min-w-0 px-1 py-0 text-[11px] shadow-none"
            separatorClassName="text-[11px] text-muted-foreground"
          />
        ) : null}
      </span>
    </CommandItem>
  )
}
