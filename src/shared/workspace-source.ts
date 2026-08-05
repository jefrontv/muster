export const WORKSPACE_SOURCE_VALUES = [
  'command_palette',
  'sidebar',
  'shortcut',
  'drag_drop',
  'onboarding',
  'settings',
  'terminal_context_menu',
  'activecollab-task',
  'unknown'
] as const

export type WorkspaceSource = (typeof WORKSPACE_SOURCE_VALUES)[number]
