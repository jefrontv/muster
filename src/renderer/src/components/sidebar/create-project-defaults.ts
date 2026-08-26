export type RepoKind = 'git' | 'folder'

export type GitAvailability = 'checking' | 'available' | 'unavailable' | 'unknown'

function pathSeparatorFor(pathValue: string): '/' | '\\' {
  return pathValue.includes('\\') ? '\\' : '/'
}

function trimTrailingSeparators(pathValue: string): string {
  const trimmed = pathValue.replace(/[\\/]+$/, '')
  if (trimmed === '' && pathValue.startsWith('/')) {
    return '/'
  }
  if (/^[A-Za-z]:$/.test(trimmed)) {
    return `${trimmed}${pathSeparatorFor(pathValue)}`
  }
  return trimmed
}

export function joinCreateProjectPath(parentPath: string, childName: string): string {
  const parent = trimTrailingSeparators(parentPath.trim())
  const child = childName.trim().replace(/^[\\/]+/, '')
  if (!parent || !child) {
    return parent || child
  }
  const separator = pathSeparatorFor(parent)
  if (parent === '/' || /^[A-Za-z]:[\\/]$/.test(parent)) {
    return `${parent}${child}`
  }
  return `${parent}${separator}${child}`
}

/**
 * The default parent on a host whose site roots we cannot read (a runtime/SSH host): the app's own
 * projects folder under that host's home. Locally the main process answers with the first reachable
 * site root instead, so this shape is the last resort, not the usual case.
 */
export function getDefaultCreateProjectParent(homeDir: string): string {
  const trimmedHomeDir = trimTrailingSeparators(homeDir.trim())
  if (!trimmedHomeDir) {
    return ''
  }
  return joinCreateProjectPath(joinCreateProjectPath(trimmedHomeDir, 'muster'), 'projects')
}

export function getCreateProjectDefaultParentAutoFill({
  step,
  createParent,
  activeRuntimeEnvironmentId,
  defaultParent,
  createStepAutoFilled
}: {
  step: string
  createParent: string
  activeRuntimeEnvironmentId: string | null | undefined
  defaultParent?: string
  createStepAutoFilled: boolean
}): { parent: string } | null {
  if (step !== 'create' || createStepAutoFilled || createParent) {
    return null
  }
  if (activeRuntimeEnvironmentId?.trim()) {
    return null
  }
  const parent = defaultParent ?? ''
  if (!parent) {
    return null
  }
  return { parent }
}

/**
 * The location line in the create-project summary. Always the resolved path when there is one: the
 * default is now whichever site root the host reported, so there is no fixed path to abbreviate and
 * a prettified stand-in would name a folder the project would not land in.
 */
export function formatCreateProjectParentSummary({
  parent,
  runtimeEnvironmentId,
  isRemoteHost,
  missingLocationLabel = 'location not selected',
  missingServerLocationLabel = 'host folder not selected'
}: {
  parent: string
  runtimeEnvironmentId?: string | null
  isRemoteHost?: boolean
  missingLocationLabel?: string
  missingServerLocationLabel?: string
}): string {
  const trimmedParent = parent.trim()
  if (!trimmedParent) {
    return runtimeEnvironmentId || isRemoteHost ? missingServerLocationLabel : missingLocationLabel
  }
  return trimmedParent
}
