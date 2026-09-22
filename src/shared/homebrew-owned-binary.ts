// Whether a program belongs to Homebrew, and which formula it belongs to.
//
// Why this exists: a tool that self-updates refuses to when a package manager owns the install, and
// says so instead. Agent Local does exactly that — `agent-local update` prints "installed by
// Homebrew — update with: brew upgrade agent-local" and stops — so the hub's Update button ran a
// command that could never succeed and reported the refusal as a failure.
//
// The signal is the resolved path, not the invoked one. Homebrew keeps every version in
// `<prefix>/Cellar/<formula>/<version>/...` and links a shim into `<prefix>/bin`, so the shim's
// location says nothing (a curl install lands in `/usr/local/bin` too) while the target says both
// that Homebrew owns it and what the formula is called.

const CELLAR_SEGMENTS = ['/Cellar/', '/Caskroom/']

/**
 * The formula name, or null when Homebrew does not own this path.
 *
 * Reads the formula out of the path rather than taking it from the catalog, so it is right for any
 * entry without a per-entry field to keep in sync, and right even when the formula is named
 * differently from the binary.
 */
export function homebrewFormulaFromPath(realPath: string | null): string | null {
  if (!realPath) {
    return null
  }
  for (const segment of CELLAR_SEGMENTS) {
    const index = realPath.indexOf(segment)
    if (index === -1) {
      continue
    }
    const formula = realPath.slice(index + segment.length).split('/')[0]
    if (formula && formula.length > 0) {
      return formula
    }
  }
  return null
}

/** The command that updates a Homebrew-owned program. */
export function homebrewUpgradeCommand(formula: string): string {
  return `brew upgrade ${formula}`
}
