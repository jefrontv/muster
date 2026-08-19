export type StepNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7
export type StepId =
  | 'agent'
  | 'theme'
  | 'default_view'
  | 'integrations'
  | 'site_mcp'
  | 'windows_terminal'
  | 'notifications'

// Why default_view first: the Chat/Code choice frames every later step's copy.
// site_mcp follows integrations because it is one too, and it is skipped
// outright in Chat mode — deploys and imports are a Code-mode concern.
export const STEPS: readonly {
  id: StepId
  stepNumber: StepNumber
  valueKind: StepId
}[] = [
  { id: 'default_view', stepNumber: 1, valueKind: 'default_view' },
  { id: 'agent', stepNumber: 2, valueKind: 'agent' },
  { id: 'theme', stepNumber: 3, valueKind: 'theme' },
  { id: 'integrations', stepNumber: 4, valueKind: 'integrations' },
  { id: 'site_mcp', stepNumber: 5, valueKind: 'site_mcp' },
  { id: 'windows_terminal', stepNumber: 6, valueKind: 'windows_terminal' },
  { id: 'notifications', stepNumber: 7, valueKind: 'notifications' }
]
