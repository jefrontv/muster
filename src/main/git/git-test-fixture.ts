/**
 * Shared git repo fixtures for tests that need a real repository.
 *
 * Why: `git init` plus identity config is several process spawns, and these suites
 * pay it once per test. Under full-suite parallelism macOS spawn cost degrades
 * roughly 20x because Gatekeeper revalidates every exec, which makes real-git
 * suites the slowest files in the repo.
 *
 * The template is cached on disk rather than in module scope: Vitest re-imports
 * modules per test file, so an in-process cache would rebuild the template for
 * every file instead of once. Each shape is built once per machine, then stamped
 * out with a plain directory copy so per-test setup costs zero spawns.
 */
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, renameSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const FIXTURE_GIT_USER_EMAIL = 'test@example.com'
export const FIXTURE_GIT_USER_NAME = 'Test User'

type TemplateKind = 'plain' | 'minimal' | 'bare' | 'main' | 'main-with-commit'

// Why: bump when a template's shape changes so stale on-disk copies are not reused.
const TEMPLATE_VERSION = 'v1'
const TEMPLATE_ROOT = join(tmpdir(), `orca-git-fixture-templates-${TEMPLATE_VERSION}`)

function populate(dir: string, kind: TemplateKind): void {
  if (kind === 'bare') {
    execFileSync('git', ['init', '--bare', '--quiet', dir])
    return
  }
  execFileSync('git', ['init', '--quiet', dir])
  if (kind === 'minimal') {
    // Why: repo-detection tests parse `.git/config` directly, so the identity
    // keys the other kinds add would be extra content under assertion.
    return
  }
  execFileSync('git', ['config', 'user.email', FIXTURE_GIT_USER_EMAIL], { cwd: dir })
  execFileSync('git', ['config', 'user.name', FIXTURE_GIT_USER_NAME], { cwd: dir })
  if (kind === 'main' || kind === 'main-with-commit') {
    // Why: `--initial-branch` needs git >= 2.28; symbolic-ref before the first
    // commit pins `main` on any version.
    execFileSync('git', ['symbolic-ref', 'HEAD', 'refs/heads/main'], { cwd: dir })
  }
  if (kind === 'main-with-commit') {
    execFileSync('git', ['commit', '--allow-empty', '--quiet', '-m', 'initial'], { cwd: dir })
  }
}

function templateFor(kind: TemplateKind): string {
  const finalPath = join(TEMPLATE_ROOT, kind)
  if (existsSync(finalPath)) {
    return finalPath
  }
  // Why: build somewhere private then rename, so a worker never reads a template
  // another worker is still writing. Losing the rename race is fine - the winner's
  // copy is byte-identical, so drop ours and use theirs.
  mkdirSync(TEMPLATE_ROOT, { recursive: true })
  const staging = mkdtempSync(join(TEMPLATE_ROOT, `.staging-${kind}-`))
  populate(staging, kind)
  try {
    renameSync(staging, finalPath)
  } catch {
    rmSync(staging, { recursive: true, force: true })
  }
  return finalPath
}

function stamp(kind: TemplateKind, target: string): void {
  mkdirSync(target, { recursive: true })
  cpSync(templateFor(kind), target, { recursive: true })
}

/** Empty repo with identity configured and no commits. */
export function initGitRepo(dir: string): void {
  stamp('plain', dir)
}

/** Bare `git init` with no identity config, for tests that parse `.git/config`. */
export function initMinimalGitRepo(dir: string): void {
  stamp('minimal', dir)
}

/** Empty bare repo, for push/clone targets. */
export function initBareGitRepo(dir: string): void {
  stamp('bare', dir)
}

/** Repo on `main` with identity configured and no commits, ready for real content. */
export function initGitRepoOnMain(dir: string): void {
  stamp('main', dir)
}

/** Repo on `main` with one empty initial commit and identity configured. */
export function initGitRepoWithCommit(dir: string): void {
  stamp('main-with-commit', dir)
}
