// A stored credential edited like every other field on the pane.
//
// The stored secret is never returned to the renderer, so this field cannot show or edit the real
// value. It reads as a normal filled password input anyway: a stored secret renders as a masked
// sentinel, focusing selects it all, and typing replaces it — the same pattern router admin pages
// and macOS Wi-Fi settings use. Commit happens on blur (or Enter), and only when the field was
// actually edited — blurring past an untouched field must never wipe the secret. Emptying an
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

  // Only ever DISPLAYED, never sent: type=password masks it, so the user sees eight dots standing
  // in for a value this process does not have.
  const SENTINEL = '••••••••'
  const displayValue = edited ? value : isSet ? SENTINEL : ''

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
        value={displayValue}
        autoComplete="off"
        placeholder={translate(
          'auto.components.sites.SiteEnvironmentSection.secretEnter',
          'Enter value'
        )}
        onFocus={(event) => {
          // A click anywhere in the field arms replace-on-type; a blur without typing puts the
          // sentinel back and touches nothing.
          if (!edited && isSet) {
            event.currentTarget.select()
          }
        }}
        onChange={(event) => {
          let next = event.target.value
          // The select-all can be defeated (arrow key, then type); anything typed around the
          // sentinel is a replacement, not an edit of dots that never were the secret.
          if (!edited && isSet && next.includes(SENTINEL)) {
            next = next.replace(SENTINEL, '')
          }
          setValue(next)
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
