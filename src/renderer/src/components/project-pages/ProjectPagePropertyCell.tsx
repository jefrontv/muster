// One editable property value, shaped by the property type.
import type React from 'react'
import { useEffect, useState } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { ROW_HOVER } from '@/components/ui/hover-fill-classes'
import type {
  PageProperty,
  PagePropertyValue
} from '../../../../shared/project-pages-database-types'

type Props = {
  property: PageProperty
  value: PagePropertyValue
  onChange: (value: PagePropertyValue) => void
  className?: string
}

const FIELD = `h-7 w-full min-w-0 rounded-md bg-transparent px-1.5 text-sm text-foreground outline-none ${ROW_HOVER} focus:bg-accent`

function TextField({ property, value, onChange, className }: Props): React.JSX.Element {
  const [draft, setDraft] = useState(value === null ? '' : String(value))
  useEffect(() => setDraft(value === null ? '' : String(value)), [value])
  const commit = (): void => {
    const next = draft.trim()
    const current = value === null ? '' : String(value)
    if (next !== current) {
      onChange(next === '' ? null : property.type === 'number' ? Number(next) : next)
    }
  }
  return (
    <input
      aria-label={property.name}
      type={property.type === 'number' ? 'number' : property.type === 'date' ? 'date' : 'text'}
      value={draft}
      className={cn(FIELD, className)}
      onChange={(event) => {
        setDraft(event.target.value)
        if (property.type === 'date') {
          onChange(event.target.value || null)
        }
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.currentTarget.blur()
        }
      }}
    />
  )
}

export function ProjectPagePropertyCell(props: Props): React.JSX.Element {
  const { property, value, onChange, className } = props
  if (property.type === 'checkbox') {
    return (
      <div className={cn('flex h-7 items-center px-1.5', className)}>
        <Checkbox
          aria-label={property.name}
          checked={value === true}
          onCheckedChange={(checked) => onChange(checked === true)}
        />
      </div>
    )
  }
  if (property.type !== 'select') {
    return <TextField {...props} />
  }
  const option = property.options?.find((o) => o.id === value)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={property.name}
          className={cn(FIELD, 'flex items-center text-left', className)}
        >
          {option ? (
            <span className="truncate rounded bg-accent px-1.5 py-0.5 text-xs">{option.name}</span>
          ) : (
            <span className="text-muted-foreground">
              {translate('auto.components.projectPages.propertyEmpty', 'Empty')}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {(property.options ?? []).map((choice) => (
          <DropdownMenuItem key={choice.id} onSelect={() => onChange(choice.id)}>
            {choice.name}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onChange(null)}>
          {translate('auto.components.projectPages.propertyClear', 'Clear')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
