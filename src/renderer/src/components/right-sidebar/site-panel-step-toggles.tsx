// Editable import/deploy step toggles for the Site panel.
//
// The panel is read-mostly, but the step set is the one knob a run actually varies on — sending
// the user to the Sites page to tick a checkbox made the quick actions pointless. Writes go to the
// RESOLVED environment only (the one a run would use), so what you toggle here is what Import runs.

import type React from 'react'
import { useEffect, useState } from 'react'
import type {
  SiteCustomStep,
  SiteEnvironment,
  SiteRunGroup,
  SiteSummary
} from '../../../../shared/site-types'
import { SITE_DEPLOY_TOGGLES, SITE_IMPORT_TOGGLES } from '../../../../shared/site-types'
import { translate } from '@/i18n/i18n'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { getSiteToggleLabels } from '@/components/sites/site-toggle-labels'

/** Stable identity: an inline `= []` default would be a new array every render. */
const NO_CUSTOM_STEPS: readonly SiteCustomStep[] = []

export function SiteStepToggles({
  siteId,
  environmentName,
  environment,
  customSteps = NO_CUSTOM_STEPS,
  onChanged,
  importAction,
  deployAction,
  className
}: {
  siteId: string
  environmentName: string
  environment: SiteEnvironment
  /** The site's user-defined steps; their enabled state is per site, not per environment. */
  customSteps?: readonly SiteCustomStep[]
  /** Lets the owner set this block apart from the rows above it. */
  className?: string
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

  // Custom steps live on the SITE (definition and enabled state travel together), so flipping one
  // is a site patch, not an environment patch — a different channel from the built-ins above.
  const setCustomStep = async (stepId: string, enabled: boolean): Promise<void> => {
    setError('')
    setPending((current) => ({ ...current, [`custom:${stepId}`]: enabled }))
    const next = customSteps.map((step) => (step.id === stepId ? { ...step, enabled } : step))
    const result = await window.api.sites.update({ siteId, patch: { customSteps: next } })
    if (!result.ok) {
      setPending((current) => {
        const copy = { ...current }
        delete copy[`custom:${stepId}`]
        return copy
      })
      setError(result.error)
      return
    }
    onChanged(result.value)
  }
  /**
   * Panel order mirrors run order — `before` steps above the built-ins would be ideal, but keeping
   * them in one list with a pre/post marker stays readable in a narrow sidebar column.
   */
  const orderedCustomSteps = (group: SiteRunGroup): SiteCustomStep[] =>
    customSteps
      .filter((step) => step.group === group)
      .slice()
      .sort(
        (left, right) =>
          (left.position === 'before' ? 0 : 1) - (right.position === 'before' ? 0 : 1) ||
          left.order - right.order ||
          left.name.localeCompare(right.name)
      )

  const group = (
    heading: string,
    toggles: readonly { key: string; label: string }[],
    action: React.ReactNode,
    groupCustomSteps: readonly SiteCustomStep[]
  ): React.JSX.Element => (
    <fieldset className="flex min-w-0 flex-1 flex-col gap-1.5">
      <legend className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {heading}
      </legend>
      {toggles.map((toggle) => (
        <label key={toggle.key} className="flex w-fit cursor-pointer items-center gap-2 text-xs">
          <Checkbox
            checked={
              pending[toggle.key] ?? Boolean(environment[toggle.key as keyof SiteEnvironment])
            }
            onCheckedChange={(checked) => void setStep(toggle.key, checked === true)}
          />
          <span className="truncate">{toggleLabels[toggle.key] ?? toggle.label}</span>
        </label>
      ))}
      {groupCustomSteps.map((step) => (
        <label
          key={step.id}
          className="flex w-fit cursor-pointer items-center gap-2 text-xs"
          // Why the command in the title: a step's name is user-authored, so the only honest way to
          // know what it runs is to show the command itself.
          title={`${step.command}${step.runsOn === 'local' ? ' (local)' : ' (server)'}`}
        >
          <Checkbox
            checked={pending[`custom:${step.id}`] ?? step.enabled}
            onCheckedChange={(checked) => void setCustomStep(step.id, checked === true)}
          />
          <span className="truncate">{step.name}</span>
          <span className="shrink-0 text-[9px] uppercase tracking-wider text-muted-foreground/70">
            {step.position === 'before' ? 'pre' : 'post'}
          </span>
        </label>
      ))}
      {/* mt-auto pins both buttons to the same baseline even though the columns hold a different
          number of steps. */}
      {action ? <div className="mt-auto pt-2.5">{action}</div> : null}
    </fieldset>
  )

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex gap-4">
        {group(
          translate('auto.components.right.sidebar.SitePanel.importStepsHeading', 'Import'),
          SITE_IMPORT_TOGGLES,
          importAction,
          orderedCustomSteps('import')
        )}
        {group(
          translate('auto.components.right.sidebar.SitePanel.deployStepsHeading', 'Deploy'),
          SITE_DEPLOY_TOGGLES,
          deployAction,
          orderedCustomSteps('deploy')
        )}
      </div>
      {error.length > 0 ? <p className="text-[11px] text-destructive">{error}</p> : null}
    </div>
  )
}
