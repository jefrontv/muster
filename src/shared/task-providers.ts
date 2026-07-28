export type TaskProvider = 'github' | 'gitlab' | 'linear' | 'jira' | 'activecollab'

export const TASK_PROVIDERS: readonly TaskProvider[] = [
  'github',
  'gitlab',
  'linear',
  'jira',
  'activecollab'
]

/**
 * This fork is specialised around ActiveCollab, so it is the only provider a fresh profile sees and
 * the fallback every guard below lands on. The rest of `TASK_PROVIDERS` stays fully functional and
 * is re-enablable from Settings -> Tasks; nothing here deletes a provider, it only stops offering it
 * unasked.
 */
export const DEFAULT_TASK_SOURCE: TaskProvider = 'activecollab'
export const DEFAULT_VISIBLE_TASK_PROVIDERS: readonly TaskProvider[] = [DEFAULT_TASK_SOURCE]

const TASK_PROVIDER_SET = new Set<TaskProvider>(TASK_PROVIDERS)

export function isTaskProvider(value: unknown): value is TaskProvider {
  return TASK_PROVIDER_SET.has(value as TaskProvider)
}

export function normalizeTaskProviderSettings(value: {
  visibleTaskProviders: unknown
  defaultTaskSource: unknown
}): { visibleTaskProviders: TaskProvider[]; defaultTaskSource: TaskProvider } {
  const visibleTaskProviders = normalizeVisibleTaskProviders(value.visibleTaskProviders)
  const defaultTaskSource = isTaskProvider(value.defaultTaskSource)
    ? value.defaultTaskSource
    : resolveVisibleTaskProvider(DEFAULT_TASK_SOURCE, visibleTaskProviders)

  if (visibleTaskProviders.includes(defaultTaskSource)) {
    return { visibleTaskProviders, defaultTaskSource }
  }

  // Why: older profiles can keep a saved default while the visible-provider
  // list drifted. Persist the default back into the list so every surface
  // reads the same settings contract.
  return {
    defaultTaskSource,
    visibleTaskProviders: TASK_PROVIDERS.filter(
      (provider) => provider === defaultTaskSource || visibleTaskProviders.includes(provider)
    )
  }
}

export function normalizeVisibleTaskProviders(value: unknown): TaskProvider[] {
  if (!Array.isArray(value)) {
    return [...DEFAULT_VISIBLE_TASK_PROVIDERS]
  }

  const normalized: TaskProvider[] = []
  for (const provider of value) {
    if (!TASK_PROVIDER_SET.has(provider as TaskProvider)) {
      continue
    }
    if (!normalized.includes(provider as TaskProvider)) {
      normalized.push(provider as TaskProvider)
    }
  }

  // Why: at least one provider must remain visible so the Tasks surface always has a valid source.
  // Falling back to the fork default rather than every provider keeps a hand-emptied list from
  // silently re-offering GitHub and Jira.
  return normalized.length > 0 ? normalized : [...DEFAULT_VISIBLE_TASK_PROVIDERS]
}

export type TaskProviderAvailability = {
  gitlabInstalled: boolean
  linearConnected: boolean
}

export function filterAvailableTaskProviders(
  visibleProviders: readonly TaskProvider[],
  availability: TaskProviderAvailability
): TaskProvider[] {
  const available = visibleProviders.filter((provider) =>
    isTaskProviderAvailable(provider, availability)
  )

  return available.length > 0 ? available : [DEFAULT_TASK_SOURCE]
}

export function restoreAvailableDefaultTaskProvider(
  visibleProviders: readonly TaskProvider[],
  availability: TaskProviderAvailability,
  preferredProvider: unknown
): TaskProvider[] {
  const available = filterAvailableTaskProviders(visibleProviders, availability)

  // Why: older or drifted settings can hide the saved default while another
  // provider becomes available. Keep that default reachable after hydration.
  if (
    isTaskProvider(preferredProvider) &&
    isTaskProviderAvailable(preferredProvider, availability) &&
    !available.includes(preferredProvider)
  ) {
    return TASK_PROVIDERS.filter(
      (provider) => provider === preferredProvider || available.includes(provider)
    )
  }

  return available
}

function isTaskProviderAvailable(
  provider: TaskProvider,
  availability: TaskProviderAvailability
): boolean {
  // Why a switch and not the if/else chain this replaced: that chain ended in a bare
  // `return availability.linearConnected`, so any provider added without its own branch was
  // silently gated on Linear being connected — no type error, no lint error, just a provider
  // missing from the Tasks chrome. A switch with no default makes the next omission a build error.
  switch (provider) {
    case 'github':
      return true
    case 'gitlab':
      return availability.gitlabInstalled
    // Jira and ActiveCollab can both be connected from the Tasks surface itself, so hiding them
    // while disconnected would remove the entry point for first-time setup.
    case 'jira':
      return true
    case 'activecollab':
      return true
    case 'linear':
      return availability.linearConnected
  }
}

export function resolveVisibleTaskProvider(
  preferred: TaskProvider | null | undefined,
  visibleProviders: readonly TaskProvider[]
): TaskProvider {
  if (preferred && visibleProviders.includes(preferred)) {
    return preferred
  }
  return visibleProviders[0] ?? DEFAULT_TASK_SOURCE
}
