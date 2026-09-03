// The `✎` control on the Serve row (plan doc "Serve popover"): which stack, which domain. A
// separate component because the same picker has to work both inside SiteSetupRow's control slot
// (closed, one icon button) and its own focused surface once opened — a Popover keeps the row
// itself from growing when nothing is being edited.

import { Pencil } from 'lucide-react'
import type React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { SiteLocalStack } from '../../../../shared/site-types'
import { getSiteSetupReviewStrings } from './site-setup-review-strings'

export type SiteSetupServePopoverValue = {
  stack: SiteLocalStack | null
  domain: string
}

export function SiteSetupServePopover({
  stacks,
  value,
  onChange,
  ruledOut,
  disabled
}: {
  stacks: SiteLocalStack[]
  value: SiteSetupServePopoverValue
  onChange: (value: SiteSetupServePopoverValue) => void
  ruledOut: Partial<Record<SiteLocalStack, string>>
  disabled?: boolean
}): React.JSX.Element {
  const strings = getSiteSetupReviewStrings()
  const stackLabel = (stack: SiteLocalStack): string =>
    stack === 'agent-local' ? strings.serveStackAgentLocal : strings.serveStackLocalWp
  const selectedReason = value.stack ? ruledOut[value.stack] : undefined

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={strings.serveEditLabel}
          disabled={disabled}
        >
          <Pencil />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3">
        {stacks.length > 1 ? (
          <div className="space-y-1">
            <Label>{strings.serveStackLabel}</Label>
            <ToggleGroup
              type="single"
              variant="outline"
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
            {selectedReason ? (
              <p className="text-xs text-muted-foreground">{selectedReason}</p>
            ) : null}
          </div>
        ) : null}
        <div className="space-y-1">
          <Label htmlFor="site-setup-serve-domain">{strings.serveDomainLabel}</Label>
          <Input
            id="site-setup-serve-domain"
            value={value.domain}
            onChange={(event) => onChange({ ...value, domain: event.target.value })}
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}

export default SiteSetupServePopover
