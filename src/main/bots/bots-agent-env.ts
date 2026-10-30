// Environment for the bots server, so the Claude and Codex CLIs it spawns use Muster's managed
// accounts and the user's login-shell PATH, the same way chat-mode threads do.
import { applyClaudeEnvPatch } from '../claude-accounts/environment'
import { loginShellEnvironmentDelta } from '../startup/login-shell-environment'
import type { CommitMessageAgentEnvironmentResolvers } from '../text-generation/commit-message-agent-environment'

// Stale coordinates for Muster's own agent-hook server or utility processes must not leak into bots.
const STRIPPED_KEYS = [
  'ORCA_AGENT_HOOK_PORT',
  'ORCA_AGENT_HOOK_TOKEN',
  'ORCA_AGENT_HOOK_ENV',
  'ORCA_AGENT_HOOK_VERSION',
  'ORCA_AGENT_HOOK_ENDPOINT',
  'ELECTRON_RUN_AS_NODE'
] as const

export async function buildBotsAgentEnv(
  resolvers: CommitMessageAgentEnvironmentResolvers | undefined,
  loginShellEnv: () => Record<string, string> | null = loginShellEnvironmentDelta
): Promise<Record<string, string>> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value
    }
  }
  for (const key of STRIPPED_KEYS) {
    delete env[key]
  }
  Object.assign(env, loginShellEnv() ?? {})

  // A nested launch can inherit Muster's own managed CODEX_HOME; only the resolver may set it.
  if (env.ORCA_CODEX_HOME && env.CODEX_HOME === env.ORCA_CODEX_HOME) {
    delete env.CODEX_HOME
  }
  const codexHome = resolvers?.prepareForCodexLaunch?.() ?? null
  if (codexHome) {
    env.CODEX_HOME = codexHome
  }

  const claudeAuth = (await resolvers?.prepareForClaudeLaunch?.()) ?? null
  if (claudeAuth) {
    // Last, so a profile-exported ANTHROPIC_API_KEY cannot override the managed account.
    applyClaudeEnvPatch(env, claudeAuth.envPatch, { stripAuthEnv: claudeAuth.stripAuthEnv })
  }
  return env
}
