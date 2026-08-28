// The shared custom-step library, and the site's own steps.
//
// Authoring happens through the agent (the muster-sites MCP tools own create/update/copy/promote);
// this surface is the human half: see what a site runs, and install a library entry onto it.
// Install copies, so a later library edit never changes an already-installed step.

import { useCallback, useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import type { SiteCustomStep, SiteSummary } from '../../../../shared/site-types'
import { useAppStore } from '@/store'

function StepRow({
  step,
  action
}: {
  step: SiteCustomStep
  action?: React.ReactNode
}): React.JSX.Element {
  return (
    <li className="flex items-start justify-between gap-3 rounded-md border border-border/60 px-2.5 py-2">
      <div className="min-w-0 space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="truncate text-xs font-medium">{step.name}</span>
          <span className="shrink-0 text-[9px] uppercase tracking-wider text-muted-foreground/70">
            {step.group} · {step.position === 'before' ? 'pre' : 'post'} ·{' '}
            {step.runsOn === 'local' ? 'local' : 'server'}
          </span>
        </div>
        {/* The command, always visible: a step's name is user-authored, so it is not evidence. */}
        <p className="truncate font-mono text-[10px] text-muted-foreground">{step.command}</p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </li>
  )
}

export function SiteStepLibrarySection({
  summary
}: {
  summary: SiteSummary
}): React.JSX.Element | null {
  const [library, setLibrary] = useState<SiteCustomStep[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
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

  // Nothing to show and nothing to offer: stay out of the way rather than render an empty shell.
  if (siteSteps.length === 0 && library.length === 0) {
    return null
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
            'Extra commands this site runs as part of an import or deploy. Ask your agent to create, edit, or copy them between sites.'
          )}
        </p>
      </div>

      {siteSteps.length > 0 ? (
        <ul className="space-y-1.5">
          {siteSteps.map((step) => (
            <StepRow key={step.id} step={step} />
          ))}
        </ul>
      ) : null}

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
                }
              />
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
