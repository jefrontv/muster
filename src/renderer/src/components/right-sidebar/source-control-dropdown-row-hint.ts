import type { DropdownItem } from './source-control-dropdown-items'

// Why: disabled rows carry their reason in `title`; surface it inline so it isn't hover-only. While an op runs every row is disabled for the same reason, so skip the fallback.
export function resolveDropdownRowHint(
  entry: Pick<DropdownItem, 'disabled' | 'hint' | 'title'>,
  isBusy: boolean
): string | undefined {
  if (entry.hint) {
    return entry.hint
  }
  return entry.disabled && !isBusy ? entry.title : undefined
}

export function shouldShowDropdownRowTooltip(
  entry: Pick<DropdownItem, 'title'>,
  inlineHint: string | undefined
): boolean {
  return Boolean(entry.title) && entry.title !== inlineHint
}
