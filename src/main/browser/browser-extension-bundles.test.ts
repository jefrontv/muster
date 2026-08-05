import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

let userDataDir: string
let resourcesDir: string

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => resourcesDir,
    getPath: () => userDataDir
  }
}))
vi.mock('../persistence', () => ({
  getCanonicalUserDataPath: () => userDataDir
}))
vi.mock('../../shared/secure-file', () => ({
  writeSecureFile: (target: string, contents: string) => {
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, contents)
  }
}))

const {
  getInstalledBundledExtensionDir,
  installBundledExtension,
  isBundledExtensionInstalled,
  uninstallBundledExtension,
  writeWordPressLoginConfig
} = await import('./browser-extension-bundles')

function seedBundledSource(): void {
  const dir = path.join(resourcesDir, 'resources', 'browser-extensions', 'wordpress-login-autofill')
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    path.join(dir, 'manifest.json'),
    JSON.stringify({ manifest_version: 3, name: 'WordPress Login Autofill', version: '1.0.0' })
  )
  writeFileSync(path.join(dir, 'content.js'), '// content')
  writeFileSync(path.join(dir, 'config.js'), 'globalThis.__MUSTER_WP_LOGIN__ = {}')
}

describe('bundled browser extensions', () => {
  beforeEach(() => {
    userDataDir = mkdtempSync(path.join(tmpdir(), 'muster-ud-'))
    resourcesDir = mkdtempSync(path.join(tmpdir(), 'muster-res-'))
    seedBundledSource()
  })
  afterEach(() => {
    rmSync(userDataDir, { recursive: true, force: true })
    rmSync(resourcesDir, { recursive: true, force: true })
  })

  it('copies the shipped extension into userData so Electron can load it unpacked', () => {
    const result = installBundledExtension('wordpress-login-autofill')

    expect(result.ok).toBe(true)
    expect(isBundledExtensionInstalled('wordpress-login-autofill')).toBe(true)
    const installDir = getInstalledBundledExtensionDir('wordpress-login-autofill')
    expect(existsSync(path.join(installDir, 'manifest.json'))).toBe(true)
    expect(existsSync(path.join(installDir, 'content.js'))).toBe(true)
  })

  it('rejects an unknown bundled id', () => {
    expect(installBundledExtension('not-a-thing')).toEqual({
      ok: false,
      message: 'Unknown bundled extension: not-a-thing'
    })
  })

  it('writes credentials the content script can read', () => {
    installBundledExtension('wordpress-login-autofill')

    expect(writeWordPressLoginConfig({ username: 'admin', password: 'pw', autoLogin: true })).toBe(
      true
    )

    const config = readFileSync(
      path.join(getInstalledBundledExtensionDir('wordpress-login-autofill'), 'config.js'),
      'utf8'
    )
    expect(config).toContain('__MUSTER_WP_LOGIN__')
    expect(config).toContain('"username":"admin"')
    expect(config).toContain('"autoLogin":true')
  })

  it('escapes a password that would otherwise break out of the literal', () => {
    installBundledExtension('wordpress-login-autofill')
    writeWordPressLoginConfig({
      username: 'admin',
      password: 'quote"newline\n};alert(1)//',
      autoLogin: false
    })

    const configPath = path.join(
      getInstalledBundledExtensionDir('wordpress-login-autofill'),
      'config.js'
    )
    const config = readFileSync(configPath, 'utf8')
    // The payload must survive as data, never as syntax.
    expect(config).not.toContain('alert(1)//\n')
    const parsed = JSON.parse(config.slice(config.indexOf('{'), config.lastIndexOf('}') + 1))
    expect(parsed.password).toBe('quote"newline\n};alert(1)//')
  })

  it('refuses to write config for an extension that is not installed', () => {
    expect(writeWordPressLoginConfig({ username: 'admin', password: 'pw', autoLogin: false })).toBe(
      false
    )
  })

  it('replaces the installed copy instead of merging stale files', () => {
    installBundledExtension('wordpress-login-autofill')
    const installDir = getInstalledBundledExtensionDir('wordpress-login-autofill')
    writeFileSync(path.join(installDir, 'stale.js'), '// left over from an older version')

    installBundledExtension('wordpress-login-autofill')

    expect(existsSync(path.join(installDir, 'stale.js'))).toBe(false)
  })

  it('removes the installed copy on uninstall', () => {
    installBundledExtension('wordpress-login-autofill')

    expect(uninstallBundledExtension('wordpress-login-autofill')).toBe(true)
    expect(isBundledExtensionInstalled('wordpress-login-autofill')).toBe(false)
  })
})
