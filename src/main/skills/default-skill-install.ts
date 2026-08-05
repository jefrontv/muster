// Installs the skills Muster expects its agents to have, without making the user run an installer.
//
// Upstream leaves this to `npx skills add …` driven from a settings pane. That pulls the
// Orca-branded copies from GitHub, needs the network, and only happens if the user finds the pane.
// This fork ships the same files it fingerprints, so it can lay them down itself at startup.
//
// Why the SHIPPED bytes and not the embedded CLI guide text: `resources/skills/*.json` fingerprints
// exactly what lives in `skills/`, and the freshness badge compares an install against those
// digests. Installing anything else — a Muster-branded variant, say — would light "Update
// available" on a skill Muster itself had just written, and no update command could ever clear it.

import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { homedir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { app } from 'electron'
import { isBundledSkillEnabled } from '../../shared/agent-capabilities'

/**
 * Skills Muster writes into agent skill roots on launch. Kept short on purpose: each entry is
 * auto-installed for every harness, so only stable, high-signal guides belong here.
 */
export const DEFAULT_AGENT_SKILL_NAMES = ['orca-cli'] as const

/**
 * Formerly auto-installed skills that must no longer ship. On launch we delete canonical copies
 * (and our harness symlinks) so agents stop picking them up; user-owned directories are left alone.
 */
export const RETIRED_AGENT_SKILL_NAMES = ['orchestration'] as const

export type DefaultAgentSkillName = (typeof DEFAULT_AGENT_SKILL_NAMES)[number]

/**
 * Harness skill directories, mirroring `buildSkillDiscoverySources`. Kept as a literal list rather
 * than imported from there because that module describes where to SCAN, including plugin caches and
 * repo scopes we must never write into.
 */
const HARNESS_SKILL_DIRECTORIES: readonly string[][] = [
  ['.claude', 'skills'],
  ['.codex', 'skills'],
  ['.grok', 'skills'],
  ['.config', 'opencode', 'skills'],
  ['.pi', 'agent', 'skills']
]

export type DefaultSkillInstallResult = {
  /** Canonical copies written this run. */
  installed: string[]
  /** Already byte-identical; nothing to do. */
  alreadyCurrent: string[]
  /** Present but not ours, so left untouched. */
  skipped: string[]
  /** Not shipped with this build — nothing to install from. */
  unavailable: string[]
  /** Harness directories that gained a link this run. */
  linkedRoots: string[]
  /** Retired skills removed from the canonical agents root this run. */
  retired: string[]
  /** Turned off in Settings → Agent Capabilities, so not installed this run. */
  disabled: string[]
}

function readIfPresent(path: string): string | null {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

/**
 * True when the existing copy is one of ours — identical to what ships now, or to a guide a
 * previous Muster build shipped. Anything else is treated as somebody's edit and left alone.
 */
function isOursToReplace(
  current: string,
  shipped: string,
  knownPrevious: readonly string[] | undefined
): boolean {
  return current === shipped || (knownPrevious?.includes(current) ?? false)
}

function linkPointsAtCanonical(linkPath: string, canonicalDir: string): boolean {
  try {
    if (!lstatSync(linkPath).isSymbolicLink()) {
      return false
    }
  } catch {
    return false
  }
  try {
    const target = readlinkSync(linkPath)
    return (
      target === canonicalDir ||
      target.endsWith(relative(linkPath, canonicalDir)) ||
      target.includes(canonicalDir)
    )
  } catch {
    return false
  }
}

/**
 * Lays down the default skills and registers them with the harnesses already installed.
 *
 * Safe to run on every launch: it writes only what is absent or provably ours, and never creates a
 * harness directory — inventing `~/.grok/skills` would put a skill in front of an agent the user
 * never set up.
 */
export function installDefaultAgentSkills(args: {
  home?: string
  packageRoot: string
  /** Guides shipped by earlier builds, so a stale-but-ours copy can be refreshed rather than skipped. */
  knownPreviousContents?: Partial<Record<string, readonly string[]>>
  /** Per-skill opt-outs from Settings. A skill with no entry installs, as it always has. */
  bundledSkillCapabilities?: Readonly<Record<string, boolean>>
}): DefaultSkillInstallResult {
  const home = args.home ?? homedir()
  const result: DefaultSkillInstallResult = {
    installed: [],
    alreadyCurrent: [],
    skipped: [],
    unavailable: [],
    linkedRoots: [],
    retired: [],
    disabled: []
  }

  for (const name of RETIRED_AGENT_SKILL_NAMES) {
    const canonicalDir = join(home, '.agents', 'skills', name)
    if (existsSync(canonicalDir)) {
      // Why: only delete the canonical agents copy and our harness links. A real
      // user-owned skill directory under ~/.claude/skills/orchestration is left alone.
      rmSync(canonicalDir, { recursive: true, force: true })
      result.retired.push(name)
    }
    for (const segments of HARNESS_SKILL_DIRECTORIES) {
      const linkPath = join(home, ...segments, name)
      try {
        if (lstatSync(linkPath).isSymbolicLink()) {
          rmSync(linkPath, { force: true })
        }
      } catch {
        // Missing link is fine.
      }
    }
  }

  for (const name of DEFAULT_AGENT_SKILL_NAMES) {
    if (!isBundledSkillEnabled(args.bundledSkillCapabilities, name)) {
      // Why leave an existing copy in place: turning the capability off withholds future installs;
      // deleting a skill an agent is mid-conversation with is a different, destructive decision.
      result.disabled.push(name)
      continue
    }
    const shipped = readIfPresent(join(args.packageRoot, name, 'SKILL.md'))
    if (shipped === null) {
      result.unavailable.push(name)
      continue
    }

    const canonicalDir = join(home, '.agents', 'skills', name)
    const canonicalFile = join(canonicalDir, 'SKILL.md')
    const current = readIfPresent(canonicalFile)

    if (current === null) {
      mkdirSync(canonicalDir, { recursive: true })
      writeFileSync(canonicalFile, shipped, 'utf8')
      result.installed.push(name)
    } else if (current === shipped) {
      result.alreadyCurrent.push(name)
    } else if (isOursToReplace(current, shipped, args.knownPreviousContents?.[name])) {
      writeFileSync(canonicalFile, shipped, 'utf8')
      result.installed.push(name)
    } else {
      // Somebody's edit, or a different skill wearing the same name. Refusing to write is the
      // whole reason this is safe to run unattended.
      result.skipped.push(name)
      continue
    }

    for (const segments of HARNESS_SKILL_DIRECTORIES) {
      const harnessRoot = join(home, ...segments)
      if (!existsSync(harnessRoot)) {
        continue
      }
      const linkPath = join(harnessRoot, name)
      if (linkPointsAtCanonical(linkPath, canonicalDir)) {
        continue
      }
      let existing: ReturnType<typeof lstatSync> | null = null
      try {
        existing = lstatSync(linkPath)
      } catch {
        existing = null
      }
      if (existing?.isSymbolicLink()) {
        // A link that no longer resolves, or points somewhere else entirely: replace it, since a
        // dangling entry hides the skill from the agent while looking installed.
        rmSync(linkPath, { force: true })
      } else if (existing) {
        // A real directory or file the user or another installer owns. Leave it.
        continue
      }
      try {
        symlinkSync(canonicalDir, linkPath)
        result.linkedRoots.push(harnessRoot)
      } catch {
        // A harness whose directory is read-only must not stop the others.
      }
    }
  }

  return result
}

/**
 * Where the shipped skill packages live: alongside the other extraResources when packaged, and at
 * the repo root in development, mirroring how `loadSkillBundleArtifacts` resolves its manifests.
 */
export function defaultSkillPackageRoot(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'skill-packages')
    : resolve(process.cwd(), 'skills')
}

/**
 * Startup entry point. Never throws: a failure here means an agent is missing a guide, which must
 * not stop the app from launching.
 */
export function installDefaultAgentSkillsOnStartup(
  bundledSkillCapabilities?: Readonly<Record<string, boolean>>
): void {
  try {
    const result = installDefaultAgentSkills({
      packageRoot: defaultSkillPackageRoot(),
      bundledSkillCapabilities
    })
    if (result.installed.length > 0 || result.linkedRoots.length > 0) {
      console.info(
        `[skills] installed ${result.installed.join(', ') || 'none'}; linked into ${result.linkedRoots.length} harness dir(s)`
      )
    }
    if (result.skipped.length > 0) {
      console.info(`[skills] left your own copies alone: ${result.skipped.join(', ')}`)
    }
    if (result.disabled.length > 0) {
      console.info(`[skills] turned off in Settings: ${result.disabled.join(', ')}`)
    }
  } catch (error) {
    console.warn('[skills] could not install the default agent skills:', error)
  }
}
