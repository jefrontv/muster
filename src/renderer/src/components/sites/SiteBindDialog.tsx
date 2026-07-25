// The explicit-consent gate for a `muster://` link.
//
// A link is only ever *staged* by main: anybody can craft one, so nothing is written until the user
// sees exactly what would be stored, picks the local checkout, and confirms. The password is never
// sent here — the dialog only knows that one exists.

import { KeyRound, Link2, ShieldOff } from 'lucide-react'
import type React from 'react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { PendingSiteBind, SiteBindFields } from '../../../../shared/site-bind-types'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { getSiteBindFieldLabels, getSiteBindStrings } from './site-bind-strings'
import { SiteBindTargetPicker } from './SiteBindTargetPicker'
import { siteBindApi, usePendingSiteBind } from './use-pending-site-bind'

/** Display order; `liveDomainProtocol` is folded into `liveDomain`, so it is not listed. */
const SUMMARY_FIELDS = [
  'reponame',
  'hostname',
  'username',
  'rootPath',
  'liveDomain',
  'localDomain',
  'environment',
  'deployCommand',
  'themeDistPath',
  'notes'
] as const

function summaryValue(fields: SiteBindFields, key: (typeof SUMMARY_FIELDS)[number]): string {
  if (key === 'liveDomain' && fields.liveDomain.length > 0) {
    return `${fields.liveDomainProtocol}://${fields.liveDomain}`
  }
  if (key === 'environment' && fields.environment.length === 0) {
    return 'main'
  }
  return fields[key]
}

function BindSummary({ fields }: { fields: SiteBindFields }): React.JSX.Element {
  const labels = getSiteBindFieldLabels()
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
      {SUMMARY_FIELDS.map((key) => {
        const value = summaryValue(fields, key)
        if (value.length === 0) {
          return null
        }
        return (
          <div key={key} className="col-span-2 grid grid-cols-subgrid">
            <dt className="text-xs text-muted-foreground">{labels[key]}</dt>
            <dd className="min-w-0 truncate font-mono text-xs">{value}</dd>
          </div>
        )
      })}
    </dl>
  )
}

export function SiteBindDialog(): React.JSX.Element | null {
  const { pending, dismiss, clear } = usePendingSiteBind()
  const fetchSites = useAppStore((state) => state.fetchSites)
  const selectSite = useAppStore((state) => state.selectSite)
  const [selectedPath, setSelectedPath] = useState('')
  const [cloning, setCloning] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')

  // A newer link replaces the old request outright, so the chosen folder must not carry over.
  useEffect(() => {
    setSelectedPath(pending?.candidates[0]?.path ?? '')
    setError('')
  }, [pending?.requestId, pending?.candidates])

  if (!pending) {
    return null
  }
  const strings = getSiteBindStrings()

  const browse = async (): Promise<void> => {
    const picked = await window.api.repos.pickDirectory()
    if (picked) {
      setSelectedPath(picked)
    }
  }

  const clone = async (pendingBind: PendingSiteBind): Promise<void> => {
    const destination = await window.api.repos.pickDirectory()
    if (!destination) {
      return
    }
    setCloning(true)
    setError('')
    try {
      // Orca's own clone: it streams progress and registers the Repo, so this flow never shells git.
      const repo = await window.api.repos.clone({
        url: pendingBind.suggestedCloneUrl,
        destination
      })
      setSelectedPath(repo.path)
    } catch (cloneError) {
      const message = cloneError instanceof Error ? cloneError.message : String(cloneError)
      setError(message)
      toast.error(strings.cloneFailedToast, { description: message })
    } finally {
      setCloning(false)
    }
  }

  const confirm = async (): Promise<void> => {
    const api = siteBindApi()
    if (!api) {
      return
    }
    setConfirming(true)
    setError('')
    try {
      const result = await api.confirm({ requestId: pending.requestId, path: selectedPath })
      if (!result.ok) {
        setError(result.error)
        return
      }
      const { applied } = result.value
      await fetchSites()
      selectSite(applied.siteId)
      clear()
      if (applied.secretError.length > 0) {
        toast.warning(strings.secretFailedToast, { description: applied.secretError })
      } else {
        toast.success(strings.boundToast, { description: applied.path })
      }
    } finally {
      setConfirming(false)
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          dismiss()
        }
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="size-4" />
            {strings.title}
          </DialogTitle>
          <DialogDescription>{strings.description}</DialogDescription>
        </DialogHeader>

        <div className="scrollbar-sleek max-h-[55vh] space-y-4 overflow-y-auto pr-1">
          <section className="space-y-2">
            <h3 className="text-xs font-medium text-muted-foreground">{strings.willStore}</h3>
            <BindSummary fields={pending.fields} />
          </section>

          <p className="flex items-start gap-2 rounded-md bg-muted px-2 py-1.5 text-xs">
            {pending.passwordProvided ? (
              <KeyRound className="mt-0.5 size-3.5 shrink-0" />
            ) : (
              <ShieldOff className="mt-0.5 size-3.5 shrink-0" />
            )}
            {pending.passwordProvided ? strings.passwordNotice : strings.noPasswordNotice}
          </p>

          <SiteBindTargetPicker
            candidates={pending.candidates}
            selectedPath={selectedPath}
            onSelect={setSelectedPath}
            onBrowse={() => void browse()}
            cloneUrl={pending.suggestedCloneUrl}
            cloning={cloning}
            onClone={() => void clone(pending)}
          />

          {error.length > 0 ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={dismiss}>
            {strings.cancel}
          </Button>
          <Button
            disabled={selectedPath.length === 0 || confirming || cloning}
            onClick={() => void confirm()}
          >
            {confirming ? strings.confirming : strings.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default SiteBindDialog
