// Create and edit one custom step.
//
// Authoring was agent-only until now; this is the human half. Every field maps directly onto the
// persisted record — no derived state — so what the form shows is what the pipeline will run.

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { translate } from '@/i18n/i18n'
import {
  CUSTOM_STEP_PLACEHOLDERS,
  type SiteCustomStep,
  type SiteCustomStepPosition,
  type SiteRunGroup
} from '../../../../shared/site-types'

export type CustomStepDraft = Pick<
  SiteCustomStep,
  'name' | 'command' | 'group' | 'runsOn' | 'position'
>

export function emptyCustomStepDraft(): CustomStepDraft {
  return { name: '', command: '', group: 'deploy', runsOn: 'remote', position: 'after' }
}

function Select<T extends string>({
  label,
  value,
  options,
  onChange
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (next: T) => void
}): React.JSX.Element {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <select
        className="h-8 rounded-md border border-border bg-background px-2 text-xs"
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export function SiteCustomStepEditor({
  draft,
  busy,
  onChange,
  onSubmit,
  onCancel,
  submitLabel
}: {
  draft: CustomStepDraft
  busy: boolean
  onChange: (next: CustomStepDraft) => void
  onSubmit: () => void
  onCancel: () => void
  submitLabel: string
}): React.JSX.Element {
  const [commandRef, setCommandRef] = useState<HTMLTextAreaElement | null>(null)
  const canSubmit = draft.name.trim().length > 0 && draft.command.trim().length > 0

  // Inserting at the caret beats making the user retype a placeholder they can see listed.
  const insertPlaceholder = (name: string): void => {
    const token = `{{${name}}}`
    const element = commandRef
    if (!element) {
      onChange({ ...draft, command: `${draft.command}${token}` })
      return
    }
    const start = element.selectionStart ?? draft.command.length
    const end = element.selectionEnd ?? start
    const next = `${draft.command.slice(0, start)}${token}${draft.command.slice(end)}`
    onChange({ ...draft, command: next })
    requestAnimationFrame(() => {
      element.focus()
      element.setSelectionRange(start + token.length, start + token.length)
    })
  }

  return (
    <div className="space-y-3 rounded-md border border-border bg-muted/20 p-3">
      <div className="space-y-1">
        <Label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {translate('auto.components.sites.StepEditor.name', 'Name')}
        </Label>
        <Input
          value={draft.name}
          placeholder={translate('auto.components.sites.StepEditor.namePlaceholder', 'Clear cache')}
          onChange={(event) => onChange({ ...draft, name: event.target.value })}
        />
      </div>

      <div className="flex gap-2">
        <Select
          label={translate('auto.components.sites.StepEditor.group', 'Runs during')}
          value={draft.group}
          onChange={(group: SiteRunGroup) => onChange({ ...draft, group })}
          options={[
            { value: 'import', label: 'Import' },
            { value: 'deploy', label: 'Deploy' }
          ]}
        />
        <Select
          label={translate('auto.components.sites.StepEditor.position', 'Order')}
          value={draft.position}
          onChange={(position: SiteCustomStepPosition) => onChange({ ...draft, position })}
          options={[
            { value: 'before', label: 'Before built-ins' },
            { value: 'after', label: 'After built-ins' }
          ]}
        />
        <Select
          label={translate('auto.components.sites.StepEditor.runsOn', 'Runs on')}
          value={draft.runsOn}
          onChange={(runsOn: 'remote' | 'local') => onChange({ ...draft, runsOn })}
          options={[
            { value: 'remote', label: 'Server (SSH)' },
            { value: 'local', label: 'Local checkout' }
          ]}
        />
      </div>

      <div className="space-y-1">
        <Label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {translate('auto.components.sites.StepEditor.command', 'Command')}
        </Label>
        <textarea
          ref={setCommandRef}
          className="min-h-16 w-full rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs"
          value={draft.command}
          spellCheck={false}
          placeholder="wp cache flush"
          onChange={(event) => onChange({ ...draft, command: event.target.value })}
        />
        <div className="flex flex-wrap gap-1">
          {CUSTOM_STEP_PLACEHOLDERS.map((placeholder) => (
            <button
              key={placeholder.name}
              type="button"
              title={placeholder.description}
              className="rounded border border-border/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground hover:bg-accent"
              onClick={() => insertPlaceholder(placeholder.name)}
            >
              {`{{${placeholder.name}}}`}
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
          {translate('auto.components.sites.StepEditor.cancel', 'Cancel')}
        </Button>
        <Button size="sm" onClick={onSubmit} disabled={busy || !canSubmit}>
          {submitLabel}
        </Button>
      </div>
    </div>
  )
}
