import { CONTROL_HOVER } from '@/components/ui/hover-fill-classes'

// Why: ring-inset keeps the focus ring inside the strip's clipped overflow.
export const TAB_PILL_CLASSES =
  'group relative flex h-6 items-center gap-1 rounded-full pl-2 pr-1 text-xs cursor-pointer select-none outline-none transition-colors duration-100 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring'

export const TAB_UNREAD_FILL_CLASSES =
  'pointer-events-none absolute inset-0 rounded-full bg-status-attention-background'

export const TAB_ACTIVE_FILL_CLASSES = 'bg-foreground/[0.1] text-foreground'

export function getTabStateClasses(isActive: boolean): string {
  return isActive
    ? TAB_ACTIVE_FILL_CLASSES
    : `text-muted-foreground ${CONTROL_HOVER} hover:text-foreground`
}
