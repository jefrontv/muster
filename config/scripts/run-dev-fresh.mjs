#!/usr/bin/env node
// Launch the same electron-vite dev app as `pnpm run dev`, but with an empty
// userData profile so the window looks like a first install: onboarding on,
// no saved sites, workspaces, settings, or sessions. The normal muster-dev
// profile is left alone.

import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const PROFILE_PREFIX = 'orca-fresh-profile-'
const repoRoot = path.resolve(import.meta.dirname, '../..')
const devRunner = path.join(import.meta.dirname, 'run-electron-vite-dev.mjs')

export function parseFreshDevArgs(argv) {
  const keep = argv.includes('--keep')
  const help = argv.includes('--help') || argv.includes('-h')
  const forwarded = argv.filter((arg) => arg !== '--keep' && arg !== '--help' && arg !== '-h')
  return { keep, help, forwarded }
}

export function isSafeFreshProfileDir(dir) {
  const resolved = path.resolve(dir)
  const tmpRoot = path.resolve(tmpdir())
  const underTmp = resolved === tmpRoot || resolved.startsWith(`${tmpRoot}${path.sep}`)
  return (
    underTmp || resolved.includes('orca-fresh-profile') || resolved.includes('muster-fresh-profile')
  )
}

export function resolveFreshProfileDir(env = process.env) {
  const requested = env.ORCA_FRESH_PROFILE_DIR?.trim()
  if (requested) {
    const dir = path.resolve(requested)
    if (!isSafeFreshProfileDir(dir)) {
      throw new Error(
        `Refusing ORCA_FRESH_PROFILE_DIR=${dir}. Point it at a *fresh-profile* path or a temp dir so a typo cannot wipe muster-dev.`
      )
    }
    return { dir, ephemeral: false }
  }
  return {
    dir: mkdtempSync(path.join(tmpdir(), PROFILE_PREFIX)),
    ephemeral: true
  }
}

export function resetFreshProfileDir(dir) {
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
}

function printHelp() {
  process.stdout.write(`Launch Muster dev as a first-time install.

Usage:
  pnpm run dev-fresh [--keep] [-- <dev args>]
  ORCA_FRESH_PROFILE_DIR=/tmp/orca-fresh-profile-mine pnpm run dev-fresh

Options:
  --keep    Keep the temp profile after exit (default: delete it)
  --help    Show this help

The regular muster-dev profile is not touched. Onboarding and first-run
education are turned back on for this window only.
`)
}

function isCliEntry() {
  const entry = process.argv[1]
  if (!entry) {
    return false
  }
  const left = path.resolve(entry)
  const right = path.resolve(import.meta.filename)
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right
}

function runFreshDev() {
  const parsed = parseFreshDevArgs(process.argv.slice(2))
  if (parsed.help) {
    printHelp()
    process.exit(0)
  }

  const { dir, ephemeral } = resolveFreshProfileDir()
  resetFreshProfileDir(dir)
  const shouldDelete = ephemeral && !parsed.keep

  console.error(`[dev-fresh] userData=${dir}`)
  if (shouldDelete) {
    console.error('[dev-fresh] profile is ephemeral and will be deleted on exit')
  }

  const child = spawn(process.execPath, [devRunner, ...parsed.forwarded], {
    cwd: repoRoot,
    env: {
      ...process.env,
      ORCA_DEV_USER_DATA_PATH: dir,
      ORCA_DEV_SHOW_FIRST_RUN_EDUCATION: '1',
      ORCA_DEV_INSTANCE_LABEL: process.env.ORCA_DEV_INSTANCE_LABEL || 'fresh',
      ORCA_DEV_DOCK_TITLE: process.env.ORCA_DEV_DOCK_TITLE || 'Muster: fresh'
    },
    stdio: 'inherit'
  })

  let exiting = false
  const cleanup = () => {
    if (!shouldDelete) {
      console.error(`[dev-fresh] kept ${dir}`)
      return
    }
    try {
      rmSync(dir, { recursive: true, force: true })
      console.error(`[dev-fresh] removed ${dir}`)
    } catch (error) {
      console.error(
        `[dev-fresh] failed to remove ${dir}: ${error instanceof Error ? error.message : error}`
      )
    }
  }

  const shutdown = (signal) => {
    if (exiting) {
      return
    }
    exiting = true
    if (child.exitCode === null && child.signalCode === null) {
      child.kill(signal)
    }
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  child.on('exit', (code, signal) => {
    cleanup()
    if (signal) {
      process.exit(1)
    }
    process.exit(code ?? 0)
  })
}

if (isCliEntry()) {
  runFreshDev()
}
