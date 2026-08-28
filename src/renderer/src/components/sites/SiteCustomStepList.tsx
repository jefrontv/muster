// A site's own custom steps, with the actions that change them.
//
// Every mutation persists the whole `customSteps` array in one site patch: the list is small, and
// a single write keeps `order` internally consistent instead of racing per-step updates.

import { useState } from 'react'
import { ChevronDown, ChevronUp, Library, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Checkbox } from '@/components/ui/checkbox'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import {
  moveCustomStep,
  type SiteCustomStep,
  type SiteSummary
} from '../../../../shared/site-types'
import { useAppStore } from '@/store'
import {
  SiteCustomStepEditor,
  draftToStepFields,
  type CustomStepDraft
} from './SiteCustomStepEditor'
import { SiteCustomStepSummary } from './SiteCustomStepSummary'

function IconButton({
  label,
  disabled,
  onClick,
  children
}: {
  label: string
  disabled: boolean
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          // aria-label, not title: the tooltip is the visible hint, and a native title on top of it
          // shows a second, slower, duplicate one.
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

export function SiteCustomStepList({
  summary,
  editingId,
  onEditingIdChange,
  onLibraryChanged
}: {
  summary: SiteSummary
  editingId: string | null
  onEditingIdChange: (id: string | null) => void
  /** Promotion happens on a row but the library is rendered by the parent, which must refresh. */
  onLibraryChanged: (library: SiteCustomStep[]) => void
}): React.JSX.Element | null {
  const [draft, setDraft] = useState<CustomStepDraft | null>(null)
  const [busy, setBusy] = useState(false)
  const applySiteSummary = useAppStore((state) => state.applySiteSummary)
  const steps = summary.site.customSteps ?? []

  const persist = async (next: SiteCustomStep[], message?: string): Promise<boolean> => {
    setBusy(true)
    try {
      const result = await window.api.sites.update({
        siteId: summary.site.id,
        patch: { customSteps: next }
      })
      if (!result.ok) {
        toast.error(result.error)
        return false
      }
      applySiteSummary(result.value)
      if (message) {
        toast.success(message)
      }
      return true
    } finally {
      setBusy(false)
    }
  }

  // Promotion runs in main: embedding a step's script means reading the checkout, which the
  // renderer cannot do, and a library entry without its script is useless on any other site.
  const promote = async (step: SiteCustomStep): Promise<void> => {
    setBusy(true)
    try {
      const result = await window.api.sites.stepLibrary.promote({
        siteId: summary.site.id,
        stepId: step.id
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      onLibraryChanged(result.value)
      toast.success(
        translate(
          'auto.components.sites.StepLibrary.promoted',
          'Copied “{{name}}” to the library.',
          { name: step.name }
        )
      )
    } finally {
      setBusy(false)
    }
  }

  if (steps.length === 0) {
    return null
  }

  const ordered = [...steps].sort(
    (left, right) =>
      (left.position === 'before' ? 0 : 1) - (right.position === 'before' ? 0 : 1) ||
      left.order - right.order ||
      left.name.localeCompare(right.name)
  )

  return (
    <ul className="space-y-1.5">
      {ordered.map((step) => {
        const editing = editingId === step.id && draft !== null
        return (
          <li key={step.id} className="rounded-md border border-border/60">
            {editing ? (
              <div className="p-2">
                <SiteCustomStepEditor
                  draft={draft}
                  busy={busy}
                  onChange={setDraft}
                  onCancel={() => {
                    onEditingIdChange(null)
                    setDraft(null)
                  }}
                  submitLabel={translate('auto.components.sites.StepEditor.save', 'Save')}
                  onSubmit={() => {
                    void persist(
                      steps.map((entry) =>
                        entry.id === step.id ? { ...entry, ...draftToStepFields(draft) } : entry
                      )
                    ).then((ok) => {
                      if (ok) {
                        onEditingIdChange(null)
                        setDraft(null)
                      }
                    })
                  }}
                />
              </div>
            ) : (
              <div className="flex items-center gap-2 px-2.5 py-2">
                <Checkbox
                  checked={step.enabled}
                  disabled={busy}
                  onCheckedChange={(checked) => {
                    void persist(
                      steps.map((entry) =>
                        entry.id === step.id ? { ...entry, enabled: checked === true } : entry
                      )
                    )
                  }}
                />
                <SiteCustomStepSummary step={step} />
                <div className="flex shrink-0 items-center">
                  <IconButton
                    label={translate('auto.components.sites.StepEditor.moveUp', 'Move earlier')}
                    disabled={busy}
                    onClick={() => void persist(moveCustomStep(steps, step.id, -1))}
                  >
                    <ChevronUp className="size-3.5" />
                  </IconButton>
                  <IconButton
                    label={translate('auto.components.sites.StepEditor.moveDown', 'Move later')}
                    disabled={busy}
                    onClick={() => void persist(moveCustomStep(steps, step.id, 1))}
                  >
                    <ChevronDown className="size-3.5" />
                  </IconButton>
                  <IconButton
                    label={translate('auto.components.sites.StepEditor.promote', 'Copy to library')}
                    disabled={busy}
                    onClick={() => void promote(step)}
                  >
                    <Library className="size-3.5" />
                  </IconButton>
                  <IconButton
                    label={translate('auto.components.sites.StepEditor.edit', 'Edit')}
                    disabled={busy}
                    onClick={() => {
                      setDraft({
                        name: step.name,
                        command: step.command,
                        scriptPath: step.scriptPath ?? '',
                        group: step.group,
                        runsOn: step.runsOn,
                        position: step.position
                      })
                      onEditingIdChange(step.id)
                    }}
                  >
                    <Pencil className="size-3.5" />
                  </IconButton>
                  <IconButton
                    label={translate('auto.components.sites.StepEditor.remove', 'Remove')}
                    disabled={busy}
                    onClick={() => {
                      void persist(
                        steps.filter((entry) => entry.id !== step.id),
                        translate(
                          'auto.components.sites.StepEditor.removed',
                          'Removed “{{name}}”.',
                          { name: step.name }
                        )
                      )
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </IconButton>
                </div>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
