// The Serve row's editor: which stack, which domain. Expands in place under the row rather than in
// a popover - the popover was a cramped second surface floating over the list, and the row's
// children slot already gives the fields the full text column.

import { Pencil } from 'lucide-react'
import type React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import type { SiteLocalStack } from '../../../../shared/site-types'
import {
  DDEV_SITE_SUFFIX,
  ddevDomainFromName,
  ddevNameFromValue,
  normalizeDdevName
} from './site-setup-domain-rules'
import { getSiteSetupReviewStrings } from './site-setup-review-strings'

export type SiteSetupServeValue = {
  stack: SiteLocalStack | null
  domain: string
}

/** The pencil in the row's control slot; `expanded` mirrors the editor below it. */
export function SiteSetupServeEditToggle({
  expanded,
  onToggle,
  disabled
}: {
  expanded: boolean
  onToggle: () => void
  disabled?: boolean
}): React.JSX.Element {
  const strings = getSiteSetupReviewStrings()
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={strings.serveEditLabel}
      aria-expanded={expanded}
      aria-controls="site-setup-serve-editor"
      data-state={expanded ? 'open' : 'closed'}
      disabled={disabled}
      onClick={onToggle}
    >
      <Pencil />
    </Button>
  )
}

export function SiteSetupServeEditor({
  stacks,
  value,
  onChange,
  ruledOut,
  error = ''
}: {
  stacks: SiteLocalStack[]
  value: SiteSetupServeValue
  onChange: (value: SiteSetupServeValue) => void
  ruledOut: Partial<Record<SiteLocalStack, string>>
  /** A rule the domain breaks, or the site that already holds it. */
  error?: string
}): React.JSX.Element {
  const strings = getSiteSetupReviewStrings()
  const stackLabel = (stack: SiteLocalStack): string =>
    stack === 'agent-local'
      ? strings.serveStackAgentLocal
      : stack === 'ddev'
        ? strings.serveStackDdev
        : strings.serveStackLocalWp
  const selectedReason = value.stack ? ruledOut[value.stack] : undefined

  return (
    <div id="site-setup-serve-editor" className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)]">
      {stacks.length > 1 ? (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{strings.serveStackLabel}</Label>
          {/* A Select, not a button group: three or four stacks do not fit a row. */}
          <Select
            value={value.stack ?? undefined}
            onValueChange={(next) => onChange({ ...value, stack: next as SiteLocalStack })}
          >
            <SelectTrigger size="sm" className="h-8 w-[160px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {stacks.map((stack) => (
                <SelectItem
                  key={stack}
                  value={stack}
                  disabled={stack in ruledOut}
                  className="text-xs"
                >
                  {stackLabel(stack)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      <div className="space-y-1.5">
        <Label htmlFor="site-setup-serve-domain" className="text-xs text-muted-foreground">
          {strings.serveDomainLabel}
        </Label>
        {value.stack === 'ddev' ? (
          // DDEV serves <project>.ddev.site: only the project name is the user's to choose.
          <div
            className={cn(
              'flex h-8 items-center rounded-md border border-input bg-transparent font-mono text-xs shadow-xs transition-[color,box-shadow] dark:bg-input/30',
              'focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50',
              error && 'border-destructive ring-destructive/20 dark:ring-destructive/40'
            )}
          >
            <input
              id="site-setup-serve-domain"
              className="h-full min-w-0 flex-1 bg-transparent pl-3 outline-none"
              value={ddevNameFromValue(value.domain)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'site-setup-serve-domain-error' : undefined}
              spellCheck={false}
              onChange={(event) =>
                onChange({
                  ...value,
                  domain: ddevDomainFromName(normalizeDdevName(event.target.value))
                })
              }
            />
            <span className="shrink-0 pr-3 text-muted-foreground">{DDEV_SITE_SUFFIX}</span>
          </div>
        ) : (
          <Input
            id="site-setup-serve-domain"
            className="h-8 font-mono text-xs"
            value={value.domain}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'site-setup-serve-domain-error' : undefined}
            onChange={(event) => onChange({ ...value, domain: event.target.value })}
          />
        )}
        {error ? (
          <p id="site-setup-serve-domain-error" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </div>
      {selectedReason ? (
        <p className="text-xs text-muted-foreground sm:col-span-2">{selectedReason}</p>
      ) : null}
    </div>
  )
}
