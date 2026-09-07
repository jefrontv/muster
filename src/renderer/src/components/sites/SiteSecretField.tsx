// A stored credential edited like every other field on the pane.
//
// The stored secret is never returned to the renderer, so this field cannot show or edit the real
// value: a stored secret renders as a masked sentinel and an edit always starts from an empty box.
// It rides the same locked/edit chrome as the text fields, which is also what retired the old
// commit-on-blur behaviour — tabbing past this field used to be enough to overwrite a password.
// Saving an empty box is the explicit clear.

import { KeyRound } from 'lucide-react'
import type React from 'react'
import type { SiteSecretKind } from '../../../../shared/site-types'
import { SiteEditableField } from './SiteEditableField'

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
  return (
    <SiteEditableField
      secret
      label={label}
      labelIcon={<KeyRound className="size-3 shrink-0" />}
      // Only ever DISPLAYED, never sent: eight dots standing in for a value this process does
      // not have.
      value={isSet ? '••••••••' : ''}
      onCommit={(next) => onSetSecret(kind, next)}
    />
  )
}
