import { readFileSync } from 'node:fs'
import type { CommandHandler } from '../dispatch'
import { printResult } from '../format'
import { getOptionalStringFlag, getRequiredStringFlag } from '../flags'
import { RuntimeClientError } from '../runtime-client'

type BundledExtensionInfoLike = {
  id: string
  name: string
  installed: boolean
  enabled: boolean
}

type ExtensionListResult = {
  bundled: BundledExtensionInfoLike[]
  loaded: { path: string; name: string | null; error: string | null }[]
}

function formatExtensionList(value: ExtensionListResult): string {
  const lines: string[] = ['Bundled:']
  for (const entry of value.bundled) {
    const state = entry.enabled ? 'enabled' : entry.installed ? 'installed' : 'not installed'
    lines.push(`  ${entry.id}  ${state}  (${entry.name})`)
  }
  lines.push('Loaded:')
  if (value.loaded.length === 0) {
    lines.push('  (none)')
  }
  for (const entry of value.loaded) {
    lines.push(`  ${entry.name ?? entry.path}${entry.error ? `  ERROR: ${entry.error}` : ''}`)
  }
  return lines.join('\n')
}

/**
 * Reads a secret from a file or stdin instead of argv. A password on the command line lands in
 * shell history and in the process table, where any local process can read it.
 */
function readSecretFromFlags(flags: Map<string, string | boolean>): string | undefined {
  const fromFile = getOptionalStringFlag(flags, 'password-file')
  if (fromFile) {
    return readFileSync(fromFile, 'utf8').replace(/\r?\n$/, '')
  }
  if (flags.has('password-stdin')) {
    return readFileSync(0, 'utf8').replace(/\r?\n$/, '')
  }
  return undefined
}

export const BROWSER_EXTENSION_HANDLERS: Record<string, CommandHandler> = {
  'extension list': async ({ client, json }) => {
    const result = await client.call<ExtensionListResult>('extension.list', {})
    printResult(result, json, formatExtensionList)
  },
  'extension reload': async ({ client, json }) => {
    const result = await client.call<unknown>('extension.reload', {})
    printResult(result, json, () => 'Extensions reloaded.')
  },
  'extension install': async ({ flags, client, json }) => {
    const id = getRequiredStringFlag(flags, 'id')
    const result = await client.call<unknown>('extension.install', { id })
    printResult(result, json, () => `Installed and enabled ${id}.`)
  },
  'extension disable': async ({ flags, client, json }) => {
    const id = getRequiredStringFlag(flags, 'id')
    const result = await client.call<unknown>('extension.disable', { id })
    printResult(result, json, () => `Disabled ${id}.`)
  },
  'extension uninstall': async ({ flags, client, json }) => {
    const id = getRequiredStringFlag(flags, 'id')
    const result = await client.call<unknown>('extension.uninstall', { id })
    printResult(result, json, () => `Uninstalled ${id}.`)
  },
  'extension wp-login show': async ({ client, json }) => {
    const result = await client.call<{
      username: string
      autoLogin: boolean
      hasPassword: boolean
    }>('extension.wordpressLogin.get', {})
    printResult(
      result,
      json,
      (value) =>
        `username: ${value.username || '(unset)'}\npassword: ${
          value.hasPassword ? 'stored' : '(unset)'
        }\nauto-login: ${value.autoLogin ? 'on' : 'off'}`
    )
  },
  'extension wp-login set': async ({ flags, client, json }) => {
    // Read the raw flag rather than getOptionalStringFlag: an explicit --username "" must be able
    // to clear the stored name, which a helper that drops empty strings cannot express.
    const rawUsername = flags.get('username')
    const username = typeof rawUsername === 'string' ? rawUsername : undefined
    const password = readSecretFromFlags(flags)
    const autoLoginFlag = flags.has('auto-login')
      ? true
      : flags.has('no-auto-login')
        ? false
        : undefined
    if (username === undefined && password === undefined && autoLoginFlag === undefined) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Nothing to change. Pass --username, --password-stdin/--password-file, or --auto-login/--no-auto-login.'
      )
    }
    // Read current values so a partial update never blanks the fields it did not mention.
    const current = await client.call<{ username: string; autoLogin: boolean }>(
      'extension.wordpressLogin.get',
      {}
    )
    const result = await client.call<unknown>('extension.wordpressLogin.set', {
      username: username ?? current.result.username,
      autoLogin: autoLoginFlag ?? current.result.autoLogin,
      ...(password === undefined ? {} : { password })
    })
    printResult(result, json, () => 'WordPress autofill updated.')
  },
  'extension wp-login clear-password': async ({ client, json }) => {
    const result = await client.call<unknown>('extension.wordpressLogin.clearPassword', {})
    printResult(result, json, () => 'Stored password cleared.')
  }
}
