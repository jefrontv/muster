import React, { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandList
} from '@/components/ui/command'
import { useModalReturnFocus } from '@/hooks/useModalReturnFocus'
import { useSettingsNavigationMetadata } from '@/hooks/useSettingsNavigationMetadata'
import { getCmdJQuickActions } from '@/components/cmd-j/quick-actions'
import { getUnavailableQuickActionMessage } from '@/components/cmd-j/quick-action-context'
import { getSettingsTargetFromSectionId } from '@/components/cmd-j/settings-nav-target'
import { translate } from '@/i18n/i18n'
import {
  buildActionPaletteEntries,
  type ActionPaletteEntry,
  type ActionPaletteGroup
} from '@/components/action-palette/action-palette-entries'
import { selectActionPaletteResults } from '@/components/action-palette/action-palette-search'
import {
  ACTION_PALETTE_INVOKERS,
  isActionPaletteCommandInvocable
} from '@/components/action-palette/action-palette-invokers'
import { ActionPaletteRow } from '@/components/action-palette/ActionPaletteRow'
import { useActionPaletteQuickActionContext } from '@/components/action-palette/use-quick-action-context'

const GROUP_RENDER_ORDER: readonly ActionPaletteGroup[] = ['action', 'command', 'settings']

function FooterKey({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <span className="rounded-full border border-border/60 bg-muted/35 px-2 py-0.5 text-[10px] font-medium text-foreground/85">
      {children}
    </span>
  )
}

export default function ActionPalette(): React.JSX.Element | null {
  // Why: subscribe to language changes so the translated group headings recompute.
  useTranslation()
  const visible = useAppStore((s) => s.activeModal === 'action-palette')
  const closeModal = useAppStore((s) => s.closeModal)
  const keybindings = useAppStore((s) => s.keybindings)
  const openSettingsPage = useAppStore((s) => s.openSettingsPage)
  const openSettingsTarget = useAppStore((s) => s.openSettingsTarget)
  const settingsSections = useSettingsNavigationMetadata()
  const buildQuickActionContext = useActionPaletteQuickActionContext()

  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const { captureReturnFocus, skipReturnFocus } = useModalReturnFocus(visible)

  const [previousVisible, setPreviousVisible] = useState(visible)
  if (visible !== previousVisible) {
    setPreviousVisible(visible)
    if (visible) {
      setQuery('')
    }
  }

  const entries = useMemo(() => {
    // Availability (active workspace, SSH state) is only meaningful at open time, and
    // building hundreds of rows on every app render while closed is pure waste.
    if (!visible) {
      return []
    }
    const quickActionContext = buildQuickActionContext()
    return buildActionPaletteEntries({
      quickActions: getCmdJQuickActions(),
      settingsSections,
      isQuickActionAvailable: (action) => action.isAvailable(quickActionContext).available,
      isCommandInvocable: isActionPaletteCommandInvocable
    })
  }, [buildQuickActionContext, settingsSections, visible])

  const results = useMemo(
    () => selectActionPaletteResults(deferredQuery, entries),
    [deferredQuery, entries]
  )
  const hasQuery = deferredQuery.trim().length > 0

  // Why: with shouldFilter={false} cmdk keeps its previous selection when the
  // externally-filtered result set changes, so it can point at a row that no
  // longer renders — leaving Enter with no target. Re-anchor to the top hit on
  // every query change so type-then-Enter always runs the first result.
  const [selectedValue, setSelectedValue] = useState('')
  const topEntryId = results.entries[0]?.id ?? ''
  useEffect(() => {
    setSelectedValue(topEntryId)
  }, [deferredQuery, topEntryId])

  const runEntry = useCallback(
    (entry: ActionPaletteEntry) => {
      switch (entry.target) {
        case 'quick-action': {
          const context = buildQuickActionContext()
          void entry.quickAction.run(context).then((result) => {
            if (result.status === 'unavailable') {
              toast.error(getUnavailableQuickActionMessage(entry.quickAction.title, result.reason))
            }
          })
          return
        }
        case 'command': {
          const invoke = ACTION_PALETTE_INVOKERS[entry.commandActionId]
          if (invoke) {
            invoke(useAppStore.getState())
            return
          }
          // Pane-scoped chords need the focus the palette just took, so show where
          // the shortcut lives instead of firing it into the wrong surface.
          openSettingsTarget({ pane: 'shortcuts', repoId: null })
          openSettingsPage()
          return
        }
        case 'settings': {
          const target = getSettingsTargetFromSectionId(entry.settings.sectionId)
          if (entry.settings.targetSectionId) {
            target.sectionId = entry.settings.targetSectionId
          }
          openSettingsTarget(target)
          openSettingsPage()
        }
      }
    },
    [buildQuickActionContext, openSettingsPage, openSettingsTarget]
  )

  const handleSelect = useCallback(
    (entry: ActionPaletteEntry) => {
      skipReturnFocus()
      closeModal()
      setQuery('')
      runEntry(entry)
    },
    [closeModal, runEntry, skipReturnFocus]
  )

  const groupHeadings: Record<ActionPaletteGroup, string> = {
    action: translate('auto.components.ActionPalette.groupActions', 'Actions'),
    command: translate('auto.components.ActionPalette.groupCommands', 'Commands'),
    settings: translate('auto.components.ActionPalette.groupSettings', 'Settings')
  }

  return (
    <CommandDialog
      open={visible}
      onOpenChange={(open) => {
        if (!open) {
          closeModal()
        }
      }}
      shouldFilter={false}
      commandProps={{ value: selectedValue, onValueChange: setSelectedValue }}
      onOpenAutoFocus={captureReturnFocus}
      onCloseAutoFocus={(e) => e.preventDefault()}
      title={translate('auto.components.ActionPalette.title', 'Command palette')}
      description={translate(
        'auto.components.ActionPalette.description',
        'Run a command or jump to a setting'
      )}
    >
      <CommandInput
        placeholder={translate(
          'auto.components.ActionPalette.placeholder',
          'Run a command or jump to a setting...'
        )}
        value={query}
        onValueChange={setQuery}
      />
      <CommandList className="p-2">
        {results.entries.length === 0 ? (
          <CommandEmpty>
            {translate('auto.components.ActionPalette.empty', 'No matching commands.')}
          </CommandEmpty>
        ) : hasQuery ? (
          results.entries.map((entry) => (
            <ActionPaletteRow
              key={entry.id}
              entry={entry}
              keybindings={keybindings}
              onSelect={handleSelect}
            />
          ))
        ) : (
          GROUP_RENDER_ORDER.map((group) => {
            const groupEntries = results.entries.filter((entry) => entry.group === group)
            if (groupEntries.length === 0) {
              return null
            }
            return (
              <CommandGroup key={group} heading={groupHeadings[group]}>
                {groupEntries.map((entry) => (
                  <ActionPaletteRow
                    key={entry.id}
                    entry={entry}
                    keybindings={keybindings}
                    onSelect={handleSelect}
                  />
                ))}
              </CommandGroup>
            )
          })
        )}
      </CommandList>
      <div className="flex items-center justify-between border-t border-border/60 px-3.5 py-2.5 text-[11px] text-muted-foreground/82">
        <span>
          {results.hiddenCount > 0
            ? translate(
                'auto.components.ActionPalette.hiddenCount',
                'Type to search {{value0}} more',
                { value0: results.hiddenCount }
              )
            : ''}
        </span>
        <div className="flex items-center gap-2">
          <FooterKey>{translate('auto.components.ActionPalette.keyEnter', 'Enter')}</FooterKey>
          <span>{translate('auto.components.ActionPalette.hintRun', 'Run')}</span>
          <FooterKey>{translate('auto.components.ActionPalette.keyEsc', 'Esc')}</FooterKey>
          <span>{translate('auto.components.ActionPalette.hintClose', 'Close')}</span>
          <FooterKey>↑↓</FooterKey>
          <span>{translate('auto.components.ActionPalette.hintMove', 'Move')}</span>
        </div>
      </div>
      <div aria-live="polite" className="sr-only">
        {hasQuery
          ? translate('auto.components.ActionPalette.resultCount', '{{value0}} results found', {
              value0: results.entries.length
            })
          : ''}
      </div>
    </CommandDialog>
  )
}
