// Learned Claude models: every concrete model id Muster has observed, with the
// CLI-reported context window when one has been seen. This is what makes new
// models adapt without an app release — the picker derives new families from
// these ids and the context meter sizes windows from them.
//
// Sources: chat-thread stream results (modelUsage carries id + contextWindow,
// authoritative) and transcript assistant records (id only). A window is only
// ever overwritten by another reported window, never cleared by an id-only
// sighting.

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { App } from 'electron'

export type LearnedClaudeModel = {
  contextWindow?: number
  lastSeenAt: number
}

export type LearnedClaudeModelMap = Record<string, LearnedClaudeModel>

const WRITE_DEBOUNCE_MS = 2_000
const MODEL_ID_MAX_LENGTH = 200

let registryPathOverride: string | null = null
let loaded: LearnedClaudeModelMap | null = null
let loadPromise: Promise<LearnedClaudeModelMap> | null = null
let writeTimer: ReturnType<typeof setTimeout> | null = null

function registryPath(): string {
  if (registryPathOverride) {
    return registryPathOverride
  }
  // Lazy require: keeps this module importable in tests without an app instance.
  const { app } = require('electron') as { app: App }
  return path.join(app.getPath('userData'), 'claude-model-registry.json')
}

function sanitize(parsed: unknown): LearnedClaudeModelMap {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return {}
  }
  const out: LearnedClaudeModelMap = {}
  for (const [model, value] of Object.entries(parsed)) {
    if (typeof value !== 'object' || value === null) {
      continue
    }
    const record = value as Record<string, unknown>
    const lastSeenAt = typeof record.lastSeenAt === 'number' ? record.lastSeenAt : 0
    const contextWindow =
      typeof record.contextWindow === 'number' && record.contextWindow > 0
        ? record.contextWindow
        : undefined
    out[model] = { lastSeenAt, ...(contextWindow ? { contextWindow } : {}) }
  }
  return out
}

async function load(): Promise<LearnedClaudeModelMap> {
  if (loaded) {
    return loaded
  }
  loadPromise ??= readFile(registryPath(), 'utf-8')
    .then((raw) => sanitize(JSON.parse(raw)))
    .catch(() => ({}))
    .then((map) => {
      loaded ??= map
      return loaded
    })
  return loadPromise
}

function scheduleWrite(): void {
  if (writeTimer) {
    return
  }
  writeTimer = setTimeout(() => {
    writeTimer = null
    void persistNow()
  }, WRITE_DEBOUNCE_MS)
}

async function persistNow(): Promise<void> {
  if (!loaded) {
    return
  }
  const target = registryPath()
  try {
    await mkdir(path.dirname(target), { recursive: true })
    // Atomic replace so a crash mid-write can't leave a truncated registry.
    await writeFile(`${target}.tmp`, JSON.stringify(loaded), 'utf-8')
    await rename(`${target}.tmp`, target)
  } catch {
    // Best-effort persistence: a read-only disk only costs re-learning.
  }
}

/** Record that a model id was observed; a positive contextWindow updates the
 *  stored window, an absent one leaves any previously learned window intact. */
export async function recordClaudeModelSighting(sighting: {
  model: string
  contextWindow?: number
  now?: number
}): Promise<void> {
  const model = sighting.model.trim()
  // Ignore junk ids: synthetic rows and free-form garbage would pollute the picker.
  if (!model || model.length > MODEL_ID_MAX_LENGTH || !/claude/i.test(model)) {
    return
  }
  const map = await load()
  const existing = map[model]
  const contextWindow =
    typeof sighting.contextWindow === 'number' && sighting.contextWindow > 0
      ? sighting.contextWindow
      : existing?.contextWindow
  map[model] = {
    lastSeenAt: sighting.now ?? Date.now(),
    ...(contextWindow ? { contextWindow } : {})
  }
  scheduleWrite()
}

export async function getLearnedClaudeModels(): Promise<LearnedClaudeModelMap> {
  return { ...(await load()) }
}

/** The learned window for a concrete model id, or null when never reported. */
export async function learnedClaudeContextWindow(
  model: string | null | undefined
): Promise<number | null> {
  if (!model) {
    return null
  }
  const map = await load()
  return map[model]?.contextWindow ?? null
}

export function resetClaudeModelRegistryForTests(overridePath: string | null): void {
  registryPathOverride = overridePath
  loaded = null
  loadPromise = null
  if (writeTimer) {
    clearTimeout(writeTimer)
    writeTimer = null
  }
}

export async function flushClaudeModelRegistryForTests(): Promise<void> {
  if (writeTimer) {
    clearTimeout(writeTimer)
    writeTimer = null
  }
  await persistNow()
}
