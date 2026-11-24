// Which project's pages are showing.
import type React from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { translate } from '@/i18n/i18n'

export function ProjectPagesScopePicker(props: {
  options: { key: string; label: string }[]
  value: string | null
  onChange: (key: string) => void
}): React.JSX.Element | null {
  if (props.options.length === 0 || !props.value) {
    return null
  }
  return (
    <Select value={props.value} onValueChange={props.onChange}>
      <SelectTrigger
        size="sm"
        className="ml-2 h-7 max-w-56"
        aria-label={translate('auto.components.projectPages.project', 'Project')}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {props.options.map((option) => (
          <SelectItem key={option.key} value={option.key}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
