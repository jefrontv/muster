import { useCallback, useEffect, useMemo, useState } from 'react'
import type { GlobalSettings } from '../../../../shared/types'
import { useAppStore } from '../../store'
import { matchesSettingsSearch } from './settings-search'
import { getBrowserPaneSearchEntries, getBrowserLinkRoutingDescription } from './browser-search'
import { BrowserHomePageSetting } from './BrowserHomePageSetting'
import { BrowserDefaultZoomSetting } from './BrowserDefaultZoomSetting'
import { BrowserSearchEngineSetting } from './BrowserSearchEngineSetting'
import { BrowserLinkRoutingSetting } from './BrowserLinkRoutingSetting'
import { BrowserFloatingLinkSetting } from './BrowserFloatingLinkSetting'
import { BrowserExtensionsSection } from './BrowserExtensionsSection'
import { BundledExtensionsSection } from './BundledExtensionsSection'
import { BrowserLocalhostWorktreeLabelsSetting } from './BrowserLocalhostWorktreeLabelsSetting'
import { BrowserSessionCookiesSection } from './BrowserSessionCookiesSection'
import { BrowserNewProfileDialog } from './BrowserNewProfileDialog'
import {
  createBrowserHomePageDraftState,
  resolveBrowserHomePageDraftState
} from './browser-home-page-draft-state'
import { buildSidebarHostOptions } from '../sidebar/sidebar-host-options'
import { getHostDisplayLabelOverrides } from '../../../../shared/host-setting-overrides'
import {
  getSettingsFocusedExecutionHostId,
  type ExecutionHostId
} from '../../../../shared/execution-host'
import { isMacUserAgent } from '@/components/terminal-pane/pane-helpers'
import { translate } from '@/i18n/i18n'
import { resolveAvailableBrowserSessionHostId } from './browser-session-host-selection'

type BrowserPaneProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
}

export function BrowserPane({ settings, updateSettings }: BrowserPaneProps): React.JSX.Element {
  const searchQuery = useAppStore((s) => s.settingsSearchQuery)
  const browserDefaultUrl = useAppStore((s) => s.browserDefaultUrl)
  const setBrowserDefaultUrl = useAppStore((s) => s.setBrowserDefaultUrl)
  const browserDefaultSearchEngine = useAppStore((s) => s.browserDefaultSearchEngine)
  const setBrowserDefaultSearchEngine = useAppStore((s) => s.setBrowserDefaultSearchEngine)
  const browserDefaultZoomLevel = useAppStore((s) => s.browserDefaultZoomLevel)
  const setBrowserDefaultZoomLevel = useAppStore((s) => s.setBrowserDefaultZoomLevel)
  const browserSessionProfiles = useAppStore((s) => s.browserSessionProfiles)
  const repos = useAppStore((s) => s.repos)
  const sshTargetLabels = useAppStore((s) => s.sshTargetLabels)
  const sshConnectionStates = useAppStore((s) => s.sshConnectionStates)
  const runtimeEnvironments = useAppStore((s) => s.runtimeEnvironments)
  const runtimeStatusByEnvironmentId = useAppStore((s) => s.runtimeStatusByEnvironmentId)
  const browserSessionHostIdOverride = useAppStore((s) => s.browserSessionHostIdOverride)
  const setBrowserSessionHostId = useAppStore((s) => s.setBrowserSessionHostId)
  const detectedBrowsers = useAppStore((s) => s.detectedBrowsers)
  const browserSessionImportState = useAppStore((s) => s.browserSessionImportState)
  const defaultBrowserSessionProfileId = useAppStore((s) => s.defaultBrowserSessionProfileId)
  const setDefaultBrowserSessionProfileId = useAppStore((s) => s.setDefaultBrowserSessionProfileId)
  const defaultProfile = browserSessionProfiles.find((p) => p.id === 'default')
  const nonDefaultProfiles = browserSessionProfiles.filter((p) => p.scope !== 'default')
  const persistedHomePageDraft = browserDefaultUrl ?? ''
  const [homePageDraftState, setHomePageDraftState] = useState(() =>
    createBrowserHomePageDraftState(persistedHomePageDraft)
  )
  const [newProfileDialogOpen, setNewProfileDialogOpen] = useState(false)
  const resolvedHomePageDraftState = resolveBrowserHomePageDraftState(
    homePageDraftState,
    persistedHomePageDraft
  )

  if (resolvedHomePageDraftState !== homePageDraftState) {
    setHomePageDraftState(resolvedHomePageDraftState)
  }
  const homePageDraft = resolvedHomePageDraftState.value
  const setHomePageDraft = (value: string): void => {
    setHomePageDraftState((current) => ({ ...current, value }))
  }

  const selectedSearchEngine = browserDefaultSearchEngine ?? 'google'

  const showHomePage = matchesSettingsSearch(searchQuery, [getBrowserPaneSearchEntries()[0]])
  const showSearchEngine = matchesSettingsSearch(searchQuery, [getBrowserPaneSearchEntries()[1]])
  const showDefaultZoom = matchesSettingsSearch(searchQuery, [getBrowserPaneSearchEntries()[2]])
  const showLinkRouting = matchesSettingsSearch(searchQuery, [getBrowserPaneSearchEntries()[3]])
  const showFloatingLinks = matchesSettingsSearch(searchQuery, [getBrowserPaneSearchEntries()[4]])
  const showExtensions = matchesSettingsSearch(searchQuery, [getBrowserPaneSearchEntries()[5]])
  const showBundledExtensions = matchesSettingsSearch(searchQuery, [
    getBrowserPaneSearchEntries()[6]
  ])
  const showLocalhostLabels = matchesSettingsSearch(searchQuery, [getBrowserPaneSearchEntries()[7]])
  const showCookies = matchesSettingsSearch(searchQuery, [getBrowserPaneSearchEntries()[8]])
  const isMac = isMacUserAgent()
  const linkRoutingDescription = getBrowserLinkRoutingDescription({ isMac })
  const hostLabelOverrides = useMemo(() => getHostDisplayLabelOverrides(settings), [settings])
  const browserSessionHostOptions = useMemo(
    () =>
      buildSidebarHostOptions({
        repos,
        sshTargetLabels,
        sshConnectionStates,
        settings,
        runtimeEnvironments,
        runtimeStatusByEnvironmentId,
        hostLabelOverrides
      })
        .filter((host) => host.kind === 'local' || host.kind === 'runtime')
        .map((host) => ({
          id: host.id,
          label: host.label,
          detail:
            host.kind === 'local'
              ? translate('auto.components.settings.BrowserPane.86b7c83fee', 'This computer')
              : translate(
                  'auto.components.settings.BrowserPane.c0f85056d9',
                  'Browser profiles on this Muster server.'
                )
        })),
    [
      repos,
      sshTargetLabels,
      sshConnectionStates,
      settings,
      runtimeEnvironments,
      runtimeStatusByEnvironmentId,
      hostLabelOverrides
    ]
  )
  const settingsFocusedHostId = getSettingsFocusedExecutionHostId(settings)
  const selectedBrowserSessionHostId = resolveAvailableBrowserSessionHostId(
    browserSessionHostOptions,
    browserSessionHostIdOverride,
    settingsFocusedHostId
  )
  useEffect(() => {
    const requestedHostId = browserSessionHostIdOverride ?? settingsFocusedHostId
    if (selectedBrowserSessionHostId !== requestedHostId) {
      void setBrowserSessionHostId(selectedBrowserSessionHostId)
    }
  }, [
    browserSessionHostIdOverride,
    selectedBrowserSessionHostId,
    setBrowserSessionHostId,
    settingsFocusedHostId
  ])
  const selectBrowserSessionHost = useCallback(
    (hostId: ExecutionHostId) => {
      void setBrowserSessionHostId(hostId)
    },
    [setBrowserSessionHostId]
  )

  return (
    <div className="space-y-6">
      {showHomePage ? (
        <BrowserHomePageSetting
          value={homePageDraft}
          onChange={setHomePageDraft}
          onSave={(url) => {
            setBrowserDefaultUrl(url)
            setHomePageDraftState(createBrowserHomePageDraftState(url ?? ''))
          }}
        />
      ) : null}

      {showSearchEngine ? (
        <BrowserSearchEngineSetting
          selectedSearchEngine={selectedSearchEngine}
          onSearchEngineChange={(engine) => {
            setBrowserDefaultSearchEngine(engine === 'google' ? null : engine)
          }}
        />
      ) : null}

      {showDefaultZoom ? (
        <BrowserDefaultZoomSetting
          value={browserDefaultZoomLevel}
          onChange={setBrowserDefaultZoomLevel}
        />
      ) : null}

      {showLinkRouting ? (
        <BrowserLinkRoutingSetting
          settings={settings}
          linkRoutingDescription={linkRoutingDescription}
          isMac={isMac}
          updateSettings={updateSettings}
        />
      ) : null}

      {showFloatingLinks ? (
        <BrowserFloatingLinkSetting settings={settings} updateSettings={updateSettings} />
      ) : null}

      {showBundledExtensions ? <BundledExtensionsSection /> : null}

      {showExtensions ? <BrowserExtensionsSection /> : null}

      {showLocalhostLabels ? (
        <BrowserLocalhostWorktreeLabelsSetting
          settings={settings}
          updateSettings={updateSettings}
        />
      ) : null}

      {showCookies ? (
        <BrowserSessionCookiesSection
          defaultProfile={defaultProfile}
          nonDefaultProfiles={nonDefaultProfiles}
          detectedBrowsers={detectedBrowsers}
          importState={browserSessionImportState}
          defaultBrowserSessionProfileId={defaultBrowserSessionProfileId}
          hostOptions={browserSessionHostOptions}
          selectedHostId={selectedBrowserSessionHostId}
          onAddProfile={() => setNewProfileDialogOpen(true)}
          onSelectHost={selectBrowserSessionHost}
          onSelectDefaultProfile={() => setDefaultBrowserSessionProfileId(null)}
          onSelectProfile={setDefaultBrowserSessionProfileId}
        />
      ) : null}

      <BrowserNewProfileDialog open={newProfileDialogOpen} onOpenChange={setNewProfileDialogOpen} />
    </div>
  )
}
