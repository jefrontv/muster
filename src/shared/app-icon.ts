// Retired ids (watercolor, blue) normalize to the default, which clears any saved macOS bundle icon.
export const APP_ICON_OPTIONS = [
  { id: 'classic', label: 'Muster' },
  { id: 'dark', label: 'Dark Muster' }
] as const

export type AppIconId = (typeof APP_ICON_OPTIONS)[number]['id']

export const DEFAULT_APP_ICON_ID: AppIconId = 'classic'

export function normalizeAppIconId(value: unknown): AppIconId {
  return APP_ICON_OPTIONS.some((option) => option.id === value)
    ? (value as AppIconId)
    : DEFAULT_APP_ICON_ID
}
