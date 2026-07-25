import { describe, expect, it } from 'vitest'

import { createEmptySiteEnvironment } from '../../shared/site-types'
import type { SiteEnvironment } from '../../shared/site-types'
import type { RemoteLayout, SiteRunConfig } from './pipeline-contract'
import { resolveThemeDeployPaths } from './theme-build'

// Ruled divergence from ocsites: server.py hardcoded `wp-content` AND the SSH root for the remote
// theme path, so a Bedrock deploy uploaded the theme to a directory WordPress never reads. Both
// halves now come from the resolved layout — canonical Bedrock serves from `<root>/web`, so
// honouring contentDir without webroot would still write to a directory that does not exist.

const THEME = 'acme-theme'

const STANDARD: RemoteLayout = { webroot: 'public_html', contentDir: 'wp-content' }
/** Bedrock with the docroot at the project root (`root/wp` + `root/app`). */
const BEDROCK_AT_ROOT: RemoteLayout = { webroot: 'public_html', contentDir: 'app' }
/** Canonical Bedrock: everything under `web/`. */
const BEDROCK_UNDER_WEB: RemoteLayout = { webroot: 'public_html/web', contentDir: 'app' }

function config(environment: Partial<SiteEnvironment> = {}): SiteRunConfig {
  const resolved: SiteEnvironment = {
    ...createEmptySiteEnvironment(),
    rootPath: 'public_html',
    ...environment
  }
  return {
    site: {
      id: 'site-1',
      path: '/Sites/acme',
      repoId: null,
      displayName: 'acme',
      localWpRoot: '',
      localDomain: 'acme.local',
      localStack: 'plain',
      dbUser: 'root',
      dbSocket: '',
      dbPort: null,
      phpVersion: '',
      activeEnvironment: 'production',
      environments: { production: resolved },
      notes: '',
      searchReplaceTimeoutSeconds: 600
    },
    environmentName: 'production',
    environment: resolved,
    group: 'deploy',
    wpDir: '/Sites/acme',
    sshPassword: '',
    dbPassword: ''
  }
}

describe('resolveThemeDeployPaths remote layout', () => {
  it('uses wp-content under the webroot for a standard WordPress layout', () => {
    expect(resolveThemeDeployPaths(config(), THEME, STANDARD).remoteDistParent).toBe(
      `public_html/wp-content/themes/${THEME}/assets`
    )
  })

  it('uses the Bedrock content directory when the docroot is the project root', () => {
    expect(resolveThemeDeployPaths(config(), THEME, BEDROCK_AT_ROOT).remoteDistParent).toBe(
      `public_html/app/themes/${THEME}/assets`
    )
  })

  it('uses the webroot as well, so canonical Bedrock lands under web/app', () => {
    expect(resolveThemeDeployPaths(config(), THEME, BEDROCK_UNDER_WEB).remoteDistParent).toBe(
      `public_html/web/app/themes/${THEME}/assets`
    )
  })

  it('keeps the local build path on the standard tree even for Bedrock', () => {
    expect(resolveThemeDeployPaths(config(), THEME, BEDROCK_UNDER_WEB).localDistPath).toBe(
      `/Sites/acme/wp-content/themes/${THEME}/assets/dist`
    )
  })

  it('remaps a relative wp-content override onto the Bedrock webroot and content directory', () => {
    const paths = resolveThemeDeployPaths(
      config({ themeDistPath: 'wp-content/themes/<theme>/dist' }),
      THEME,
      BEDROCK_UNDER_WEB
    )

    expect(paths.remoteDistParent).toBe(`public_html/web/app/themes/${THEME}`)
    expect(paths.distBasename).toBe('dist')
    expect(paths.localDistPath).toBe(`/Sites/acme/wp-content/themes/${THEME}/dist`)
  })

  it('mirrors a relative override that is already outside wp-content under the webroot', () => {
    expect(
      resolveThemeDeployPaths(config({ themeDistPath: 'custom/build' }), THEME, BEDROCK_UNDER_WEB)
        .remoteDistParent
    ).toBe('public_html/web/custom')
  })

  it('falls back to the default remote layout for an absolute override', () => {
    const paths = resolveThemeDeployPaths(
      config({ themeDistPath: '/tmp/prebuilt/dist' }),
      THEME,
      BEDROCK_UNDER_WEB
    )

    expect(paths.localDistPath).toBe('/tmp/prebuilt/dist')
    expect(paths.remoteDistParent).toBe(`public_html/web/app/themes/${THEME}/assets`)
  })

  it('leaves a standard site unchanged whichever branch it takes', () => {
    expect(
      resolveThemeDeployPaths(config({ themeDistPath: 'assets/build' }), THEME, STANDARD)
        .remoteDistParent
    ).toBe('public_html/assets')
  })
})
