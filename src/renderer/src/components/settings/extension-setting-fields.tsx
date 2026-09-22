// The fields an extension asks the user to fill in, and the one button that commits them.
//
// A local draft rather than a controlled write per keystroke: these end up in the agent config
// files, and rewriting three of those on every character typed is both wasteful and a good way to
// leave a half-typed key in a live config.
//
// The caller keys this on the extension id so switching extensions remounts it. That is why there
// is no reset effect here: a draft cannot outlive the thing it was typed for.

import { useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { translate } from '@/i18n/i18n'
import type { ExtensionSettingSpec } from '../../../../shared/extension-catalog-types'
import type { ExtensionSettingValues } from '../../../../shared/extension-setting-values'

export function ExtensionSettingFields({
  specs,
  stored,
  onSave
}: {
  specs: readonly ExtensionSettingSpec[]
  stored: ExtensionSettingValues
  onSave: (values: ExtensionSettingValues) => Promise<void>
}): React.JSX.Element {
  const [draft, setDraft] = useState<ExtensionSettingValues>(stored)
  const [saving, setSaving] = useState(false)

  const dirty = specs.some((spec) => (draft[spec.key] ?? '') !== (stored[spec.key] ?? ''))

  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      await onSave(draft)
      toast.success(translate('auto.components.extensions.setting_saved', 'Saved'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-2.5 border-t border-border pt-3">
      {specs.map((spec) => (
        <label key={spec.key} className="block space-y-1">
          <span className="text-xs font-medium">{spec.label}</span>
          <Input
            type={spec.secret ? 'password' : 'text'}
            value={draft[spec.key] ?? ''}
            autoComplete="off"
            spellCheck={false}
            className="h-8 font-mono text-xs"
            onChange={(event) =>
              setDraft((previous) => ({ ...previous, [spec.key]: event.target.value }))
            }
          />
          {spec.help ? <span className="block text-xs text-muted-foreground">{spec.help}</span> : null}
        </label>
      ))}
      <div className="flex items-center justify-between gap-3">
        {/* Said plainly because it is true and the user cannot tell from the field: the value goes
            into the agent's own config file, which is not an encrypted store. */}
        <span className="text-xs text-muted-foreground/70">
          {translate(
            'auto.components.extensions.setting_plaintext',
            'Stored in your agent config files, in the clear.'
          )}
        </span>
        <Button size="xs" variant="outline" disabled={!dirty || saving} onClick={() => void save()}>
          {saving ? <LoaderCircle className="size-3 animate-spin" /> : null}
          {translate('auto.components.extensions.setting_save', 'Save')}
        </Button>
      </div>
    </div>
  )
}
