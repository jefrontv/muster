// The code editor's theme: one choice for dark, one for light, and the import that fills them.
//
// Two choices rather than one because the app already follows the system appearance, and a single
// theme would mean picking a dark editor and watching it stay dark on a white interface. This
// mirrors the terminal's dark/light pair for the same reason it exists there.

import { Palette } from 'lucide-react'

import { Button } from '../ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { SettingsRow, SettingsSubsectionHeader } from './SettingsFormControls'
import { EditorThemeImportModal } from './EditorThemeImportModal'
import { useEditorThemeImport } from './useEditorThemeImport'
import { editorThemeOptions } from '@/lib/editor-theme'
import { translate } from '@/i18n/i18n'
import { normalizeEditorCustomThemes } from '../../../../shared/vscode-themes'
import type { GlobalSettings } from '../../../../shared/types'

/** The stored id, or '' for Monaco's own. Select needs a non-empty value, so '' becomes a token. */
const BUILTIN_VALUE = '__builtin__'

function ThemeSelect({
  label,
  mode,
  settings,
  updateSettings
}: {
  label: string
  mode: 'dark' | 'light'
  settings: GlobalSettings
  updateSettings: (patch: Partial<GlobalSettings>) => void
}): React.JSX.Element {
  const themes = normalizeEditorCustomThemes(settings.editorCustomThemes)
  const options = editorThemeOptions(themes, mode)
  const current = (mode === 'dark' ? settings.editorThemeDark : settings.editorThemeLight) ?? ''
  // A theme that has been removed still has its id in settings; showing the built-in matches what
  // the editor actually renders, which falls back for exactly the same reason.
  const known = current !== '' && options.some((option) => option.value === current)

  return (
    <SettingsRow
      label={label}
      control={
        <Select
        value={known ? current : BUILTIN_VALUE}
        onValueChange={(next) => {
          const value = next === BUILTIN_VALUE ? undefined : next
          updateSettings(mode === 'dark' ? { editorThemeDark: value } : { editorThemeLight: value })
        }}
      >
        <SelectTrigger className="h-8 w-60 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem
              key={option.value === '' ? BUILTIN_VALUE : option.value}
              value={option.value === '' ? BUILTIN_VALUE : option.value}
            >
              <span className="truncate">{option.label}</span>
              {option.sourceLabel ? (
                <span className="ml-2 text-[11px] text-muted-foreground">{option.sourceLabel}</span>
              ) : null}
            </SelectItem>
          ))}
          </SelectContent>
        </Select>
      }
    />
  )
}

export function EditorAppearanceSection({
  settings,
  updateSettings
}: {
  settings: GlobalSettings
  updateSettings: (patch: Partial<GlobalSettings>) => void
}): React.JSX.Element {
  const themeImport = useEditorThemeImport({ settings, updateSettings })
  const count = normalizeEditorCustomThemes(settings.editorCustomThemes).length

  return (
    <div className="space-y-3">
      <SettingsSubsectionHeader
        title={translate('auto.components.settings.editor_appearance.theme_title', 'Editor theme')}
        description={translate(
          'auto.components.settings.editor_appearance.theme_description',
          'Applies to the code editor, diffs and notebooks.'
        )}
      />

      <ThemeSelect
        label={translate('auto.components.settings.editor_appearance.dark', 'Dark')}
        mode="dark"
        settings={settings}
        updateSettings={updateSettings}
      />
      <ThemeSelect
        label={translate('auto.components.settings.editor_appearance.light', 'Light')}
        mode="light"
        settings={settings}
        updateSettings={updateSettings}
      />

      <SettingsRow
        label={translate('auto.components.settings.editor_appearance.import', 'Import themes')}
        description={
          count === 0
            ? translate(
                'auto.components.settings.editor_appearance.import_description',
                'Bring a theme across from VS Code or Cursor.'
              )
            : translate(
                'auto.components.settings.editor_appearance.imported_count',
                '{{count}} imported'
              ).replace('{{count}}', String(count))
        }
        control={
          <Button variant="outline" size="sm" className="gap-2" onClick={themeImport.start}>
            <Palette aria-hidden className="size-3.5" />
            {translate('auto.components.settings.editor_appearance.import_button', 'Import…')}
          </Button>
        }
      />

      <EditorThemeImportModal
        open={themeImport.open}
        scanning={themeImport.scanning}
        themes={themeImport.preview?.themes ?? []}
        editors={themeImport.preview?.editors ?? []}
        skipped={themeImport.preview?.skipped ?? 0}
        error={themeImport.error}
        onClose={themeImport.close}
        onSave={themeImport.save}
      />
    </div>
  )
}
