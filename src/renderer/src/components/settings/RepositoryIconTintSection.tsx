// Optional recolour for an image icon (favicon/upload). "None" leads the row and
// is the default, so an icon keeps its own artwork until the user asks otherwise.

import { Ban } from 'lucide-react'
import { REPO_COLORS } from '../../../../shared/constants'
import { normalizeRepoBadgeColor } from '../../../../shared/repo-badge-color'
import { Label } from '../ui/label'
import { ColorPicker } from '../ui/color-picker'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'

const SWATCH_BASE =
  'size-7 rounded-[4px] outline-none transition-all focus-visible:ring-[3px] focus-visible:ring-ring/50'

function swatchRing(selected: boolean): string {
  return selected
    ? 'ring-2 ring-foreground ring-offset-2 ring-offset-background'
    : 'hover:ring-1 hover:ring-muted-foreground hover:ring-offset-2 hover:ring-offset-background'
}

export function RepositoryIconTintSection({
  tint,
  onTintChange
}: {
  tint: string | null
  onTintChange: (tint: string | null) => void
}): React.JSX.Element {
  const selected = normalizeRepoBadgeColor(tint)
  const isPreset = REPO_COLORS.some((color) => color === selected)

  return (
    <div className="space-y-2">
      <Label className="text-sm font-semibold">
        {translate('auto.components.settings.RepositoryIconTintSection.label', 'Icon color')}
      </Label>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onTintChange(null)}
          aria-label={translate(
            'auto.components.settings.RepositoryIconTintSection.none',
            'Keep the original icon colors'
          )}
          aria-pressed={selected === null}
          className={cn(
            SWATCH_BASE,
            swatchRing(selected === null),
            'flex items-center justify-center border border-border bg-muted/40 text-muted-foreground'
          )}
        >
          <Ban className="size-3.5" />
        </button>
        {REPO_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            onClick={() => onTintChange(color)}
            aria-label={translate(
              'auto.components.settings.RepositoryIconTintSection.swatch',
              'Recolor the icon {{value0}}',
              { value0: color }
            )}
            aria-pressed={selected === color}
            className={cn(SWATCH_BASE, swatchRing(selected === color))}
            style={{ backgroundColor: color }}
          />
        ))}
        <ColorPicker
          value={selected ?? REPO_COLORS[0]}
          onChange={onTintChange}
          label={translate(
            'auto.components.settings.RepositoryIconTintSection.custom',
            'Custom icon color'
          )}
          selected={selected !== null && !isPreset}
          triggerLabel="Custom"
          showHexInTrigger={selected !== null && !isPreset}
          className="h-7 px-2"
        />
      </div>
    </div>
  )
}
