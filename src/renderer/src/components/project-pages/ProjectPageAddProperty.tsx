// Adds a property to a database: a name, a type, and options for selects.
import { Plus } from 'lucide-react'
import type React from 'react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { translate } from '@/i18n/i18n'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'
import { cn } from '@/lib/utils'
import type {
  PageDatabaseSchema,
  PageProperty,
  PagePropertyType
} from '../../../../shared/project-pages-database-types'

const propertyTypes = createLocalizedCatalog((): { type: PagePropertyType; label: string }[] => [
  { type: 'text', label: translate('auto.components.projectPages.type.text', 'Text') },
  { type: 'number', label: translate('auto.components.projectPages.type.number', 'Number') },
  { type: 'select', label: translate('auto.components.projectPages.type.select', 'Select') },
  { type: 'checkbox', label: translate('auto.components.projectPages.type.checkbox', 'Checkbox') },
  { type: 'date', label: translate('auto.components.projectPages.type.date', 'Date') }
])

function propertyId(name: string, taken: Set<string>): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 30) || 'prop'
  let id = base
  for (let i = 2; taken.has(id) || id === 'title'; i++) {
    id = `${base}_${i}`
  }
  return id
}

export function ProjectPageAddProperty({
  schema,
  onSave
}: {
  schema: PageDatabaseSchema
  onSave: (schema: PageDatabaseSchema) => Promise<unknown>
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState<PagePropertyType>('text')
  const [options, setOptions] = useState('')

  async function save(): Promise<void> {
    const trimmed = name.trim()
    if (!trimmed) {
      return
    }
    const property: PageProperty = {
      id: propertyId(trimmed, new Set(schema.properties.map((p) => p.id))),
      name: trimmed,
      type
    }
    if (type === 'select') {
      property.options = options
        .split(',')
        .map((option) => option.trim())
        .filter(Boolean)
        .map((option, i) => ({ id: `o${i + 1}`, name: option }))
    }
    await onSave({ ...schema, properties: [...schema.properties, property] })
    setOpen(false)
    setName('')
    setOptions('')
    setType('text')
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={translate('auto.components.projectPages.addProperty', 'Add property')}
          title={translate('auto.components.projectPages.addProperty', 'Add property')}
        >
          <Plus className="size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-64 flex-col gap-2">
        <Input
          autoFocus
          value={name}
          placeholder={translate('auto.components.projectPages.propertyName', 'Property name')}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              void save()
            }
          }}
        />
        <div className="flex flex-wrap gap-1" role="radiogroup">
          {propertyTypes().map((entry) => (
            <button
              key={entry.type}
              type="button"
              role="radio"
              aria-checked={type === entry.type}
              className={cn(
                'rounded-md border border-border px-2 py-0.5 text-xs',
                type === entry.type ? 'bg-accent text-foreground' : 'text-muted-foreground'
              )}
              onClick={() => setType(entry.type)}
            >
              {entry.label}
            </button>
          ))}
        </div>
        {type === 'select' ? (
          <Input
            value={options}
            placeholder={translate(
              'auto.components.projectPages.propertyOptions',
              'Options, separated by commas'
            )}
            onChange={(event) => setOptions(event.target.value)}
          />
        ) : null}
        <Button size="sm" disabled={!name.trim()} onClick={() => void save()}>
          {translate('auto.components.projectPages.addProperty', 'Add property')}
        </Button>
      </PopoverContent>
    </Popover>
  )
}
