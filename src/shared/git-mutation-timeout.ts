// Why: pre-commit/pre-push hooks and slow remotes outlast a 30s RPC; timing out while git keeps running made users retry and commit or push twice.
export const GIT_MUTATION_TIMEOUT_MS = 10 * 60_000
