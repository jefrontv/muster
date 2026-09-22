// Writes the Extension Hub's two settings records, then re-derives the inventory from them.
//
// These go through the RENDERER's settings store on purpose. Writing them in the main process left
// this side's copy stale, so the auto-update switch snapped back to where it started and a
// dismissed update card never went away.

import { useCallback, useMemo } from 'react'
import { useAppStore } from '@/store'
import {
  mergeExtensionDismissals,
  readExtensionAutoUpdate,
  setExtensionAutoUpdateEntry,
  setExtensionAutoUpdateMaster
} from '../../../shared/extension-preferences'
import {
  readExtensionSettingValues,
  setExtensionSettingValues,
  type ExtensionSettingValues
} from '../../../shared/extension-setting-values'
import { publishExtensionInventory, refreshExtensionInventory } from './useExtensionInventory'

const EMPTY_DISMISSALS: readonly string[] = []

export type ExtensionPreferences = {
  master: boolean
  dismissals: readonly string[]
  setMaster: (enabled: boolean) => Promise<void>
  setEntry: (id: string, enabled: boolean) => Promise<void>
  dismiss: (keys: readonly string[]) => Promise<void>
  settingValues: (id: string) => ExtensionSettingValues
  saveSettingValues: (id: string, values: ExtensionSettingValues) => Promise<void>
}

export function useExtensionPreferences(): ExtensionPreferences {
  const settings = useAppStore((state) => state.settings)
  const updateSettings = useAppStore((state) => state.updateSettings)
  const autoUpdate = readExtensionAutoUpdate(settings)

  // Why the refresh is awaited after the write: `autoUpdateEnabled` is derived in the main process
  // from these settings, so re-reading before the write lands would show the previous answer.
  const setMaster = useCallback(
    async (enabled: boolean) => {
      await updateSettings({ extensionAutoUpdate: setExtensionAutoUpdateMaster(autoUpdate, enabled) })
      await refreshExtensionInventory(false)
    },
    [autoUpdate, updateSettings]
  )

  const setEntry = useCallback(
    async (id: string, enabled: boolean) => {
      await updateSettings({
        extensionAutoUpdate: setExtensionAutoUpdateEntry(autoUpdate, id, enabled)
      })
      await refreshExtensionInventory(false)
    },
    [autoUpdate, updateSettings]
  )

  // Why memoized: the `?? []` fallback is a fresh array each render, which would rebuild `dismiss`
  // on every render and re-subscribe every consumer.
  const stored = settings?.extensionUpdateDismissals
  const dismissals = useMemo(() => stored ?? EMPTY_DISMISSALS, [stored])
  const dismiss = useCallback(
    async (keys: readonly string[]) => {
      await updateSettings({
        extensionUpdateDismissals: mergeExtensionDismissals(dismissals, keys)
      })
    },
    [dismissals, updateSettings]
  )

  const stored_values = settings?.extensionSettingValues
  const settingValues = useCallback(
    (id: string) => readExtensionSettingValues({ extensionSettingValues: stored_values }, id),
    [stored_values]
  )

  /**
   * Saves the values, then asks the main process to rewrite the entries that already exist.
   *
   * Both halves are needed and in this order: settings are the renderer's to write, and the config
   * files on disk still hold the old value until something rewrites them. Skipping the second step
   * is how a saved API key would look accepted and change nothing an agent can see.
   */
  const saveSettingValues = useCallback(
    async (id: string, values: ExtensionSettingValues) => {
      await updateSettings({
        extensionSettingValues: setExtensionSettingValues(stored_values, id, values)
      })
      const result = await window.api.extensions.refreshHarnesses({ id })
      if (!result.ok) {
        throw new Error(result.error)
      }
      publishExtensionInventory(result.value)
    },
    [stored_values, updateSettings]
  )

  return {
    master: autoUpdate.master,
    dismissals,
    setMaster,
    setEntry,
    dismiss,
    settingValues,
    saveSettingValues
  }
}
