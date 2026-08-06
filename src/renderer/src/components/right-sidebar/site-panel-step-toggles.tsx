// Editable import/deploy step toggles for the Site panel.
//
// The panel is read-mostly, but the step set is the one knob a run actually varies on — sending
// the user to the Sites page to tick a checkbox made the quick actions pointless. Writes go to the
// RESOLVED environment only (the one a run would use), so what you toggle here is what Import runs.

import type React from 'react'
import { useEffect, useState } from 'react'
import type { SiteEnvironment, SiteSummary } from '../../../../shared/site-types'
import { SITE_DEPLOY_TOGGLES, SITE_IMPORT_TOGGLES } from '../../../../shared/site-types'
import { translate } from '@/i18n/i18n'
import { Checkbox } from '@/components/ui/checkbox'
import { getSiteToggleLabels } from '@/components/sites/site-toggle-labels'

export function SiteStepToggles({
  siteId,
  environmentName,
  environment,
  onChanged,
  importAction,
  deployAction
}: {
  siteId: string
  environmentName: string
  environment: SiteEnvironment
  /** Receives the upsert's own fresh summary, so the owner can patch it in without a refetch. */
  onChanged: (summary: SiteSummary) => void
  /** Run button rendered at the foot of the import column, so action sits with its options. */
  importAction?: React.ReactNode
  /** Run button rendered at the foot of the deploy column. */
  deployAction?: React.ReactNode
}): React.JSX.Element {
  const toggleLabels = getSiteToggleLabels()
  const [error, setError] = useState('')
  // Optimistic overrides: the checkbox flips on click, not after the write plus the owner's full
  // summary refetch land (that round trip resolves git branches for every site and took seconds).
  // The override clears once the prop catches up, or reverts on a failed write.
  const [pending, setPending] = useState<Record<string, boolean>>({})

  useEffect(() => {
    setPending((current) => {
      const next = { ...current }
      let changed = false
      for (const [key, value] of Object.entries(current)) {
        if (Boolean(environment[key as keyof SiteEnvironment]) === value) {
          delete next[key]
          changed = true
        }
      }
      return changed ? next : current
    })
  }, [environment])

  const setStep = async (key: string, enabled: boolean): Promise<void> => {
    setError('')
    setPending((current) => ({ ...current, [key]: enabled }))
    const result = await window.api.sites.upsertEnvironment({
      siteId,
      name: environmentName,
      patch: { [key]: enabled }
    })
    if (!result.ok) {
      setPending((current) => {
        const next = { ...current }
        delete next[key]
        return next
      })
      setError(result.error)
      return
    }
    onChanged(result.value)
  }

  const group = (
    heading: string,
    toggles: readonly { key: string; label: string }[],
    action: React.ReactNode
  ): React.JSX.Element => (
    <fieldset className="flex min-w-0 flex-1 flex-col space-y-1">
      <legend className="text-[11px] font-medium text-muted-foreground">{heading}</legend>
      {toggles.map((toggle) => (
        <label key={toggle.key} className="flex items-center gap-1.5 text-xs">
          <Checkbox
            checked={
              pending[toggle.key] ?? Boolean(environment[toggle.key as keyof SiteEnvironment])
            }
            onCheckedChange={(checked) => void setStep(toggle.key, checked === true)}
          />
          <span className="truncate">{toggleLabels[toggle.key] ?? toggle.label}</span>
        </label>
      ))}
      {action ? <div className="mt-auto pt-1.5">{action}</div> : null}
    </fieldset>
  )

  return (
    <div className="space-y-1.5">
      <div className="flex gap-3">
        {group(
          translate('auto.components.right.sidebar.SitePanel.importStepsHeading', 'Import steps'),
          SITE_IMPORT_TOGGLES,
          importAction
        )}
        {group(
          translate('auto.components.right.sidebar.SitePanel.deployStepsHeading', 'Deploy steps'),
          SITE_DEPLOY_TOGGLES,
          deployAction
        )}
      </div>
      {error.length > 0 ? <p className="text-[11px] text-destructive">{error}</p> : null}
    </div>
  )
}
