// A site's own custom steps, with the actions that change them.
//
// Every mutation persists the whole `customSteps` array in one site patch: the list is small, and
// a single write keeps `order` internally consistent instead of racing per-step updates.

import { useState } from 'react'
import { ChevronDown, ChevronUp, Library, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Checkbox } from '@/components/ui/checkbox'
import { translate } from '@/i18n/i18n'
import {
  moveCustomStep,
  type SiteCustomStep,
  type SiteSummary
} from '../../../../shared/site-types'
import { useAppStore } from '@/store'
import { SiteCustomStepEditor, type CustomStepDraft } from './SiteCustomStepEditor'

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
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
    >
      {children}
    </button>
  )
}

export function SiteCustomStepList({
  summary,
  editingId,
  onEditingIdChange
}: {
  summary: SiteSummary
  editingId: string | null
  onEditingIdChange: (id: string | null) => void
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

  const promote = async (step: SiteCustomStep): Promise<void> => {
    const existing = await window.api.sites.stepLibrary.list()
    if (!existing.ok) {
      toast.error(existing.error)
      return
    }
    // A library entry is a template: it never runs where it sits, so it is stored disabled.
    const entry: SiteCustomStep = {
      ...step,
      id: crypto.randomUUID(),
      enabled: false,
      origin: { kind: 'library', libraryId: step.id }
    }
    const result = await window.api.sites.stepLibrary.set({ steps: [...existing.value, entry] })
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success(
      translate('auto.components.sites.StepLibrary.promoted', 'Copied “{{name}}” to the library.', {
        name: step.name
      })
    )
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
                        entry.id === step.id
                          ? { ...entry, ...draft, name: draft.name.trim(), command: draft.command }
                          : entry
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
              <div className="flex items-start gap-2 px-2.5 py-2">
                <Checkbox
                  className="mt-0.5"
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
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-xs font-medium">{step.name}</span>
                    <span className="shrink-0 text-[9px] uppercase tracking-wider text-muted-foreground/70">
                      {step.group} · {step.position === 'before' ? 'pre' : 'post'} ·{' '}
                      {step.runsOn === 'local' ? 'local' : 'server'}
                    </span>
                  </div>
                  {/* Always visible: a step's name is user-authored, so it is not evidence of what runs. */}
                  <p className="truncate font-mono text-[10px] text-muted-foreground">
                    {step.command}
                  </p>
                </div>
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
