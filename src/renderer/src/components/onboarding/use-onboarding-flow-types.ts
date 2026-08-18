export type StepNumber = 1 | 2 | 3 | 4 | 5 | 6
export type StepId =
  | 'agent'
  | 'theme'
  | 'default_view'
  | 'integrations'
  | 'windows_terminal'
  | 'notifications'

// Why default_view first: the Chat/Code choice frames every later step's copy.
export const STEPS: readonly {
  id: StepId
  stepNumber: StepNumber
  valueKind: StepId
}[] = [
  { id: 'default_view', stepNumber: 1, valueKind: 'default_view' },
  { id: 'agent', stepNumber: 2, valueKind: 'agent' },
  { id: 'theme', stepNumber: 3, valueKind: 'theme' },
  { id: 'integrations', stepNumber: 4, valueKind: 'integrations' },
  { id: 'windows_terminal', stepNumber: 5, valueKind: 'windows_terminal' },
  { id: 'notifications', stepNumber: 6, valueKind: 'notifications' }
]
