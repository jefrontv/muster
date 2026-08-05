// The redacted payloads every site tool returns.
//
// This module is the password boundary. It reads only SiteSummary.secrets, which is a pair of
// booleans, and it never imports the secret store — so there is no code path by which a tool
// response could carry a password value. Ported from ocsites mcp_server.py `_deployment_full_config`,
// `_env_summary`, `_project_env_view` and `_preview_run`.

import {
  countSelectedToggles,
  DEFAULT_SITE_ENVIRONMENT_NAME,
  SITE_DEPLOY_TOGGLES,
  SITE_IMPORT_TOGGLES,
  type Site,
  type SiteEnvironment,
  type SiteEnvironmentResolution,
  type SiteSecretPresence,
  type SiteSummary
} from '../../../shared/site-types'
import type { SiteRunPlan } from '../site-run-plan'
import { canonicalKey, readFieldValues } from './site-mcp-fields'

const NO_SECRETS: SiteSecretPresence = { ssh: false, db: false }

/** ocsites returned a sentence, not an enum — a model relays the sentence straight to the user. */
export function describeResolution(
  resolution: SiteEnvironmentResolution,
  branch: string | null
): string {
  const branchLabel = branch && branch.length > 0 ? branch : '(none)'
  switch (resolution.reason) {
    case 'branch-match':
      return `branch '${branchLabel}' matches env name`
    case 'active-environment':
      return `no env matches branch '${branchLabel}' — using the site's selected env '${resolution.environment ?? ''}'`
    case 'default-main':
      return `no env matches branch '${branchLabel}' — falling back to default env '${DEFAULT_SITE_ENVIRONMENT_NAME}'`
    case 'first-environment':
      return `no '${DEFAULT_SITE_ENVIRONMENT_NAME}' env present — falling back to first env '${resolution.environment ?? ''}'`
    case 'no-environments':
      return 'no environments configured'
  }
}

function toggleStates(
  environment: SiteEnvironment | null,
  toggles: typeof SITE_IMPORT_TOGGLES | typeof SITE_DEPLOY_TOGGLES
): Record<string, boolean> {
  const states: Record<string, boolean> = {}
  for (const toggle of toggles) {
    states[canonicalKey(toggle.key)] = environment ? environment[toggle.key] : false
  }
  return states
}

export function buildEnvironmentSummary(
  site: Site,
  name: string,
  presence: SiteSecretPresence
): Record<string, unknown> {
  const environment = site.environments[name] ?? null
  return {
    name,
    hostname: environment?.hostname ?? '',
    live_domain: environment?.liveDomain ?? '',
    root_path: environment?.rootPath ?? '',
    username: environment?.username ?? '',
    deploy_command: environment?.deployCommand ?? '',
    ssh_password_set: presence.ssh,
    db_password_set: presence.db,
    import_toggles: toggleStates(environment, SITE_IMPORT_TOGGLES),
    deploy_toggles: toggleStates(environment, SITE_DEPLOY_TOGGLES)
  }
}

function siteHeader(summary: SiteSummary): Record<string, unknown> {
  return {
    site: summary.site.displayName,
    site_id: summary.site.id,
    path: summary.site.path,
    path_exists: summary.pathExists,
    has_config: Object.keys(summary.site.environments).length > 0
  }
}

/** ocsites `_project_env_view`: every env plus what a run would target right now. */
export function buildEnvironmentView(summary: SiteSummary): Record<string, unknown> {
  const names = Object.keys(summary.site.environments)
  return {
    ok: true,
    ...siteHeader(summary),
    stored_active_environment: summary.site.activeEnvironment,
    current_branch: summary.branch ?? '',
    resolved_environment: summary.resolvedEnvironment.environment,
    resolution_reason: describeResolution(summary.resolvedEnvironment, summary.branch),
    requires_confirmation: summary.resolvedEnvironment.requiresConfirmation,
    environments: names.map((name) =>
      buildEnvironmentSummary(summary.site, name, summary.secrets[name] ?? NO_SECRETS)
    )
  }
}

/**
 * ocsites `_deployment_full_config`. Passwords appear only as `passwords_set` booleans.
 * `override` pins the view to an explicitly requested environment, so a write that targeted
 * `staging` reports staging rather than whatever the current branch happens to resolve to.
 */
export function buildDeploymentConfigView(
  summary: SiteSummary,
  override: string | null = null
): Record<string, unknown> {
  const active = override ?? summary.resolvedEnvironment.environment
  const environment = active ? (summary.site.environments[active] ?? null) : null
  const presence = active ? (summary.secrets[active] ?? NO_SECRETS) : NO_SECRETS
  const counts = environment
    ? {
        import_selected: countSelectedToggles(environment, 'import'),
        deploy_selected: countSelectedToggles(environment, 'deploy')
      }
    : { import_selected: 0, deploy_selected: 0 }
  return {
    ok: true,
    ...siteHeader(summary),
    environment: active,
    current_branch: summary.branch ?? '',
    resolution_reason: describeResolution(summary.resolvedEnvironment, summary.branch),
    available_environments: Object.keys(summary.site.environments),
    fields: readFieldValues(summary.site, environment),
    passwords_set: { password: presence.ssh, db_password: presence.db },
    import_toggles: toggleStates(environment, SITE_IMPORT_TOGGLES),
    deploy_toggles: toggleStates(environment, SITE_DEPLOY_TOGGLES),
    ...counts
  }
}

/** ocsites `_deployment_summary`: the cheap "is this site wired up" answer. */
export function buildDeploymentStatusView(summary: SiteSummary): Record<string, unknown> {
  return {
    ok: true,
    ...siteHeader(summary),
    environment: summary.resolvedEnvironment.environment,
    import_selected: summary.importSelectedCount,
    deploy_selected: summary.deploySelectedCount
  }
}

/**
 * ocsites `_preview_run`, backed by buildSiteRunPlan so the preview and the guard can never
 * disagree about what a run would do or whether it is allowed to start.
 */
export function buildRunPreview(summary: SiteSummary, plan: SiteRunPlan): Record<string, unknown> {
  const environment = plan.environment ? summary.site.environments[plan.environment] : undefined
  const remoteTarget =
    environment && plan.requiresRemote
      ? `${environment.username}@${environment.hostname}:${environment.rootPath}`
      : ''
  return {
    ok: plan.blockedBy.length === 0,
    ...siteHeader(summary),
    group: plan.group,
    environment: plan.environment,
    current_branch: summary.branch ?? '',
    resolution_reason: describeResolution(plan.resolution, summary.branch),
    available_environments: Object.keys(summary.site.environments),
    remote_target: remoteTarget,
    local_target: summary.site.path,
    local_wp_root: summary.site.localWpRoot,
    steps: plan.steps.map((step) => ({
      key: canonicalKey(step.key),
      label: step.label,
      enabled: step.enabled,
      remote: step.remote
    })),
    enabled_step_count: plan.enabledStepCount,
    requires_remote: plan.requiresRemote,
    blocked_by: plan.blockedBy,
    confirmable: plan.confirmable
  }
}
