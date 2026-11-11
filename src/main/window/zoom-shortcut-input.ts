import type { UIZoomDirection } from '../../shared/ui-zoom-level'
import {
  keybindingMatchesAction,
  type KeybindingActionId,
  type KeybindingInput,
  type KeybindingOverrides
} from '../../shared/keybindings'

const ZOOM_SHORTCUTS: readonly [KeybindingActionId, UIZoomDirection][] = [
  ['zoom.in', 'in'],
  ['zoom.out', 'out'],
  ['zoom.reset', 'reset']
]

export function resolveZoomShortcut(
  input: KeybindingInput,
  keybindings: KeybindingOverrides | undefined
): UIZoomDirection | null {
  // Why: this runs on every keydown; avoid scanning unrelated window shortcuts in the typing path.
  for (const [actionId, direction] of ZOOM_SHORTCUTS) {
    if (
      keybindingMatchesAction(actionId, input, process.platform, keybindings, { context: 'app' })
    ) {
      return direction
    }
  }
  return null
}
