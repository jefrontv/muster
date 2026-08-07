import { Minus, Plus, RotateCcw } from 'lucide-react'
import type { GlobalSettings } from '../../../../shared/types'
import { Button } from '../ui/button'
import { translate } from '@/i18n/i18n'

// Matches the per-pane zoom bounds in useTerminalFontZoom, not the narrower
// Font Size input — Cmd+/- can already reach these sizes, so the default may too.
const MIN_FONT_SIZE = 8
const MAX_FONT_SIZE = 32
const BASE_FONT_SIZE = 14

export function TerminalZoomControl({
  settings,
  updateSettings
}: {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
}): React.JSX.Element {
  const size = settings.terminalFontSize
  const percent = Math.round((size / BASE_FONT_SIZE) * 100)

  const apply = (next: number): void => {
    updateSettings({
      terminalFontSize: Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, next))
    })
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="icon-sm"
        onClick={() => apply(size - 1)}
        disabled={size <= MIN_FONT_SIZE}
      >
        <Minus className="size-3" />
      </Button>
      <span className="w-14 text-center text-sm tabular-nums text-foreground">{percent}%</span>
      <Button
        variant="outline"
        size="icon-sm"
        onClick={() => apply(size + 1)}
        disabled={size >= MAX_FONT_SIZE}
      >
        <Plus className="size-3" />
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => apply(BASE_FONT_SIZE)}
        disabled={size === BASE_FONT_SIZE}
        className="ml-1 gap-1.5"
      >
        <RotateCcw className="size-3" />
        {translate('auto.components.settings.TerminalZoomControl.reset', 'Reset')}
      </Button>
    </div>
  )
}
