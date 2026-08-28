// A site's custom steps, plus the shared library it can install from.
//
// Steps are authored either here or by an agent through the muster-sites MCP tools; both write the
// same records. Install copies, so a later library edit never changes an already-installed step.

import { useCallback, useEffect, useState } from 'react'
import { Download, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import type { SiteCustomStep, SiteSummary } from '../../../../shared/site-types'
import { useAppStore } from '@/store'
import {
  SiteCustomStepEditor,
  draftToStepFields,
  emptyCustomStepDraft,
  type CustomStepDraft
} from './SiteCustomStepEditor'
import { SiteCustomStepList } from './SiteCustomStepList'
import { SiteCustomStepSummary } from './SiteCustomStepSummary'

function StepRow({
  step,
  action
}: {
  step: SiteCustomStep
  action?: React.ReactNode
}): React.JSX.Element {
  return (
    <li className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-2.5 py-2">
      <SiteCustomStepSummary step={step} />
      {action ? <div className="flex shrink-0 items-center gap-1">{action}</div> : null}
    </li>
  )
}

export function SiteStepLibrarySection({ summary }: { summary: SiteSummary }): React.JSX.Element {
  const [library, setLibrary] = useState<SiteCustomStep[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [draft, setDraft] = useState<CustomStepDraft | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const applySiteSummary = useAppStore((state) => state.applySiteSummary)
  const siteSteps = summary.site.customSteps ?? []

  const load = useCallback(async (): Promise<void> => {
    const result = await window.api.sites.stepLibrary.list()
    if (result.ok) {
      setLibrary(result.value)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const install = async (step: SiteCustomStep): Promise<void> => {
    setBusyId(step.id)
    try {
      const result = await window.api.sites.stepLibrary.install({
        siteId: summary.site.id,
        libraryStepId: step.id
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      applySiteSummary(result.value)
      toast.success(
        translate('auto.components.sites.StepLibrary.installed', 'Added “{{name}}” to this site.', {
          name: step.name
        })
      )
    } finally {
      setBusyId(null)
    }
  }

  // Deleting a template, not anything that runs: sites installed their own copies, so this cannot
  // change what any of them do.
  const removeFromLibrary = async (step: SiteCustomStep): Promise<void> => {
    setBusyId(step.id)
    try {
      const remaining = library.filter((entry) => entry.id !== step.id)
      const result = await window.api.sites.stepLibrary.set({ steps: remaining })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setLibrary(result.value)
      toast.success(
        translate(
          'auto.components.sites.StepLibrary.removed',
          'Removed “{{name}}” from the library.',
          { name: step.name }
        )
      )
    } finally {
      setBusyId(null)
    }
  }

  const create = async (): Promise<void> => {
    if (!draft) {
      return
    }
    setBusyId('new')
    try {
      // Appended last in its own lane; reorder buttons move it from there.
      const step: SiteCustomStep = {
        ...draftToStepFields(draft),
        id: crypto.randomUUID(),
        order: siteSteps.length,
        enabled: true
      }
      const result = await window.api.sites.update({
        siteId: summary.site.id,
        patch: { customSteps: [...siteSteps, step] }
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      applySiteSummary(result.value)
      setDraft(null)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-medium">
          {translate('auto.components.sites.StepLibrary.heading', 'Custom steps')}
        </h3>
        <p className="text-xs text-muted-foreground">
          {translate(
            'auto.components.sites.StepLibrary.description',
            'Extra commands this site runs as part of an import or deploy. Your agent can create and copy them too.'
          )}
        </p>
      </div>

      {draft ? (
        <SiteCustomStepEditor
          draft={draft}
          busy={busyId !== null}
          onChange={setDraft}
          onSubmit={() => void create()}
          onCancel={() => setDraft(null)}
          submitLabel={translate('auto.components.sites.StepEditor.add', 'Add step')}
        />
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => setDraft(emptyCustomStepDraft())}
        >
          <Plus className="size-3.5" />
          {translate('auto.components.sites.StepEditor.add', 'Add step')}
        </Button>
      )}

      <SiteCustomStepList
        summary={summary}
        editingId={editingId}
        onEditingIdChange={setEditingId}
        onLibraryChanged={setLibrary}
      />

      {library.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {translate('auto.components.sites.StepLibrary.libraryHeading', 'Library')}
          </p>
          <ul className="space-y-1.5">
            {library.map((step) => (
              <StepRow
                key={step.id}
                step={step}
                action={
                  <>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          disabled={busyId !== null}
                          onClick={() => void install(step)}
                        >
                          <Download className="size-3.5" />
                          {translate('auto.components.sites.StepLibrary.install', 'Install')}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top" sideOffset={4}>
                        {translate(
                          'auto.components.sites.StepLibrary.installHint',
                          'Copy this step onto the open site'
                        )}
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          aria-label={translate(
                            'auto.components.sites.StepLibrary.remove',
                            'Remove from library'
                          )}
                          disabled={busyId !== null}
                          onClick={() => void removeFromLibrary(step)}
                          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" sideOffset={4}>
                        {translate(
                          'auto.components.sites.StepLibrary.removeHint',
                          'Delete from the library. Sites that installed it keep their copy.'
                        )}
                      </TooltipContent>
                    </Tooltip>
                  </>
                }
              />
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
