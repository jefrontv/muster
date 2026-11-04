// The site's import exclusions: paths the file import leaves on the server (skip) or copies
// without asking about their size again (keep). Filled mostly by the large-file prompt.

import { Plus, Trash2 } from 'lucide-react'
import type React from 'react'
import { useState } from 'react'
import {
  MAX_IMPORT_FILE_RULES,
  normalizeImportRulePath,
  type SiteImportFileRule,
  type SiteImportFileRuleAction
} from '../../../../shared/site-import-file-rules'
import type { Site } from '../../../../shared/site-types'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

function draftProblem(draft: string, rules: readonly SiteImportFileRule[]): string | null {
  if (draft.trim() === '') {
    return null
  }
  const path = normalizeImportRulePath(draft)
  if (!path) {
    return translate(
      'auto.components.sites.SiteImportRules.invalid',
      'Use a path inside the webroot, like wp-content/ai1wm-backups.'
    )
  }
  if (rules.some((rule) => rule.path === path)) {
    return translate('auto.components.sites.SiteImportRules.duplicate', 'Already in the list.')
  }
  return null
}

export function SiteImportRulesSection({ site }: { site: Site }): React.JSX.Element {
  const updateSite = useAppStore((state) => state.updateSite)
  const rules = site.importFileRules ?? []
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const problem = draftProblem(draft, rules)
  const canAdd = draft.trim() !== '' && problem === null && rules.length < MAX_IMPORT_FILE_RULES

  const save = async (next: SiteImportFileRule[]): Promise<boolean> => {
    setSaving(true)
    setError(null)
    const failure = await updateSite(site.id, { importFileRules: next })
    setSaving(false)
    setError(failure)
    return failure === null
  }

  const closeAdd = (): void => {
    setAdding(false)
    setDraft('')
  }

  const add = async (): Promise<void> => {
    const path = normalizeImportRulePath(draft)
    if (!canAdd || !path) {
      return
    }
    if (await save([...rules, { path, action: 'skip' }])) {
      closeAdd()
    }
  }

  const setAction = (path: string, action: SiteImportFileRuleAction): void => {
    void save(rules.map((rule) => (rule.path === path ? { ...rule, action } : rule)))
  }

  const remove = (path: string): void => {
    void save(rules.filter((rule) => rule.path !== path))
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-medium text-muted-foreground">
          {translate('auto.components.sites.SiteImportRules.heading', 'Import exclusions')}
        </h3>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={adding || saving || rules.length >= MAX_IMPORT_FILE_RULES}
          onClick={() => setAdding(true)}
        >
          <Plus className="size-3.5" />
          {translate('auto.components.sites.SiteImportRules.add', 'Add path')}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {translate(
          'auto.components.sites.SiteImportRules.caption',
          'Imports ask before copying files over 100 MB or folders over 500 MB. Skip leaves a path on the server; Copy imports it without asking.'
        )}
      </p>

      {rules.length === 0 && !adding ? (
        <p className="text-xs text-muted-foreground">
          {translate('auto.components.sites.SiteImportRules.empty', 'Nothing is excluded.')}
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-foreground/[0.03]">
          {rules.map((rule) => (
            <li key={rule.path} className="flex items-center gap-3 py-1.5 pr-1.5 pl-3">
              <span className="min-w-0 flex-1 truncate font-mono text-xs" title={rule.path}>
                {rule.path}
              </span>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={rule.action}
                disabled={saving}
                aria-label={translate(
                  'auto.components.sites.SiteImportRules.actionLabel',
                  'What imports do with {{path}}',
                  { path: rule.path }
                )}
                onValueChange={(value) => {
                  // Radix sends '' when the pressed item is clicked again; keep the choice.
                  if (value === 'skip' || value === 'keep') {
                    setAction(rule.path, value)
                  }
                }}
              >
                <ToggleGroupItem value="skip" className="h-7 px-2.5 text-xs">
                  {translate('auto.components.sites.SiteImportRules.skip', 'Skip')}
                </ToggleGroupItem>
                <ToggleGroupItem value="keep" className="h-7 px-2.5 text-xs">
                  {translate('auto.components.sites.SiteImportRules.keep', 'Copy')}
                </ToggleGroupItem>
              </ToggleGroup>
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-muted-foreground hover:text-destructive"
                disabled={saving}
                aria-label={translate(
                  'auto.components.sites.SiteImportRules.remove',
                  'Remove {{path}}',
                  { path: rule.path }
                )}
                onClick={() => remove(rule.path)}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
          {adding ? (
            <li className="space-y-1.5 p-1.5">
              <div className="flex items-center gap-1.5">
                <Input
                  autoFocus
                  value={draft}
                  disabled={saving}
                  aria-invalid={problem !== null}
                  aria-label={translate(
                    'auto.components.sites.SiteImportRules.pathLabel',
                    'Path to skip'
                  )}
                  placeholder="wp-content/ai1wm-backups"
                  spellCheck={false}
                  className="h-8 font-mono text-xs md:text-xs"
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      void add()
                    } else if (event.key === 'Escape') {
                      event.preventDefault()
                      closeAdd()
                    }
                  }}
                />
                <Button size="sm" disabled={!canAdd || saving} onClick={() => void add()}>
                  {translate('auto.components.sites.SiteImportRules.save', 'Add')}
                </Button>
                <Button variant="ghost" size="sm" disabled={saving} onClick={closeAdd}>
                  {translate('auto.components.sites.SiteImportRules.cancel', 'Cancel')}
                </Button>
              </div>
              {problem ? <p className="px-3 text-xs text-destructive">{problem}</p> : null}
            </li>
          ) : null}
        </ul>
      )}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </section>
  )
}
