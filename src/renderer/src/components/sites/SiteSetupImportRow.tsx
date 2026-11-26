import { Download } from 'lucide-react'
import type React from 'react'
import { useState } from 'react'
import { SITE_IMPORT_TOGGLES, type SiteImportToggleKey } from '../../../../shared/site-types'
import { Checkbox } from '@/components/ui/checkbox'
import type { SiteSetupChoices } from './site-setup-choices'
import { getSiteSetupReviewStrings } from './site-setup-review-strings'
import { getSiteToggleLabels } from './site-toggle-labels'
import { SiteSetupRow } from './SiteSetupRow'
import { SiteSetupRowEditButton } from './SiteSetupRowEditButton'

export function SiteSetupImportRow({
  choices,
  onChange,
  locked,
  branchNote
}: {
  choices: SiteSetupChoices
  onChange: (next: SiteSetupChoices) => void
  locked: boolean
  branchNote: string
}): React.JSX.Element {
  const strings = getSiteSetupReviewStrings()
  const toggleLabels = getSiteToggleLabels()
  const [editing, setEditing] = useState(false)
  const { environment, enabled, toggles } = choices.import
  const setImport = (next: Partial<SiteSetupChoices['import']>): void =>
    onChange({ ...choices, import: { ...choices.import, ...next } })
  // No separate on/off: unticking every step is what turns the import off.
  const setStep = (key: SiteImportToggleKey, checked: boolean): void => {
    const base = enabled
      ? toggles
      : (Object.fromEntries(Object.keys(toggles).map((k) => [k, false])) as typeof toggles)
    const next = { ...base, [key]: checked }
    setImport({ toggles: next, enabled: Object.values(next).some(Boolean) })
  }
  const picked = SITE_IMPORT_TOGGLES.filter((toggle) => toggles[toggle.key]).length
  const summary = enabled
    ? strings.importStepsSummary
        .replace('{{environment}}', environment)
        .replace('{{count}}', String(picked))
        .replace('{{total}}', String(SITE_IMPORT_TOGGLES.length))
    : strings.importOff

  return (
    <SiteSetupRow
      icon={<Download className="size-4" />}
      title={strings.importTitle}
      summary={summary}
      state={locked ? 'locked' : 'available'}
      control={
        <SiteSetupRowEditButton
          expanded={editing}
          onToggle={() => setEditing((open) => !open)}
          label={strings.importEditLabel}
          controls="site-setup-import-editor"
          disabled={locked}
        />
      }
    >
      {editing ? (
        <div id="site-setup-import-editor" className="grid grid-cols-2 gap-x-6 gap-y-2">
          {SITE_IMPORT_TOGGLES.map((toggle) => (
            <label key={toggle.key} className="flex items-center gap-2 text-xs">
              <Checkbox
                checked={enabled && toggles[toggle.key]}
                onCheckedChange={(checked) => setStep(toggle.key, checked === true)}
              />
              {toggleLabels[toggle.key]}
            </label>
          ))}
        </div>
      ) : null}
      {branchNote.length > 0 ? <p className="text-xs text-muted-foreground">{branchNote}</p> : null}
    </SiteSetupRow>
  )
}
