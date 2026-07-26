/**
 * Shared test utilities for git-handler tests.
 *
 * Why: oxlint max-lines (300) requires splitting large test suites.
 * This module exports the mock dispatcher factory and git helpers
 * so multiple test files can reuse them without duplication.
 */
import { vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, renameSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { RelayDispatcher } from './dispatcher'

const TEST_GIT_USER_EMAIL = 'test@test.com'
const TEST_GIT_USER_NAME = 'Test'

// Why: declare an explicit type so the inferred return type of
// createMockDispatcher doesn't transitively reference `@vitest/spy`'s
// internal `Procedure` type (from `vi.fn(...)`). Without this annotation,
// TS2883 fires under `pnpm run tc:node` because the generated .d.ts would
// need to name a type that isn't portably resolvable from this module.
export type MockDispatcher = {
  onRequest: (
    method: string,
    handler: (
      params: Record<string, unknown>,
      context: { isStale: () => boolean; signal?: AbortSignal }
    ) => Promise<unknown>
  ) => void
  onNotification: (method: string, handler: (params: Record<string, unknown>) => void) => void
  notify: (method: string, params?: Record<string, unknown>) => void
  _requestHandlers: Map<
    string,
    (
      params: Record<string, unknown>,
      context: { isStale: () => boolean; signal?: AbortSignal }
    ) => Promise<unknown>
  >
  callRequest(
    method: string,
    params?: Record<string, unknown>,
    context?: { isStale: () => boolean; signal?: AbortSignal }
  ): Promise<unknown>
}

export function createMockDispatcher(): MockDispatcher {
  const requestHandlers = new Map<
    string,
    (
      params: Record<string, unknown>,
      context: { isStale: () => boolean; signal?: AbortSignal }
    ) => Promise<unknown>
  >()

  return {
    onRequest: vi.fn(
      (
        method: string,
        handler: (
          params: Record<string, unknown>,
          context: { isStale: () => boolean; signal?: AbortSignal }
        ) => Promise<unknown>
      ) => {
        requestHandlers.set(method, handler)
      }
    ),
    onNotification: vi.fn(),
    notify: vi.fn(),
    _requestHandlers: requestHandlers,
    async callRequest(
      method: string,
      params: Record<string, unknown> = {},
      context: { isStale: () => boolean; signal?: AbortSignal } = { isStale: () => false }
    ) {
      const handler = requestHandlers.get(method)
      if (!handler) {
        throw new Error(`No handler for ${method}`)
      }
      return handler(params, context)
    }
  }
}

// Why: `git init` plus two `git config` calls is three process spawns per test, and
// macOS spawn cost degrades roughly 20x under full-suite parallelism because
// Gatekeeper revalidates each binary. Stamp the repo from a disk-cached template so
// per-test setup costs zero spawns. The cache lives on disk, not in module scope,
// because Vitest re-imports modules per test file.
const RELAY_TEMPLATE_VERSION = 'v1'
const RELAY_TEMPLATE_DIR = join(tmpdir(), `relay-git-fixture-template-${RELAY_TEMPLATE_VERSION}`)

function relayTemplate(): string {
  if (existsSync(RELAY_TEMPLATE_DIR)) {
    return RELAY_TEMPLATE_DIR
  }
  // Why: build private then rename so no worker reads a half-written template.
  const staging = mkdtempSync(join(tmpdir(), '.relay-git-template-'))
  execFileSync('git', ['init'], { cwd: staging, stdio: 'pipe' })
  execFileSync('git', ['config', 'user.email', TEST_GIT_USER_EMAIL], {
    cwd: staging,
    stdio: 'pipe'
  })
  execFileSync('git', ['config', 'user.name', TEST_GIT_USER_NAME], {
    cwd: staging,
    stdio: 'pipe'
  })
  try {
    renameSync(staging, RELAY_TEMPLATE_DIR)
  } catch {
    // Lost the race; the winner's copy is byte-identical.
    rmSync(staging, { recursive: true, force: true })
  }
  return RELAY_TEMPLATE_DIR
}

export function gitInit(dir: string): void {
  cpSync(relayTemplate(), dir, { recursive: true })
}

export function gitCommit(dir: string, message: string): void {
  execFileSync('git', ['add', '.'], { cwd: dir, stdio: 'pipe' })
  // Why: `git submodule add` creates a checkout that does not inherit the
  // source repo's local identity config, and CI may have no global identity.
  execFileSync(
    'git',
    [
      '-c',
      `user.email=${TEST_GIT_USER_EMAIL}`,
      '-c',
      `user.name=${TEST_GIT_USER_NAME}`,
      'commit',
      '-m',
      message,
      '--allow-empty'
    ],
    { cwd: dir, stdio: 'pipe' }
  )
}

export type { RelayDispatcher }
