// Asks where the user's sites live, during onboarding rather than leaving them to find the
// Folders dialog on the Sites page later.
//
// Why a step and not a row on site_mcp: that step installs agent tooling. This one answers a
// prerequisite question — which folders hold sites at all — and it is worth its own beat because
// everything downstream (discovery, the sidebar, deploys) reads from the answer. Code mode only,
// same as site_mcp: a Chat-mode user never sees a site.
//
// Reuses the same IPC the Folders dialog drives, so the two surfaces cannot disagree about the
// configured list. Reordering is deliberately absent: ranking folders is a power-user concern that
// belongs in the full dialog, not in a first-run question.

import { FolderPlus, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { SettingsSwitchRow } from '@/components/settings/SettingsFormControls'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import type { SiteResult } from '../../../../shared/site-types'
import type { SiteRootEntry } from '../../../../shared/site-discovery-types'

export function OnboardingSiteSourcesStep(): React.JSX.Element {
  const [entries, setEntries] = useState<SiteRootEntry[]>([])
  const [derivedRoots, setDerivedRoots] = useState<readonly string[]>([])
  const [busy, setBusy] = useState(false)
  const autoAdd = useAppStore((state) => state.settings?.sitesAutoAddDiscovered === true)
  const updateSettings = useAppStore((state) => state.updateSettings)

  const load = useCallback(async (): Promise<void> => {
    const configured = await window.api.siteRoots?.configured()
    if (configured?.ok) {
      setEntries(configured.value)
    }
    // With nothing configured, Muster still derives roots from where projects already sit. Showing
    // those is the difference between "we found your sites" and an empty box that looks broken.
    const discovered = await window.api.siteRoots?.discover()
    if (discovered?.ok) {
      setDerivedRoots(discovered.value.roots)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Every writer answers with the new list, so one helper covers add and remove — and a rejected
  // write leaves the rows exactly as they were instead of half-applying.
  const apply = async (
    write: () => Promise<SiteResult<SiteRootEntry[]> | undefined>
  ): Promise<void> => {
    setBusy(true)
    try {
      const result = await write()
      if (!result) {
        return
      }
      if (result.ok) {
        setEntries(result.value)
        return
      }
      toast.error(result.error)
    } finally {
      setBusy(false)
    }
  }

  const addFolder = async (): Promise<void> => {
    const picked = await window.api.repos.pickDirectory()
    if (picked) {
      await apply(async () => window.api.siteRoots?.add(picked))
    }
  }

  // Turning it on here does not run a pass: onboarding has no sidebar to fill yet, and the roots
  // watcher picks it up the moment the app settles.
  const shown = entries.length > 0 ? entries.map((entry) => entry.path) : derivedRoots
  const isDerived = entries.length === 0 && derivedRoots.length > 0

  return (
    <div className="space-y-5" data-testid="onboarding-site-sources-step">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold leading-tight text-foreground">
          {translate('auto.components.onboarding.SiteSourcesStep.title', 'Where your sites live')}
        </h2>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          {translate(
            'auto.components.onboarding.SiteSourcesStep.description',
            'Muster looks inside these folders for sites. You can change this later on the Sites page.'
          )}
        </p>
      </div>

      <div className="space-y-2 rounded-xl border border-border bg-muted/20 p-3">
        {shown.length === 0 ? (
          <p className="px-1 py-2 text-[13px] text-muted-foreground">
            {translate(
              'auto.components.onboarding.SiteSourcesStep.empty',
              'No folders yet. Choose the one that holds your sites.'
            )}
          </p>
        ) : (
          <ul className="space-y-1">
            {shown.map((path) => (
              <li key={path} className="flex items-center gap-2 rounded-md px-1 py-1">
                <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{path}</span>
                {isDerived ? null : (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={translate(
                      'auto.components.onboarding.SiteSourcesStep.remove',
                      'Remove folder'
                    )}
                    disabled={busy}
                    className="size-6 shrink-0 p-0"
                    onClick={() => void apply(async () => window.api.siteRoots?.remove(path))}
                  >
                    <X className="size-3.5" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {isDerived ? (
          <p className="px-1 text-xs leading-relaxed text-muted-foreground/70">
            {translate(
              'auto.components.onboarding.SiteSourcesStep.derived_note',
              'Found from where your projects already sit. Add a folder to set your own.'
            )}
          </p>
        ) : null}
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={busy}
          onClick={() => void addFolder()}
        >
          <FolderPlus className="size-3.5" />
          {translate('auto.components.onboarding.SiteSourcesStep.add_folder', 'Choose folder…')}
        </Button>
      </div>

      <SettingsSwitchRow
        label={translate(
          'auto.components.onboarding.SiteSourcesStep.auto_add',
          'Add new sites automatically'
        )}
        description={translate(
          'auto.components.onboarding.SiteSourcesStep.auto_add_hint',
          'New folders found here become sidebar projects on their own, with no setup.'
        )}
        checked={autoAdd}
        onChange={() => void updateSettings({ sitesAutoAddDiscovered: !autoAdd })}
      />
    </div>
  )
}
