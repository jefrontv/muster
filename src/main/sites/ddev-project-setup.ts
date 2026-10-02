// Putting a folder on DDEV: `ddev config`, a per-worktree name, wp-config.php, start, core.
//
// The database starts empty, as Agent Local's attach does; the wizard's import step fills it. A
// folder that already has `.ddev/config.yaml` is adopted rather than reconfigured, because that
// file is usually committed and belongs to the team.

import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parse as parseYaml } from 'yaml'
import type { LocalWpMigrationPlan, LocalWpMigrationResult } from '../../shared/site-stack-types'
import { ddevCommandFailure, ddevOutputLines } from './ddev-command-failure'
import { ensureDockerRunning } from './ddev-docker'
import {
  createDdevHost,
  DDEV_NOT_INSTALLED,
  DDEV_START_TIMEOUT_MS,
  type DdevHost
} from './ddev-host'
import { readDdevGlobalConfig } from './ddev-project-files'
import { describeDdevProject, urlAuthority } from './ddev-project-state'
import { ensureDdevSiteRunning, findDdevProject } from './ddev-site-control'
import { prepareWpConfigForDdev } from './ddev-wp-config'
import type { LocalWpMigrationRequest } from './localwp-migration-plan'

// Config is quick on an idle machine; a busy Docker can hold it well past the 30 s read timeout.
const DDEV_CONFIG_TIMEOUT_MS = 2 * 60_000

export type DdevSetupOutcome = LocalWpMigrationResult & {
  domain: string
  dbPort: number | null
  dbUser: string
  phpVersion: string
}

export type DdevSetupOptions = {
  /** Absolute docroot (where wp-load.php is or will be). */
  docroot: string
  phpVersion?: string
  /** The import that follows pulls server files, and base.zip carries core. */
  skipCoreDownload?: boolean
  onStatus?: (message: string) => void
  host?: DdevHost
}

/** DDEV accepts letters, digits and hyphens; anything else from a folder or branch becomes one. */
export function slugifyDdevName(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60)
      .replace(/-+$/g, '') || 'site'
  )
}

/** The project name a typed domain asks for: its first label, port and TLD dropped. */
export function ddevNameFromDomain(domain: string): string {
  const host = domain
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/:\d+$/, '')
  const label = host.split('.')[0] ?? ''
  // Empty means "no preference", so the caller falls back to the folder name.
  return label.length > 0 ? slugifyDdevName(label) : ''
}

export type WorktreeInfo = { repoName: string; branch: string }

/**
 * A linked worktree has a `.git` FILE pointing at `<main>/.git/worktrees/<name>`. Read off disk so
 * it costs no git process and works on any git version.
 */
export async function readWorktreeInfo(sitePath: string): Promise<WorktreeInfo | null> {
  let pointer: string
  try {
    pointer = await readFile(path.join(sitePath, '.git'), 'utf8')
  } catch {
    return null
  }
  const gitDir = /^\s*gitdir:\s*(.+)$/m.exec(pointer)?.[1]?.trim()
  if (!gitDir || !/[\\/]worktrees[\\/][^\\/]+$/.test(gitDir)) {
    return null
  }
  const absoluteGitDir = path.resolve(sitePath, gitDir)
  const mainCheckout = path.dirname(path.dirname(path.dirname(absoluteGitDir)))
  let head = ''
  try {
    head = await readFile(path.join(absoluteGitDir, 'HEAD'), 'utf8')
  } catch {
    head = ''
  }
  const branch = /^ref:\s*refs\/heads\/(.+)$/m.exec(head)?.[1]?.trim() || path.basename(sitePath)
  return { repoName: path.basename(mainCheckout), branch }
}

/** Names DDEV already has, from its registry, so two folders never claim the same one. */
export async function registeredProjects(host: DdevHost): Promise<Map<string, string>> {
  const text = await host.readText(path.join(host.homeDir, '.ddev', 'project_list.yaml'))
  const projects = new Map<string, string>()
  try {
    const parsed = (text ? parseYaml(text) : null) as Record<string, { approot?: unknown }> | null
    for (const [name, entry] of Object.entries(parsed ?? {})) {
      if (typeof entry?.approot === 'string') {
        projects.set(name, path.resolve(entry.approot))
      }
    }
  } catch {
    // An unreadable registry only loses the clash check; DDEV still refuses a real clash on start.
  }
  return projects
}

export async function chooseDdevProjectName(
  host: DdevHost,
  sitePath: string,
  wanted: string
): Promise<string> {
  const taken = await registeredProjects(host)
  const root = path.resolve(sitePath)
  let candidate = wanted
  for (let suffix = 2; taken.has(candidate) && taken.get(candidate) !== root; suffix += 1) {
    candidate = `${wanted}-${suffix}`
  }
  return candidate
}

export function planDdevSetup(
  request: LocalWpMigrationRequest,
  docroot: string,
  state: { hasConfig: boolean; hasWordPress: boolean; projectName: string; tld: string }
): LocalWpMigrationPlan {
  const relativeDocroot = path.relative(request.sitePath, docroot) || '.'
  return {
    ok: true,
    blockedReason: '',
    mode: state.hasWordPress ? 'migrate' : 'create',
    sitePath: request.sitePath,
    domain: `${state.projectName}.${state.tld}`,
    wordPressRoot: docroot,
    databaseName: 'db',
    databaseUser: 'db',
    appPublicEntries: [],
    moves: [],
    edits: state.hasWordPress ? [path.join(docroot, 'wp-config.php')] : [],
    steps: [
      state.hasConfig
        ? 'Use the DDEV project already in this folder'
        : `Create a DDEV WordPress project '${state.projectName}' with docroot ${relativeDocroot}`,
      ...(state.hasWordPress
        ? ['Point wp-config.php at DDEV inside the container (a .muster-backup copy is kept)']
        : []),
      'Start the project with DDEV',
      ...(state.hasWordPress ? [] : ['Download WordPress core into the docroot']),
      'Pull the site down with the import step to fill the empty database'
    ]
  }
}

export async function previewDdevSetup(
  request: LocalWpMigrationRequest,
  options: Pick<DdevSetupOptions, 'docroot' | 'host'>
): Promise<LocalWpMigrationPlan> {
  const host = options.host ?? createDdevHost()
  const existing = await findDdevProject(request.sitePath, { host })
  const { projectTld } = await readDdevGlobalConfig(host)
  const projectName = existing?.name ?? (await wantedProjectName(host, request))
  const plan = planDdevSetup(request, options.docroot, {
    hasConfig: existing !== null,
    hasWordPress: await host.pathExists(path.join(options.docroot, 'wp-load.php')),
    projectName,
    tld: projectTld
  })
  if (!host.findBinary('ddev')) {
    return { ...plan, ok: false, blockedReason: DDEV_NOT_INSTALLED }
  }
  if (existing && existing.type && existing.type !== 'wordpress') {
    return {
      ...plan,
      ok: false,
      blockedReason: `This folder is a DDEV "${existing.type}" project, not WordPress.`
    }
  }
  return plan
}

async function wantedProjectName(
  host: DdevHost,
  request: LocalWpMigrationRequest
): Promise<string> {
  const worktree = await readWorktreeInfo(request.sitePath)
  const fromDomain = ddevNameFromDomain(request.domain)
  // A worktree keeps its own name even when the wizard suggested the main checkout's domain.
  const base = worktree
    ? slugifyDdevName(`${worktree.repoName}-${worktree.branch}`)
    : fromDomain || slugifyDdevName(path.basename(request.sitePath))
  return chooseDdevProjectName(host, request.sitePath, base)
}

export async function runDdevSetup(
  request: LocalWpMigrationRequest,
  options: DdevSetupOptions
): Promise<DdevSetupOutcome> {
  const host = options.host ?? createDdevHost()
  const log: string[] = []
  const report = (message: string): void => {
    log.push(message)
    options.onStatus?.(message)
  }
  const plan = await previewDdevSetup(request, { docroot: options.docroot, host })
  const failed = (message: string): DdevSetupOutcome => ({
    ok: false,
    message,
    plan,
    socketPath: '',
    localWpRoot: '',
    databaseImported: false,
    log: [...log, message],
    domain: request.domain,
    dbPort: null,
    dbUser: '',
    phpVersion: ''
  })
  if (!plan.ok) {
    return failed(plan.blockedReason)
  }
  const ddev = host.findBinary('ddev')
  if (!ddev) {
    return failed(DDEV_NOT_INSTALLED)
  }
  const dockerProblem = await ensureDockerRunning(host, report)
  if (dockerProblem) {
    return failed(dockerProblem)
  }

  const root = request.sitePath
  const relativeDocroot = path.relative(root, options.docroot).split(path.sep).join('/')
  let existing = await findDdevProject(root, { host })
  if (!existing) {
    const name = await wantedProjectName(host, request)
    report(`Creating DDEV project ${name}…`)
    const args = [
      'config',
      '--project-type=wordpress',
      // Apache, not DDEV's nginx default: efront servers run Apache, and the upload rewrite and
      // plugin rules live in .htaccess, which nginx ignores.
      '--webserver-type=apache-fpm',
      `--project-name=${name}`,
      `--docroot=${relativeDocroot}`
    ]
    let configured = await host.run(
      ddev,
      [...args, ...(options.phpVersion ? [`--php-version=${options.phpVersion}`] : [])],
      { cwd: root, timeoutMs: DDEV_CONFIG_TIMEOUT_MS }
    )
    // A PHP the site's record carries (8.5 from Agent Local) may be newer than this DDEV supports.
    if (configured.code !== 0 && options.phpVersion) {
      report(`DDEV refused PHP ${options.phpVersion}; using its default instead.`)
      configured = await host.run(ddev, args, { cwd: root, timeoutMs: DDEV_CONFIG_TIMEOUT_MS })
    }
    if (configured.code !== 0) {
      ddevOutputLines(configured).forEach(report)
      return failed(ddevCommandFailure('ddev config', configured, DDEV_CONFIG_TIMEOUT_MS))
    }
    existing = await findDdevProject(root, { host })
  } else {
    const worktree = await readWorktreeInfo(root)
    const overridePath = path.join(existing.root, '.ddev', 'config.local.yaml')
    if (worktree && !(await host.pathExists(overridePath))) {
      // The committed config.yaml names the main checkout; DDEV refuses two projects with one name.
      const name = await chooseDdevProjectName(
        host,
        root,
        slugifyDdevName(`${worktree.repoName}-${worktree.branch}`)
      )
      await writeFile(
        overridePath,
        `# Written by Muster: this worktree's own DDEV name.\nname: ${name}\n`,
        'utf8'
      )
      report(
        `This is a worktree, so it runs as ${name} (in .ddev/config.local.yaml, which git ignores).`
      )
      existing = await findDdevProject(root, { host })
    }
  }
  if (!existing) {
    return failed('DDEV did not write .ddev/config.yaml.')
  }

  const wpConfig = await prepareWpConfigForDdev(options.docroot, root)
  if (wpConfig.action === 'tracked') {
    return failed(wpConfig.message)
  }
  if (wpConfig.action === 'patched') {
    report(
      `wp-config.php now defers ${wpConfig.deferred.join(', ') || 'its settings'} to DDEV inside the container (backup: ${path.basename(wpConfig.backupPath)}).`
    )
  }

  const started = await ensureDdevSiteRunning({ path: root, localStack: 'ddev' }, report, { host })
  if (!started.ok) {
    return failed(started.message)
  }

  const hasCore = await host.pathExists(path.join(options.docroot, 'wp-load.php'))
  if (!hasCore && options.skipCoreDownload) {
    report('WordPress core comes with the server files in the import.')
  } else if (!hasCore) {
    report('Downloading WordPress core…')
    const download = await host.run(ddev, ['wp', 'core', 'download', '--skip-content'], {
      cwd: root,
      timeoutMs: DDEV_START_TIMEOUT_MS
    })
    if (download.code !== 0) {
      ddevOutputLines(download).forEach(report)
      return failed(ddevCommandFailure('WordPress core download', download, DDEV_START_TIMEOUT_MS))
    }
  }

  const state = await describeDdevProject(host, existing.root).catch(() => null)
  const domain = (state && urlAuthority(state.primaryUrl)) || plan.domain
  report(`DDEV is serving https://${domain}.`)
  return {
    ok: true,
    message: `DDEV is serving https://${domain}. Run the import to fill its database.`,
    plan,
    socketPath: '',
    localWpRoot: relativeDocroot === '' || relativeDocroot === '.' ? '' : relativeDocroot,
    databaseImported: false,
    log,
    domain,
    dbPort: state?.db?.port ?? null,
    dbUser: state?.db?.user ?? 'db',
    phpVersion: state?.phpVersion ?? ''
  }
}
