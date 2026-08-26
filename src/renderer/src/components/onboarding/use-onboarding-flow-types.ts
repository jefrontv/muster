export type StepNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
export type StepId =
  | 'agent'
  | 'theme'
  | 'default_view'
  | 'integrations'
  | 'site_sources'
  | 'site_mcp'
  | 'windows_terminal'
  | 'notifications'

// Why default_view first: the Chat/Code choice frames every later step's copy.
// site_sources and site_mcp sit together at the end of the Code-only run: first
// where the sites are, then the tooling that acts on them. Both are skipped
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
  { id: 'site_sources', stepNumber: 5, valueKind: 'site_sources' },
  { id: 'site_mcp', stepNumber: 6, valueKind: 'site_mcp' },
  { id: 'windows_terminal', stepNumber: 7, valueKind: 'windows_terminal' },
  { id: 'notifications', stepNumber: 8, valueKind: 'notifications' }
]
