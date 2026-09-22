// Settings → Extensions: what skills, MCP servers and tools are installed for the user's harnesses,
// which of them have moved on, and one place to do something about it.

import { useCallback, useMemo, useState } from 'react'
import { Blocks, RefreshCw, Search } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { ExtensionHarnessId } from '../../../../shared/extension-catalog-types'
import { publishExtensionInventory, useExtensionInventory } from '@/hooks/useExtensionInventory'
import { useExtensionPreferences } from '@/hooks/useExtensionPreferences'
import {
  countExtensionsByTab,
  DEFAULT_EXTENSION_FILTER,
  filterExtensions,
  sortExtensionsByUrgency,
  type ExtensionFilterState,
  type ExtensionTab
} from '../extensions/extension-filter'
import { ExtensionTile } from './extension-tile'
import { ExtensionDetailDialog } from './extension-detail-dialog'
import { SettingsSwitchRow } from './SettingsFormControls'
export { getExtensionsPaneSearchEntries } from './extensions-search'

const TAB_ORDER: ExtensionTab[] = ['tools', 'skills']

function tabLabel(tab: ExtensionTab): string {
  return tab === 'tools'
    ? translate('auto.components.settings.extensions.tab_tools', 'Tools')
    : translate('auto.components.settings.extensions.tab_skills', 'Skills')
}

export function ExtensionsPane(): React.JSX.Element {
  const { inventory, loading, error, refresh } = useExtensionInventory()
  const preferences = useExtensionPreferences()
  const [filter, setFilter] = useState<ExtensionFilterState>(DEFAULT_EXTENSION_FILTER)
  const [busyHarness, setBusyHarness] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)

  // Why memoized: the `?? []` fallback is a fresh array each render, which would recompute both
  // derivations below on every keystroke in the search box.
  const entries = useMemo(() => inventory?.entries ?? [], [inventory])
  const counts = useMemo(() => countExtensionsByTab(entries, filter.query), [entries, filter.query])
  const visible = useMemo(
    () => sortExtensionsByUrgency(filterExtensions(entries, filter)),
    [entries, filter]
  )
  // Why read from `entries` and not hold the item: the dialog must show the state the last scan
  // produced, including the version a just-finished install wrote.
  const openItem = useMemo(
    () => entries.find(({ entry }) => entry.id === openId) ?? null,
    [entries, openId]
  )

  const writeHarness = useCallback(
    async (
      id: string,
      harnessId: ExtensionHarnessId,
      mode: 'install' | 'uninstall'
    ): Promise<void> => {
      setBusyHarness(`${id}:${harnessId}`)
      try {
        const result =
          mode === 'install'
            ? await window.api.extensions.installHarness({ id, harnessId })
            : await window.api.extensions.uninstallHarness({ id, harnessId })
        if (result.ok) {
          publishExtensionInventory(result.value)
        } else {
          toast.error(result.error)
        }
      } finally {
        setBusyHarness(null)
      }
    },
    []
  )

  return (
    <div className="space-y-4">
      <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
        {translate(
          'auto.components.settings.extensions.intro',
          'Muster checks what each of your coding harnesses has installed on this machine, and what version has been published.'
        )}
      </p>

      <SettingsSwitchRow
        label={translate(
          'auto.components.settings.extensions.master_auto_update',
          'Update extensions automatically'
        )}
        description={translate(
          'auto.components.settings.extensions.master_auto_update_hint',
          'Applies at launch, for extensions that can update without asking you anything. Sets the default for what you install next; the switch on each extension wins.'
        )}
        checked={preferences.master}
        onChange={() => void preferences.setMaster(!preferences.master)}
      />

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <div
          className="inline-flex shrink-0 rounded-md border border-border p-0.5"
          role="tablist"
          aria-label={translate('auto.components.settings.extensions.tabs_label', 'Extension kind')}
        >
          {TAB_ORDER.map((tab) => (
            <Button
              key={tab}
              type="button"
              role="tab"
              aria-selected={filter.tab === tab}
              size="xs"
              variant={filter.tab === tab ? 'secondary' : 'ghost'}
              className="gap-1.5 px-2.5"
              onClick={() => setFilter((next) => ({ ...next, tab }))}
            >
              {tabLabel(tab)}
              <span className="text-[11px] tabular-nums text-muted-foreground">{counts[tab]}</span>
            </Button>
          ))}
        </div>

        <div className="relative min-w-[10rem] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filter.query}
            onChange={(event) => setFilter((next) => ({ ...next, query: event.target.value }))}
            placeholder={translate(
              'auto.components.settings.extensions.search_placeholder',
              'Search extensions'
            )}
            className="h-8 pl-8 text-sm"
          />
        </div>

        <Select
          value={filter.status}
          onValueChange={(value) =>
            setFilter((next) => ({ ...next, status: value as ExtensionFilterState['status'] }))
          }
        >
          <SelectTrigger className="h-8 w-[9.5rem] shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              {translate('auto.components.settings.extensions.filter_all', 'Everything')}
            </SelectItem>
            <SelectItem value="updates">
              {translate('auto.components.settings.extensions.filter_updates', 'Needs updating')}
            </SelectItem>
            <SelectItem value="installed">
              {translate('auto.components.settings.extensions.filter_installed', 'Installed')}
            </SelectItem>
            <SelectItem value="available">
              {translate('auto.components.settings.extensions.filter_available', 'Not installed')}
            </SelectItem>
          </SelectContent>
        </Select>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="shrink-0"
              disabled={loading}
              aria-label={translate(
                'auto.components.settings.extensions.refresh',
                'Check again'
              )}
              onClick={() => void refresh(true)}
            >
              <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={4}>
            {translate('auto.components.settings.extensions.refresh', 'Check again')}
          </TooltipContent>
        </Tooltip>
      </div>

      {error ? (
        <p role="alert" className="text-xs break-words text-destructive">
          {error}
        </p>
      ) : null}
      {inventory?.catalogError ? (
        <p className="text-xs text-muted-foreground">
          {translate(
            'auto.components.settings.extensions.catalog_stale',
            'Muster could not reach the extension catalog, so this list may be out of date.'
          )}
        </p>
      ) : null}

      {visible.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((item) => (
            <ExtensionTile
              key={item.entry.id}
              item={item}
              onOpen={() => setOpenId(item.entry.id)}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-12 text-center">
          <Blocks className="size-6 text-muted-foreground" />
          <p className="text-sm font-medium">
            {loading
              ? translate('auto.components.settings.extensions.empty_loading', 'Checking')
              : filter.query || filter.status !== 'all'
                ? translate('auto.components.settings.extensions.empty_filtered', 'No matches')
                : translate(
                    'auto.components.settings.extensions.empty_tab',
                    'Nothing here yet'
                  )}
          </p>
          <p className="max-w-xs text-xs text-muted-foreground">
            {filter.query || filter.status !== 'all'
              ? translate(
                  'auto.components.settings.extensions.empty_filtered_hint',
                  'Try a different search or filter.'
                )
              : translate(
                  'auto.components.settings.extensions.empty_tab_hint',
                  'Muster adds to this list as new extensions are published.'
                )}
          </p>
        </div>
      )}

      <ExtensionDetailDialog
        item={openItem}
        busyHarness={busyHarness}
        onClose={() => setOpenId(null)}
        onInstallHarness={(id, harnessId) => void writeHarness(id, harnessId, 'install')}
        onUninstallHarness={(id, harnessId) => void writeHarness(id, harnessId, 'uninstall')}
        onToggleAutoUpdate={(id, enabled) => void preferences.setEntry(id, enabled)}
        settingValues={preferences.settingValues(openItem?.entry.id ?? '')}
        onSaveSettings={preferences.saveSettingValues}
      />
    </div>
  )
}
