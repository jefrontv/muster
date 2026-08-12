// A stored credential edited like every other field on the pane.
//
// Why no Save/Clear buttons: the rest of this form commits as you type, so two extra controls per
// secret read as a different kind of setting and pushed the passwords into their own block far
// from the user they belong to. Commit happens on blur (or Enter), and only when the field was
// actually edited — an untouched empty box next to a stored secret must never wipe it. Emptying an
// edited box is the clear.

import { KeyRound } from 'lucide-react'
import type React from 'react'
import { useState } from 'react'
import type { SiteSecretKind } from '../../../../shared/site-types'
import { translate } from '@/i18n/i18n'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function SiteSecretField({
  kind,
  label,
  isSet,
  onSetSecret
}: {
  kind: SiteSecretKind
  label: string
  isSet: boolean
  onSetSecret: (kind: SiteSecretKind, value: string) => void
}): React.JSX.Element {
  const [value, setValue] = useState('')
  const [edited, setEdited] = useState(false)

  const commit = (): void => {
    if (!edited) {
      return
    }
    setEdited(false)
    setValue('')
    onSetSecret(kind, value)
  }

  return (
    <div className="space-y-1">
      {/* No stored/not-set badge: it wrapped the label onto a second line in a two-column grid,
          knocking this field out of alignment with its partner — and the placeholder below
          already says which state the secret is in. */}
      <Label className="flex items-center gap-1.5 text-xs whitespace-nowrap">
        <KeyRound className="size-3 shrink-0" />
        {label}
      </Label>
      <Input
        type="password"
        value={value}
        autoComplete="off"
        placeholder={
          isSet
            ? translate(
                'auto.components.sites.SiteEnvironmentSection.secretReplace',
                'Enter a new value to replace'
              )
            : translate('auto.components.sites.SiteEnvironmentSection.secretEnter', 'Enter value')
        }
        onChange={(event) => {
          setValue(event.target.value)
          setEdited(true)
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur()
          }
        }}
      />
    </div>
  )
}
