// Menu look shared by ContextMenu and DropdownMenu, ported from the Bots tab's menus: a solid
// popover sheet, 14px rows and thin icons. Ported from the muster-bots fork (menu-recipe.ts), Apache-2.0.

// The one floating surface: menus, popovers and palettes share it.
export const FLOATING_SURFACE =
  'rounded-[12px] border border-border/50 bg-popover-solid text-popover-foreground shadow-floating'

export const MENU_SHEET = `flex flex-col gap-1 p-1.5 ${FLOATING_SURFACE} [&_svg.lucide]:stroke-[1.5]`

export const MENU_MOTION =
  'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95'

export const MENU_ROW =
  "relative flex min-h-[30px] shrink-0 cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-[14px] leading-[18px] font-normal outline-hidden select-none focus:bg-foreground/[0.06] focus:text-popover-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-foreground/75"

export const MENU_ROW_DESTRUCTIVE =
  'data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:focus:text-destructive dark:data-[variant=destructive]:focus:bg-destructive/20 data-[variant=destructive]:*:[svg]:text-destructive!'

export const MENU_SUB_TRIGGER_OPEN =
  'data-[state=open]:bg-foreground/[0.06] data-[state=open]:text-popover-foreground'

export const MENU_LABEL = 'px-2 pt-2 pb-1 text-[12px] leading-4 font-medium text-muted-foreground'

export const MENU_SEPARATOR = 'mx-1.5 h-px shrink-0 bg-border/50'

export const MENU_SHORTCUT =
  'ml-auto shrink-0 whitespace-nowrap text-[12px] tracking-normal text-muted-foreground'
