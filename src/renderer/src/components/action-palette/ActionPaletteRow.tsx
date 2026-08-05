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
      <span className="truncate text-foreground">{entry.title}</span>
      <span className="truncate text-muted-foreground">{entry.detail}</span>
      <span className="ml-auto flex shrink-0 items-center gap-2">
        {revealsShortcut ? (
          <span className="text-[11px] text-muted-foreground/70">
            {translate(
              'auto.components.action.palette.ActionPaletteRow.revealShortcut',
              'Shortcut'
            )}
          </span>
        ) : null}
        {combo !== null && combo.keys.length > 0 ? (
          <ShortcutKeyCombo
            keys={combo.keys}
            doubleTap={combo.doubleTap}
            keyCapClassName="min-w-0 px-1 py-0 text-[10px] shadow-none"
            separatorClassName="text-[10px] text-muted-foreground"
          />
        ) : null}
      </span>
    </CommandItem>
  )
}
