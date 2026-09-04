// The Serve row's editor: which stack, which domain. Expands in place under the row rather than in
// a popover - the popover was a cramped second surface floating over the list, and the row's
// children slot already gives the fields the full text column.

import { Pencil } from 'lucide-react'
import type React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { SiteLocalStack } from '../../../../shared/site-types'
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
  ruledOut
}: {
  stacks: SiteLocalStack[]
  value: SiteSetupServeValue
  onChange: (value: SiteSetupServeValue) => void
  ruledOut: Partial<Record<SiteLocalStack, string>>
}): React.JSX.Element {
  const strings = getSiteSetupReviewStrings()
  const stackLabel = (stack: SiteLocalStack): string =>
    stack === 'agent-local' ? strings.serveStackAgentLocal : strings.serveStackLocalWp
  const selectedReason = value.stack ? ruledOut[value.stack] : undefined

  return (
    <div id="site-setup-serve-editor" className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)]">
      {stacks.length > 1 ? (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{strings.serveStackLabel}</Label>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={value.stack ?? undefined}
            onValueChange={(next) => {
              if (next) {
                onChange({ ...value, stack: next as SiteLocalStack })
              }
            }}
          >
            {stacks.map((stack) => (
              <ToggleGroupItem
                key={stack}
                value={stack}
                disabled={stack in ruledOut}
                className="px-2.5 text-xs"
              >
                {stackLabel(stack)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      ) : null}
      <div className="space-y-1.5">
        <Label htmlFor="site-setup-serve-domain" className="text-xs text-muted-foreground">
          {strings.serveDomainLabel}
        </Label>
        <Input
          id="site-setup-serve-domain"
          className="h-8 font-mono text-xs"
          value={value.domain}
          onChange={(event) => onChange({ ...value, domain: event.target.value })}
        />
      </div>
      {selectedReason ? (
        <p className="text-xs text-muted-foreground sm:col-span-2">{selectedReason}</p>
      ) : null}
    </div>
  )
}
