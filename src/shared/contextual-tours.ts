import type { FeatureInteractionId } from './feature-interactions'

export type ContextualTourId =
  | 'workspace-board'
  | 'workspace-agent-sessions'
  | 'browser'
  | 'tasks'
  | 'automations'
  | 'floating-workspace'
  | 'workspace-creation'
  | 'chat-mode'
  | 'sites'

export type ContextualTourStepControl = {
  kind: 'auto-rename-branch-from-work'
}

export type ContextualTourStepActionKind =
  | 'next'
  | 'complete'
  | 'split-terminal-pane'
  | 'create-worktree'
  | 'show-worktrees'
  | 'open-tasks'
  | 'open-getting-started'

export type ContextualTourStepAction = {
  kind: ContextualTourStepActionKind
  label: string
}

export type ContextualTourStepPlacement = 'top' | 'right' | 'bottom' | 'left'

export type ContextualTourStep = {
  title: string
  body: string
  targetSelector: string
  requiredForStart?: boolean
  fallbackCopy?: string
  preferredPlacement?: ContextualTourStepPlacement
  targetPulse?: boolean
  hidePrimaryAction?: boolean
  control?: ContextualTourStepControl
  primaryAction?: ContextualTourStepAction
  secondaryAction?: ContextualTourStepAction
  advanceOnFeatureInteraction?: FeatureInteractionId
}

export type ContextualTour = {
  id: ContextualTourId
  allowedActiveModals?: readonly string[]
  steps: readonly ContextualTourStep[]
}

export const CONTEXTUAL_TOURS = [
  {
    id: 'workspace-board',
    steps: [
      {
        title: 'Plan work on the board',
        body: 'Use the board when you want to see workspaces by status instead of by project.',
        targetSelector: '[data-contextual-tour-target="workspace-board-center"]',
        requiredForStart: true,
        preferredPlacement: 'bottom'
      },
      {
        title: 'Move work through lanes',
        body: 'Drag workspaces between lanes as their status changes.',
        targetSelector:
          '[data-contextual-tour-target="workspace-board-done-lane"], [data-contextual-tour-target="workspace-board-lanes"]'
      }
    ]
  },
  {
    id: 'workspace-agent-sessions',
    steps: [
      {
        title: 'Split a terminal pane',
        body: 'Open a second terminal pane with {terminal.splitRight}, or right-click the pane for split options.',
        targetSelector:
          '[data-contextual-tour-target="terminal-pane-split-target"], [data-contextual-tour-target="workspace-agent-terminal-tip"]',
        requiredForStart: true,
        preferredPlacement: 'bottom',
        primaryAction: { kind: 'split-terminal-pane', label: 'Split terminal' },
        advanceOnFeatureInteraction: 'terminal-pane-split'
      },
      {
        title: 'Start another task in parallel',
        body: 'Each worktree gets its own branch, so parallel work stays separate.',
        targetSelector: '[data-contextual-tour-target="workspace-create-control"]',
        preferredPlacement: 'right',
        targetPulse: true,
        hidePrimaryAction: true
      }
    ]
  },
  {
    id: 'browser',
    steps: [
      {
        title: 'Grab page context for agents',
        body: "Use the grab tool to copy a page element's context for agents.",
        targetSelector: '[data-contextual-tour-target="browser-grab-control"]',
        requiredForStart: true,
        preferredPlacement: 'bottom'
      },
      {
        title: 'Mark design feedback in place',
        body: 'Annotate elements and send those notes to an agent.',
        targetSelector: '[data-contextual-tour-target="browser-annotation-control"]',
        preferredPlacement: 'bottom'
      },
      {
        title: 'Stay logged in',
        body: 'Bring your existing logins into Muster to stay signed in immediately.',
        // Prefer the always-visible Import button; fall back to the overflow-menu
        // item only once the user has dismissed the import hint.
        targetSelector:
          '[data-contextual-tour-target="browser-import-hint"], [data-contextual-tour-target="browser-import-cookies-control"]',
        // Sit below the Import button with the arrow pointing up at it.
        preferredPlacement: 'bottom'
      }
    ]
  },
  {
    id: 'tasks',
    steps: [
      {
        title: 'Choose the work source',
        body: 'Switch between connected providers and project filters without changing pages.',
        targetSelector: '[data-contextual-tour-target="tasks-source-filters"]',
        requiredForStart: true
      },
      {
        title: 'Filter to the work you need',
        body: 'Use presets and search to narrow issues, reviews, merge requests, or tasks.',
        targetSelector: '[data-contextual-tour-target="tasks-search-presets"]'
      },
      {
        title: 'Start from work items',
        body: 'Use Start or Open on a task, issue, review, or merge request to bring its context into a workspace.',
        targetSelector:
          '[data-contextual-tour-target="tasks-start-workspace"], [data-contextual-tour-target="tasks-actions"], [data-contextual-tour-target="tasks-search-presets"]'
      }
    ]
  },
  {
    id: 'automations',
    steps: [
      {
        title: 'What is an automation?',
        body: 'Automations run agent work on a schedule. Add an automation by clicking this button.',
        targetSelector: '[data-contextual-tour-target="automations-create"]',
        requiredForStart: true
      },
      {
        title: 'Find the results',
        body: 'Runs show when automations executed, what happened, and where to inspect their output.',
        targetSelector: '[data-contextual-tour-target="automations-runs"]'
      }
    ]
  },
  {
    id: 'floating-workspace',
    steps: [
      {
        title: 'Run an agent across every repo',
        body: 'Agents here run in any folder you choose. Point one at the directory above your services to work across all your repos at once.',
        // Why: the per-action anchors only render in the empty state; fall back
        // to the panel surface when floating tabs already exist.
        targetSelector:
          '[data-contextual-tour-target="floating-workspace-new-terminal"], [data-contextual-tour-target="floating-workspace-surface"]',
        requiredForStart: true,
        preferredPlacement: 'left'
      },
      {
        title: 'Or use it as a scratchpad',
        body: 'Open agents, scratch terminals, notes, and browser tabs without cluttering the worktree you’re focused on.',
        targetSelector:
          '[data-contextual-tour-target="floating-workspace-new-markdown"], [data-contextual-tour-target="floating-workspace-surface"]',
        preferredPlacement: 'left'
      }
    ]
  },
  {
    id: 'workspace-creation',
    allowedActiveModals: ['new-workspace-composer'],
    steps: [
      {
        title: 'Pick a project',
        body: 'Muster isolates each task in its own worktree, branched off your base.',
        targetSelector: '[data-contextual-tour-target="workspace-creation-project"]',
        requiredForStart: true
      },
      {
        title: 'Name it, or start from existing work',
        body: 'Start from a linked task for a short issue or PR name. Or leave it blank to auto-name it from your first agent message.',
        targetSelector: '[data-contextual-tour-target="workspace-creation-name"]',
        control: { kind: 'auto-rename-branch-from-work' }
      },
      {
        title: 'Choose what agent starts the work',
        body: 'Pick the agent that should be opened when this worktree is created.',
        targetSelector: '[data-contextual-tour-target="workspace-creation-agent"]'
      }
    ]
  },
  {
    id: 'chat-mode',
    steps: [
      {
        title: 'Group work into workspaces',
        body: 'A workspace collects the chat threads for one client or project. Create one here.',
        targetSelector: '[data-contextual-tour-target="chat-workspaces"]',
        requiredForStart: true,
        preferredPlacement: 'right'
      },
      {
        // Anchored inside the workspace dialog; skipped until it is open.
        title: 'Bind ActiveCollab projects',
        body: 'Link a workspace to its ActiveCollab projects so tasks and new chats default to the right place.',
        targetSelector: '[data-contextual-tour-target="chat-workspace-project-binding"]',
        preferredPlacement: 'right'
      },
      {
        title: 'Start a thread',
        body: 'Describe what you need and send it — a thread is a conversation with your agent.',
        targetSelector: '[data-contextual-tour-target="chat-thread-composer"]',
        preferredPlacement: 'top'
      }
    ]
  },
  {
    id: 'sites',
    steps: [
      {
        title: 'Your sites live here',
        body: 'Every configured site is listed here. Muster also surfaces sites it finds on disk.',
        targetSelector: '[data-contextual-tour-target="sites-list"]',
        requiredForStart: true,
        preferredPlacement: 'right'
      },
      {
        title: 'Inspect and run a site locally',
        body: 'Each site shows its environments and a local stack you can start and stop.',
        targetSelector: '[data-contextual-tour-target="sites-detail"]',
        preferredPlacement: 'left'
      },
      {
        title: 'Deploy from the environment',
        body: 'Run a deploy for the selected environment. Branch resolution picks the right target.',
        targetSelector: '[data-contextual-tour-target="sites-deploy"]',
        preferredPlacement: 'left'
      }
    ]
  }
] as const satisfies readonly ContextualTour[]

export const CONTEXTUAL_TOUR_IDS = CONTEXTUAL_TOURS.map((tour) => tour.id)

export function isContextualTourId(value: unknown): value is ContextualTourId {
  return typeof value === 'string' && CONTEXTUAL_TOUR_IDS.includes(value as ContextualTourId)
}

export function getContextualTour(id: ContextualTourId): ContextualTour {
  return CONTEXTUAL_TOURS.find((tour) => tour.id === id)!
}

export function normalizeContextualTourIds(value: unknown): ContextualTourId[] {
  if (!Array.isArray(value)) {
    return []
  }

  const seen = new Set<ContextualTourId>()
  for (const item of value) {
    if (isContextualTourId(item)) {
      seen.add(item)
    }
  }
  return [...seen]
}
