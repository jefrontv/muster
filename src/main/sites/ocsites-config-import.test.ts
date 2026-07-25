import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getOcsitesConfigDirectory, importOcsitesConfig } from './ocsites-config-import'

// Fixtures generated with python `cryptography` in the exact shape ocsites writes:
// base64url(Fernet(key).encrypt(secret)) — Fernet's own base64url output wrapped a second time
// by ConfigManager.encrypt_password (ocsites deploy/config.py:138).
const KEY = '_4nw0cWpLvrSM6fbM4a0wnDOK5LgrqMbqwIwVvqI6oQ='
const WRAPPED_SSH_SECRET =
  'Z0FBQUFBQnFaSXlIeDJ5ZV9QeUl1ZUxmZzVvMHQ0RnhfREJ3S0gtTTY5dmJlRE11V0hDTXNIY2dDSnpHNFdLTU82ZnVHd3BFY1l0SEMyd0FIeElHV3ZaSEZMQXByTzhjOFE9PQ=='
const WRAPPED_DB_SECRET =
  'Z0FBQUFBQnFaSXlITEtBZEZSSG5kRnREdnpKX3RtZWZJamQyalBaMVQ3OVRlUU9tQWxfdm9GU3ljVnBHd285cW1RU05TU2FQcnhubDlxTW1PaXpWaHZSa1FrM21RMEpXU3c9PQ=='

let configDirectory: string

function writeConfig(files: Record<string, unknown | string>): void {
  for (const [name, value] of Object.entries(files)) {
    writeFileSync(
      path.join(configDirectory, name),
      typeof value === 'string' ? value : JSON.stringify(value)
    )
  }
}

function presetFile(overrides: Record<string, unknown> = {}): unknown {
  return {
    sites_directory: '',
    connection_presets: [
      {
        local_target_directory: '/Sites/acme',
        local_domain: 'acme.local',
        local_wp_root: '',
        db_user: 'root',
        db_password: WRAPPED_DB_SECRET,
        db_socket: '',
        active_environment: 'production',
        notes: '',
        environments: {
          production: {
            hostname: 'dedicated-11.example.com',
            username: 'acme',
            password: WRAPPED_SSH_SECRET,
            root_path: 'public_html',
            live_domain: 'acme.com',
            deploy_command: '',
            theme_dist_path: '',
            export_database: true,
            export_files: true,
            wp_search_replace: true,
            wp_upload_rewrite: false,
            git_pull_on_server: false,
            clear_server_cache: true,
            deploy_themes: true
          }
        },
        ...overrides
      }
    ]
  }
}

beforeEach(() => {
  configDirectory = mkdtempSync(path.join(tmpdir(), 'muster-ocsites-import-'))
})

afterEach(() => {
  rmSync(configDirectory, { recursive: true, force: true })
})

describe('getOcsitesConfigDirectory', () => {
  it('honours XDG_CONFIG_HOME', () => {
    expect(getOcsitesConfigDirectory({ XDG_CONFIG_HOME: '/xdg' })).toBe('/xdg/ocsites')
  })

  it('falls back to ~/.config/ocsites', () => {
    expect(getOcsitesConfigDirectory({})).toMatch(/[/\\]\.config[/\\]ocsites$/)
  })
})

describe('importOcsitesConfig', () => {
  it('reports not-found for a missing config directory without throwing', () => {
    const report = importOcsitesConfig(path.join(configDirectory, 'absent'))
    expect(report.found).toBe(false)
    expect(report.sites).toEqual([])
  })

  it('imports roots, bitbucket credentials, and favourites', () => {
    writeConfig({
      'config.json': {
        sites_roots: ['/Sites', '/Volumes/repos'],
        bitbucket_username: 'jake@example.com',
        bitbucket_api_key: 'ATBBxxxx',
        bitbucket_workspace: 'efront_au',
        favorites: ['acme']
      },
      'deploy_presets.json': presetFile(),
      'secret.key': KEY
    })
    const report = importOcsitesConfig(configDirectory)
    expect(report.global).toEqual({
      sitesRoots: ['/Sites', '/Volumes/repos'],
      bitbucketUsername: 'jake@example.com',
      bitbucketAppPassword: 'ATBBxxxx',
      bitbucketWorkspace: 'efront_au',
      favorites: ['acme']
    })
  })

  it('falls back to the legacy single sites_root key', () => {
    writeConfig({
      'config.json': { sites_root: '/OldSites' },
      'deploy_presets.json': presetFile(),
      'secret.key': KEY
    })
    expect(importOcsitesConfig(configDirectory).global?.sitesRoots).toEqual(['/OldSites'])
  })

  it('converts a preset into a path-keyed site with its environment toggles', () => {
    writeConfig({
      'config.json': {},
      'deploy_presets.json': presetFile(),
      'secret.key': KEY
    })
    const [imported] = importOcsitesConfig(configDirectory).sites
    expect(imported?.site.path).toBe('/Sites/acme')
    expect(imported?.site.repoId).toBeNull()
    expect(imported?.site.displayName).toBe('acme')
    expect(imported?.site.activeEnvironment).toBe('production')
    expect(imported?.site.environments.production).toMatchObject({
      hostname: 'dedicated-11.example.com',
      username: 'acme',
      rootPath: 'public_html',
      liveDomain: 'acme.com',
      liveDomainProtocol: 'https',
      exportDatabase: true,
      exportFiles: true,
      wpSearchReplace: true,
      wpUploadRewrite: false,
      gitPullOnServer: false,
      clearServerCache: true,
      deployThemes: true
    })
  })

  it('decrypts the double-base64-wrapped ssh and db passwords', () => {
    writeConfig({
      'config.json': {},
      'deploy_presets.json': presetFile(),
      'secret.key': KEY
    })
    const [imported] = importOcsitesConfig(configDirectory).sites
    expect(imported?.secrets).toEqual([
      { environment: 'production', kind: 'ssh', value: 'ssh-secret-1' },
      { environment: 'production', kind: 'db', value: 'db-secret-2' }
    ])
  })

  it('records a secret failure instead of aborting when secret.key is missing', () => {
    writeConfig({ 'config.json': {}, 'deploy_presets.json': presetFile() })
    const report = importOcsitesConfig(configDirectory)
    expect(report.sites).toHaveLength(1)
    expect(report.sites[0]?.secrets).toEqual([])
    expect(report.secretFailures).toHaveLength(2)
    expect(report.secretFailures[0]?.reason).toMatch(/secret\.key/)
  })

  it('splits a scheme-prefixed live domain into host and protocol', () => {
    writeConfig({
      'config.json': {},
      'deploy_presets.json': presetFile({
        environments: {
          production: { live_domain: 'http://legacy.example.com/', root_path: '' }
        }
      }),
      'secret.key': KEY
    })
    const environment = importOcsitesConfig(configDirectory).sites[0]?.site.environments.production
    expect(environment?.liveDomain).toBe('legacy.example.com')
    expect(environment?.liveDomainProtocol).toBe('http')
    expect(environment?.rootPath).toBe('public_html')
  })

  it('detects a LocalWP site from its socket and app/public root', () => {
    writeConfig({
      'config.json': {},
      'deploy_presets.json': presetFile({
        local_wp_root: 'app/public',
        db_socket: '/Users/x/Library/Application Support/Local/run/abc/mysql/mysqld.sock'
      }),
      'secret.key': KEY
    })
    expect(importOcsitesConfig(configDirectory).sites[0]?.site.localStack).toBe('localwp')
  })

  it('stores the site-wide db password against every environment', () => {
    writeConfig({
      'config.json': {},
      'deploy_presets.json': presetFile({
        environments: {
          production: { hostname: 'a.example.com' },
          staging: { hostname: 'b.example.com' }
        }
      }),
      'secret.key': KEY
    })
    const secrets = importOcsitesConfig(configDirectory).sites[0]?.secrets ?? []
    expect(
      secrets.filter((secret) => secret.kind === 'db').map((secret) => secret.environment)
    ).toEqual(['production', 'staging'])
  })

  it('skips a preset with no local path rather than creating an unaddressable site', () => {
    writeConfig({
      'config.json': {},
      'deploy_presets.json': { connection_presets: [{ local_target_directory: '  ' }] },
      'secret.key': KEY
    })
    const report = importOcsitesConfig(configDirectory)
    expect(report.sites).toEqual([])
    expect(report.skippedPresets).toBe(1)
  })

  it('survives malformed preset json without throwing', () => {
    writeConfig({ 'config.json': {}, 'deploy_presets.json': '{ not json', 'secret.key': KEY })
    const report = importOcsitesConfig(configDirectory)
    expect(report.found).toBe(true)
    expect(report.sites).toEqual([])
  })
})
