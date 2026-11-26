import { ChevronDown } from 'lucide-react'
import type React from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'

/** The pencil in a review row's control slot; it opens the row's settings beneath it. */
export function SiteSetupRowEditButton({
  expanded,
  onToggle,
  label,
  controls,
  disabled
}: {
  expanded: boolean
  onToggle: () => void
  label: string
  controls: string
  disabled?: boolean
}): React.JSX.Element {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      aria-expanded={expanded}
      aria-controls={controls}
      data-state={expanded ? 'open' : 'closed'}
      disabled={disabled}
      onClick={onToggle}
    >
      <ChevronDown className={cn('transition-transform', expanded && 'rotate-180')} />
    </Button>
  )
}

/** A labelled checkbox heading a row's expanded settings. */
export function SiteSetupRowSwitch({
  checked,
  disabled,
  onChange,
  children
}: {
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <label className="flex items-center gap-2 text-xs">
      <Checkbox
        checked={checked}
        disabled={disabled}
        onCheckedChange={(next) => onChange(next === true)}
      />
      {children}
    </label>
  )
}
