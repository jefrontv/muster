// Two-step "add environment": how (blank or copy), then what to call it.
//
// The name step suggests the checkout's local branch names because environment resolution is
// branch-match first — an environment named after a real branch is one runs will actually
// target without confirmation. Suggestions never constrain: free text is always accepted.
//
// Copy goes through sites:copyEnvironment so the duplicate keeps its stored SSH/DB passwords;
// duplicating only the visible fields would look configured while every run failed auth.

import { ArrowLeft, Copy, Plus } from 'lucide-react'
import type React from 'react'
import { useEffect, useId, useState } from 'react'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type AddSiteEnvironmentDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  siteId: string
  environmentNames: readonly string[]
  /** The chip selected in the panel — the natural default source for a copy. */
  defaultSource: string
  onCreated: (name: string) => void
}

type Step = 'mode' | 'name'
type Mode = 'create' | 'copy'

export function AddSiteEnvironmentDialog({
  open,
  onOpenChange,
  siteId,
  environmentNames,
  defaultSource,
  onCreated
}: AddSiteEnvironmentDialogProps): React.JSX.Element {
  const upsertSiteEnvironment = useAppStore((state) => state.upsertSiteEnvironment)
  const copySiteEnvironment = useAppStore((state) => state.copySiteEnvironment)

  const [step, setStep] = useState<Step>('mode')
  const [mode, setMode] = useState<Mode>('create')
  const [source, setSource] = useState(defaultSource)
  const [name, setName] = useState('')
  const [branches, setBranches] = useState<string[]>([])
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(-1)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const listboxId = useId()

  useEffect(() => {
    if (!open) {
      return
    }
    // Fresh dialog per open — a stale name or error from the last add would read as this add's.
    setStep('mode')
    setMode('create')
    setSource(defaultSource)
    setName('')
    setSubmitError('')
    setSuggestionsOpen(false)
    setHighlighted(-1)
    let cancelled = false
    void window.api.sites.listBranches(siteId).then((result) => {
      if (!cancelled) {
        setBranches(result.ok ? result.value : [])
      }
    })
    return () => {
      cancelled = true
    }
  }, [open, siteId, defaultSource])

  const trimmed = name.trim()
  const duplicate = environmentNames.includes(trimmed)
  const valid = trimmed.length > 0 && !duplicate
  const suggestions = branches.filter((branch) =>
    branch.toLowerCase().includes(trimmed.toLowerCase())
  )
  const showSuggestions = suggestionsOpen && suggestions.length > 0

  const pickMode = (next: Mode): void => {
    setMode(next)
    setStep('name')
  }

  const submit = async (): Promise<void> => {
    if (!valid || submitting) {
      return
    }
    setSubmitting(true)
    const error =
      mode === 'copy'
        ? await copySiteEnvironment(siteId, source, trimmed)
        : await upsertSiteEnvironment(siteId, trimmed)
    setSubmitting(false)
    if (error) {
      setSubmitError(error)
      return
    }
    onCreated(trimmed)
    onOpenChange(false)
  }

  const onNameKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Escape' && showSuggestions) {
      event.preventDefault()
      // Stop here so Radix does not also close the dialog on the same keystroke.
      event.stopPropagation()
      setSuggestionsOpen(false)
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setSuggestionsOpen(true)
      if (suggestions.length > 0) {
        const delta = event.key === 'ArrowDown' ? 1 : -1
        setHighlighted((current) =>
          current < 0
            ? delta > 0
              ? 0
              : suggestions.length - 1
            : Math.min(Math.max(current + delta, 0), suggestions.length - 1)
        )
      }
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const picked = showSuggestions && highlighted >= 0 ? suggestions[highlighted] : null
      if (picked) {
        setName(picked)
        setSuggestionsOpen(false)
        setHighlighted(-1)
        return
      }
      void submit()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {translate('auto.components.sites.AddSiteEnvironmentDialog.title', 'Add environment')}
          </DialogTitle>
          <DialogDescription>
            {step === 'mode'
              ? translate(
                  'auto.components.sites.AddSiteEnvironmentDialog.modeHint',
                  'Start blank, or copy an existing environment including its stored passwords.'
                )
              : translate(
                  'auto.components.sites.AddSiteEnvironmentDialog.nameHint',
                  'Name it after a git branch and runs on that branch target it automatically.'
                )}
          </DialogDescription>
        </DialogHeader>

        {step === 'mode' ? (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => pickMode('create')}
              className="flex w-full items-center gap-3 rounded-md border border-border px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <Plus className="size-4 shrink-0 text-muted-foreground" />
              {translate(
                'auto.components.sites.AddSiteEnvironmentDialog.createNew',
                'Create new environment'
              )}
            </button>
            <button
              type="button"
              disabled={environmentNames.length === 0}
              onClick={() => pickMode('copy')}
              className="flex w-full items-center gap-3 rounded-md border border-border px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
            >
              <Copy className="size-4 shrink-0 text-muted-foreground" />
              {translate(
                'auto.components.sites.AddSiteEnvironmentDialog.copyExisting',
                'Copy existing environment'
              )}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {mode === 'copy' ? (
              <div className="space-y-1">
                <Label className="text-xs">
                  {translate(
                    'auto.components.sites.AddSiteEnvironmentDialog.copyFrom',
                    'Copy from'
                  )}
                </Label>
                <div
                  role="radiogroup"
                  aria-label={translate(
                    'auto.components.sites.AddSiteEnvironmentDialog.copyFrom',
                    'Copy from'
                  )}
                  className="flex flex-wrap gap-1.5"
                >
                  {environmentNames.map((environmentName) => (
                    <button
                      key={environmentName}
                      type="button"
                      role="radio"
                      aria-checked={environmentName === source}
                      onClick={() => setSource(environmentName)}
                      className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                        environmentName === source
                          ? 'border-transparent bg-primary text-primary-foreground'
                          : 'border-border hover:bg-accent hover:text-accent-foreground'
                      }`}
                    >
                      {environmentName}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="space-y-1">
              <Label className="text-xs" htmlFor={`${listboxId}-input`}>
                {translate('auto.components.sites.AddSiteEnvironmentDialog.name', 'Name')}
              </Label>
              <Input
                id={`${listboxId}-input`}
                value={name}
                autoComplete="off"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={showSuggestions}
                aria-controls={listboxId}
                aria-invalid={trimmed.length > 0 && duplicate}
                aria-activedescendant={
                  showSuggestions && highlighted >= 0
                    ? `${listboxId}-option-${highlighted}`
                    : undefined
                }
                placeholder={translate(
                  'auto.components.sites.AddSiteEnvironmentDialog.namePlaceholder',
                  'staging'
                )}
                onChange={(event) => {
                  setName(event.target.value)
                  setSubmitError('')
                  setSuggestionsOpen(true)
                  setHighlighted(-1)
                }}
                onFocus={() => setSuggestionsOpen(true)}
                onKeyDown={onNameKeyDown}
              />
              {showSuggestions ? (
                <div
                  id={listboxId}
                  role="listbox"
                  className="scrollbar-sleek max-h-40 overflow-y-auto rounded-md border border-border p-1"
                >
                  {suggestions.map((branch, index) => (
                    <button
                      key={branch}
                      type="button"
                      id={`${listboxId}-option-${index}`}
                      role="option"
                      aria-selected={index === highlighted}
                      onMouseEnter={() => setHighlighted(index)}
                      onClick={() => {
                        setName(branch)
                        setSuggestionsOpen(false)
                        setHighlighted(-1)
                      }}
                      className={`flex w-full items-center rounded-sm px-2 py-1.5 text-left font-mono text-xs transition-colors ${
                        index === highlighted
                          ? 'bg-accent text-accent-foreground'
                          : 'hover:bg-muted/60'
                      }`}
                    >
                      {branch}
                    </button>
                  ))}
                </div>
              ) : null}
              {trimmed.length > 0 && duplicate ? (
                <p className="text-xs text-destructive">
                  {translate(
                    'auto.components.sites.AddSiteEnvironmentDialog.duplicateName',
                    'An environment with this name already exists.'
                  )}
                </p>
              ) : null}
              {submitError ? <p className="text-xs text-destructive">{submitError}</p> : null}
            </div>

            <div className="flex items-center justify-between">
              <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setStep('mode')}>
                <ArrowLeft className="size-3.5" />
                {translate('auto.components.sites.AddSiteEnvironmentDialog.back', 'Back')}
              </Button>
              <Button size="sm" disabled={!valid || submitting} onClick={() => void submit()}>
                {mode === 'copy'
                  ? translate('auto.components.sites.AddSiteEnvironmentDialog.copy', 'Copy')
                  : translate('auto.components.sites.AddSiteEnvironmentDialog.create', 'Create')}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default AddSiteEnvironmentDialog
