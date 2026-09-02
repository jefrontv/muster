export type FeatureWallSetupStepId =
  | 'default-agent'
  | 'add-two-repos'
  | 'notifications'
  | 'two-worktrees'
  | 'browser'
  | 'task-sources'
  | 'setup-script'
  | 'create-first-workspace'
  | 'start-first-thread'

/** Which checklist the user is working through: code (worktrees) or chat (threads). */
export type FeatureWallSetupMode = 'code' | 'chat'

export type FeatureWallSetupStep = {
  readonly id: FeatureWallSetupStepId
  readonly name: string
  readonly subtitle: string
  readonly description: string
}

export const FEATURE_WALL_SETUP_PARALLEL_WORK_STEP_IDS = [
  'two-worktrees',
  'browser'
] as const satisfies readonly FeatureWallSetupStepId[]

export type FeatureWallSetupSectionId = 'parallel-work' | 'setup'

const TWO_WORKTREES_STEP: FeatureWallSetupStep = {
  id: 'two-worktrees',
  name: 'Multi-task',
  subtitle: 'Multi-task',
  description:
    'Work in 2 different worktrees at once. Each one is isolated (even in the same project). Perfect for working on 2 features at once.'
}

const BROWSER_STEP: FeatureWallSetupStep = {
  id: 'browser',
  name: "Use Muster's browser",
  subtitle: "Use Muster's browser",
  description:
    'Browse your web app without leaving Muster. Grab any element and send its exact source and styles to an agent with one click.'
}

const NOTIFICATIONS_STEP: FeatureWallSetupStep = {
  id: 'notifications',
  name: 'Turn on notifications',
  subtitle: 'Turn on notifications',
  description: 'Know the moment an agent finishes, needs attention, or gets blocked.'
}

const DEFAULT_AGENT_STEP: FeatureWallSetupStep = {
  id: 'default-agent',
  name: 'Choose your default agent',
  subtitle: 'Choose your default agent',
  description: 'Start new work faster with your preferred agent already selected.'
}

const TASK_SOURCES_STEP: FeatureWallSetupStep = {
  id: 'task-sources',
  name: 'Connect ActiveCollab',
  subtitle: 'Connect ActiveCollab',
  description: 'Browse your ActiveCollab tasks and start work from them without leaving Muster.'
}

const SETUP_SCRIPT_STEP: FeatureWallSetupStep = {
  id: 'setup-script',
  name: 'Automate workspace setup',
  subtitle: 'Automate workspace setup',
  description:
    'Run install and setup commands automatically so every new worktree is ready for agents.'
}

const ADD_TWO_REPOS_STEP: FeatureWallSetupStep = {
  id: 'add-two-repos',
  name: 'Start work in multiple repos',
  subtitle: 'Start work in multiple repos',
  description:
    'Bring your key repos into Muster so you can start agent work without hunting for folders.'
}

const CREATE_FIRST_WORKSPACE_STEP: FeatureWallSetupStep = {
  id: 'create-first-workspace',
  name: 'Create your first workspace',
  subtitle: 'Create your first workspace',
  description:
    'A workspace groups the chat threads for one client or project and can bind to an ActiveCollab project.'
}

const START_FIRST_THREAD_STEP: FeatureWallSetupStep = {
  id: 'start-first-thread',
  name: 'Start your first thread',
  subtitle: 'Start your first thread',
  description:
    'Threads are conversations with your agent. Describe what you need and it works while you watch.'
}

export const FEATURE_WALL_SETUP_STEPS: readonly FeatureWallSetupStep[] = [
  TWO_WORKTREES_STEP,
  BROWSER_STEP,
  NOTIFICATIONS_STEP,
  DEFAULT_AGENT_STEP,
  TASK_SOURCES_STEP,
  SETUP_SCRIPT_STEP,
  ADD_TWO_REPOS_STEP
] as const

export const FEATURE_WALL_CHAT_SETUP_STEPS: readonly FeatureWallSetupStep[] = [
  TASK_SOURCES_STEP,
  CREATE_FIRST_WORKSPACE_STEP,
  START_FIRST_THREAD_STEP,
  NOTIFICATIONS_STEP,
  DEFAULT_AGENT_STEP
] as const

export const FEATURE_WALL_SETUP_STEP_IDS = [
  ...FEATURE_WALL_SETUP_STEPS,
  CREATE_FIRST_WORKSPACE_STEP,
  START_FIRST_THREAD_STEP
].map((step) => step.id)

export function getFeatureWallSetupSteps(
  mode: FeatureWallSetupMode = 'code'
): readonly FeatureWallSetupStep[] {
  return mode === 'chat' ? FEATURE_WALL_CHAT_SETUP_STEPS : FEATURE_WALL_SETUP_STEPS
}

export function getFeatureWallSetupSectionId(
  stepId: FeatureWallSetupStepId
): FeatureWallSetupSectionId {
  return FEATURE_WALL_SETUP_PARALLEL_WORK_STEP_IDS.includes(
    stepId as (typeof FEATURE_WALL_SETUP_PARALLEL_WORK_STEP_IDS)[number]
  )
    ? 'parallel-work'
    : 'setup'
}

export function getFeatureWallSetupStepsForSection(
  sectionId: FeatureWallSetupSectionId,
  mode: FeatureWallSetupMode = 'code'
): readonly FeatureWallSetupStep[] {
  return getFeatureWallSetupSteps(mode).filter(
    (step) => getFeatureWallSetupSectionId(step.id) === sectionId
  )
}

export function getFirstIncompleteFeatureWallSetupStepId(
  stepDone: Partial<Record<FeatureWallSetupStepId, boolean>>,
  mode: FeatureWallSetupMode = 'code'
): FeatureWallSetupStepId {
  // Why: onboarding should prioritize Setup, while durable definitions retain the original order.
  const setupStep = getFeatureWallSetupStepsForSection('setup', mode).find(
    (step) => !stepDone[step.id]
  )
  if (setupStep) {
    return setupStep.id
  }
  const parallelStep = getFeatureWallSetupStepsForSection('parallel-work', mode).find(
    (step) => !stepDone[step.id]
  )
  return parallelStep?.id ?? getFeatureWallSetupSteps(mode)[0].id
}

export function isFeatureWallSetupStepId(value: unknown): value is FeatureWallSetupStepId {
  return (
    typeof value === 'string' &&
    FEATURE_WALL_SETUP_STEP_IDS.includes(value as FeatureWallSetupStepId)
  )
}
