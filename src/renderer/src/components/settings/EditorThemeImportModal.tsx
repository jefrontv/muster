// Choose which of the editor's themes to bring across.
//
// A swatch per row rather than a name alone, because "Winter is Coming (Dark Blue - No Italics)"
// and "Winter is Coming (Dark Black - No Italics)" are the same words to a reader scanning a list
// and obviously different colours to an eye. The three squares are the theme's background, its
// foreground and whatever it paints comments, which is the smallest set that distinguishes two
// themes from the same family.

import { useMemo, useState } from 'react'
import { Check, LoaderCircle, Palette } from 'lucide-react'

import { Button } from '../ui/button'
import { Checkbox } from '../ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { Input } from '../ui/input'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { styleForScope } from '../../../../shared/vscode-theme-to-monaco'
import type { EditorThemeImportCandidate } from '../../../../shared/vscode-themes'

/**
 * Which editor a theme came from, spelled the way the editor spells itself.
 *
 * On the row because both editors ship the same built-in themes, so "Red", "Solarized Dark" and
 * "Tomorrow Night Blue" each appear twice with the same extension name under them. Without this
 * they are two identical rows and the choice between them is a coin toss — and they are not
 * interchangeable: the two installs carry different versions, so the same theme name had 95
 * colours from one and 91 from the other.
 */
const EDITOR_LABEL = { vscode: 'VS Code', cursor: 'Cursor' } as const

function ThemeSwatch({ theme }: { theme: EditorThemeImportCandidate }): React.JSX.Element {
  const background = theme.editorColors['editor.background'] ?? '#00000000'
  const foreground = theme.editorColors['editor.foreground'] ?? '#888888'
  const comment = styleForScope(theme.tokenColors, 'comment')?.foreground ?? foreground
  return (
    <span
      aria-hidden
      className="flex size-7 shrink-0 items-center justify-center rounded border border-border/60"
      style={{ background }}
    >
      <span className="flex gap-0.5">
        <span className="size-1.5 rounded-full" style={{ background: foreground }} />
        <span className="size-1.5 rounded-full" style={{ background: comment }} />
      </span>
    </span>
  )
}

export function EditorThemeImportModal({
  open,
  scanning,
  themes,
  editors,
  skipped,
  error,
  onClose,
  onSave
}: {
  open: boolean
  scanning: boolean
  themes: readonly EditorThemeImportCandidate[]
  editors: readonly string[]
  skipped: number
  error: string | null
  onClose: () => void
  onSave: (themes: EditorThemeImportCandidate[], useForTerminal: boolean) => void
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set())
  const [useForTerminal, setUseForTerminal] = useState(false)

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (needle === '') {
      return themes
    }
    return themes.filter(
      (theme) =>
        theme.name.toLowerCase().includes(needle) ||
        (theme.sourceLabel ?? '').toLowerCase().includes(needle)
    )
  }, [themes, query])

  const chosen = useMemo(
    () => themes.filter((theme) => selected.has(theme.id)),
    [themes, selected]
  )
  // Offered only when something chosen can actually dress a terminal, rather than as a checkbox
  // that silently does nothing for a theme with no ANSI colours.
  const terminalAvailable = chosen.some((theme) => theme.terminal !== null)

  const toggle = (id: string): void => {
    setSelected((previous) => {
      const next = new Set(previous)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="flex max-h-[80vh] max-w-xl flex-col gap-3 overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Palette aria-hidden className="size-4" />
            {translate(
              'auto.components.settings.editor_theme_import.title',
              'Import a theme from your editor'
            )}
          </DialogTitle>
        </DialogHeader>

        {scanning ? (
          <p className="flex items-center gap-2 px-1 py-6 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            {translate(
              'auto.components.settings.editor_theme_import.scanning',
              'Looking for VS Code and Cursor themes…'
            )}
          </p>
        ) : error !== null ? (
          <p className="px-1 py-6 text-sm text-destructive">{error}</p>
        ) : themes.length === 0 ? (
          <p className="px-1 py-6 text-sm text-muted-foreground">
            {translate(
              'auto.components.settings.editor_theme_import.none',
              'No VS Code or Cursor themes found on this machine.'
            )}
          </p>
        ) : (
          <>
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={translate(
                'auto.components.settings.editor_theme_import.search',
                'Search themes…'
              )}
              className="h-8"
            />
            <div className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto rounded-md border border-border">
              {visible.map((theme) => (
                <label
                  key={theme.id}
                  className={cn(
                    'flex cursor-pointer items-center gap-2.5 border-b border-border/40 px-3 py-2 text-sm hover:bg-muted/40',
                    selected.has(theme.id) && 'bg-muted/60'
                  )}
                >
                  <Checkbox
                    checked={selected.has(theme.id)}
                    onCheckedChange={() => toggle(theme.id)}
                    aria-label={theme.name}
                  />
                  <ThemeSwatch theme={theme} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{theme.name}</span>
                    <span className="truncate text-[11px] text-muted-foreground">
                      {EDITOR_LABEL[theme.source]} · {theme.sourceLabel} · {theme.mode}
                      {theme.terminal !== null
                        ? ` · ${translate('auto.components.settings.editor_theme_import.has_terminal', 'terminal colours')}`
                        : ''}
                    </span>
                  </span>
                  {theme.active ? (
                    <span className="flex shrink-0 items-center gap-1 rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      <Check className="size-2.5" />
                      {translate('auto.components.settings.editor_theme_import.in_use', 'In use')}
                    </span>
                  ) : null}
                </label>
              ))}
            </div>
            <p className="px-1 text-[11px] text-muted-foreground">
              {editors.join(' · ')}
              {skipped > 0
                ? ` · ${translate('auto.components.settings.editor_theme_import.skipped', '{{count}} could not be read').replace('{{count}}', String(skipped))}`
                : ''}
            </p>
          </>
        )}

        <div className="flex items-center gap-2 border-t border-border pt-3">
          {terminalAvailable ? (
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <Checkbox
                checked={useForTerminal}
                onCheckedChange={(next) => setUseForTerminal(next === true)}
              />
              {translate(
                'auto.components.settings.editor_theme_import.use_for_terminal',
                'Use its colours for the terminal too'
              )}
            </label>
          ) : null}
          <Button variant="ghost" size="sm" className="ml-auto" onClick={onClose}>
            {translate('auto.components.settings.editor_theme_import.cancel', 'Cancel')}
          </Button>
          <Button size="sm" disabled={chosen.length === 0} onClick={() => onSave(chosen, useForTerminal)}>
            {translate('auto.components.settings.editor_theme_import.confirm', 'Import {{count}}')
              .replace('{{count}}', String(chosen.length))}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
