# Bots look for Muster's shared UI primitives

Date: 2026-10-30
Branch: `feature/chat-bots-look` (worktree `~/Sites/muster-ui-chat-bots`)
Source of the look: the muster-bots fork, `src/components/menu-recipe.ts`, `elevated.ts`, `PluginsPanel.tsx`, `styles.css` (Apache-2.0).

## Goal

Modals, buttons, inputs, selects and chips across Muster (Code tab, Settings, site dialogs, Chat) adopt the Bots panel's look, the same way menus and sidebar search already have. The look is expressed in Muster tokens only, so every Muster theme keeps working.

## Already done (uncommitted on this branch)

- Menus: `ui/menu-surface-classes.ts`, used by `context-menu.tsx` and `dropdown-menu.tsx`. Solid popover fill (forced opaque), 12px corners, 14px rows, thin icons.
- Sidebar: Chat and Code search use the Bots pill; the Code sidebar nav sits on the Chat sidebar's 12px inset; the sidebar box uses `overflow-clip` so focus cannot scroll it sideways.

## The Bots look, mapped to Muster tokens

| Element | Bots | Muster version |
| --- | --- | --- |
| Modal | 16px corners, glass fill, 1px ink/10 border, 24px padding | 16px corners, solid popover fill, `border-foreground/10`, Floating shadow tier, 24px padding |
| Primary button | accent pill, h-7/h-9, 13px medium | `rounded-full`, `bg-primary`, 13px medium |
| Secondary button | filled pill `bg-control/70`, hover raised | `rounded-full`, `bg-foreground/[0.07]`, hover `bg-foreground/[0.11]` |
| Outline button | pill with `border-hairline/40` | `rounded-full`, `border-border/60`, transparent fill |
| Ghost / icon button | round, `size-8`, hover raised | `rounded-full`, hover `bg-foreground/[0.07]` |
| Text input | filled pill `bg-control/70`, no border, focus `ring-1` accent, 14px | `rounded-full` (single line), `bg-foreground/[0.05]`, no border, focus `ring-1 ring-ring` |
| Textarea | filled, `rounded-xl` | `rounded-xl`, same fill and focus |
| Select trigger | same as input | same as input, chevron kept |
| Chip / filter pill | h-7 pill; selected is inverted (`bg-ink text-app`) | h-7 pill; selected `bg-foreground text-background` |

Fills use `foreground` at low alpha instead of new colour tokens, so no new colour values are introduced (STYLEGUIDE rule). Two helpers go into `main.css`:

- `bg-popover-solid` and `bg-card-solid`: the token forced opaque (`rgb(from var(--popover) r g b / 1)`), replacing the arbitrary class now in the menu recipe.
- Modals and menus use them, because the terminal-matched theme gives `--popover` and `--card` an alpha.

## Phases

1. Tokens and styleguide (about 1 hour). Add the two solid helpers. Add a "Bots look" section to `docs/STYLEGUIDE.md`: controls are pills, floating surfaces are opaque, modal radius 16px.
2. `button.tsx` (about 2 hours). Reshape every variant and size as in the table. Keep the variant and size names, so the 458 call sites keep compiling.
3. `input.tsx`, `select.tsx` trigger, textarea call sites (about 2 hours). Single-line fields become filled pills; multi-line fields `rounded-xl`.
4. `dialog.tsx` and `sheet.tsx` (about 1 hour). Solid fill, 16px corners, round close button, 24px padding.
5. Chips: `badge.tsx`, `toggle-group.tsx`, `tabs.tsx` list and trigger (about 1 hour).
6. Sweep (half a day to a day). Find call sites that pass `rounded-md`, `rounded-sm`, `border` or fixed heights to Button or Input and now fight the new shape. Fix the ones on high-traffic screens; list the rest.

Total: about 1.5 to 2 days.

## Checks

- Typecheck (both configs), oxlint, the max-lines ratchet, vitest on `components/` (snapshot and class assertions will need updating).
- Light and dark screenshots of: Settings (General, Experimental), the site settings modal, the new-worktree dialog, the commit area, the Chat composer and thread header, the Code sidebar, a context menu, the command palette.
- Code mode's NativeChatView keeps its look (Chat plan guard).

## Risks

- Dense Code-tab toolbars use small icon buttons; round shapes at `size-6` may look busy. Fallback: keep `icon-xs` square with a 6px radius.
- Call sites that override shape with `className` keep their old shape through tailwind-merge. That is the sweep in phase 6.
- Terminal-matched theme: filled controls on a translucent sidebar may read lighter than in the Bots tab. Checked in the screenshots.

## Open questions

1. Modals: solid (recommended, matches your "no transparency" call on menus) or the Bots glass?
2. Square icon buttons in the terminal and editor toolbars, or round everywhere?
