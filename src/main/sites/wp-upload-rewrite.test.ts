import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createEmptySiteEnvironment, type Site } from '../../shared/site-types'
import type { SiteRunConfig, SiteRunContext } from './pipeline-contract'
import { SiteRunCancelledError } from './pipeline-contract'
import {
  applyWpUploadRewrite,
  buildUploadRewriteBlock,
  cleanUpLocalHtaccess,
  stripExternalRedirects,
  UPLOAD_REWRITE_BEGIN,
  UPLOAD_REWRITE_END
} from './wp-upload-rewrite'

type TestContext = { context: SiteRunContext; statuses: string[]; logs: string[] }

function createTestContext(): TestContext {
  const controller = new AbortController()
  const statuses: string[] = []
  const logs: string[] = []
  return {
    statuses,
    logs,
    context: {
      signal: controller.signal,
      log: (line) => logs.push(line),
      status: (stage) => statuses.push(stage),
      progress: () => {},
      throwIfCancelled: () => {
        if (controller.signal.aborted) {
          throw new SiteRunCancelledError()
        }
      }
    }
  }
}

let wpDir: string

beforeEach(() => {
  wpDir = mkdtempSync(path.join(tmpdir(), 'muster-htaccess-'))
})

afterEach(() => {
  rmSync(wpDir, { recursive: true, force: true })
})

function createConfig(
  overrides: { localDomain?: string; liveDomain?: string } = {}
): SiteRunConfig {
  const environment = {
    ...createEmptySiteEnvironment(),
    liveDomain: overrides.liveDomain ?? 'acme.com.au',
    liveDomainProtocol: 'https' as const
  }
  const site: Site = {
    id: 'site-1',
    path: wpDir,
    repoId: null,
    displayName: 'Acme',
    localWpRoot: '',
    localDomain: overrides.localDomain ?? 'acme.local',
    localStack: 'plain',
    dbUser: 'root',
    dbSocket: '',
    dbPort: null,
    phpVersion: '8.2',
    activeEnvironment: 'main',
    environments: { main: environment },
    notes: '',
    searchReplaceTimeoutSeconds: 0
  }
  return {
    site,
    environmentName: 'main',
    environment,
    group: 'import',
    wpDir,
    sshPassword: '',
    dbPassword: ''
  }
}

function htaccess(): string {
  return readFileSync(path.join(wpDir, '.htaccess'), 'utf8')
}

// A production .htaccess as imported verbatim: a force-SSL rule and a non-www rule that both
// hardcode the live domain, plus the WordPress front-controller block that must survive.
const PRODUCTION_HTACCESS = `# php -- BEGIN cPanel-generated handler, do not edit
# Set the "ea-php82" package as the default "PHP" programming language.
<IfModule mime_module>
  AddHandler application/x-httpd-ea-php82 .php .php8 .phtml
</IfModule>
# php -- END cPanel-generated handler, do not edit

<IfModule mod_rewrite.c>
RewriteEngine On
RewriteCond %{HTTPS} off
RewriteRule ^(.*)$ https://acme.com.au/$1 [R=301,L]
RewriteCond %{HTTP_HOST} ^www\\.acme\\.com\\.au$ [NC]
RewriteRule ^(.*)$ https://acme.com.au/$1 [R=301,L]
</IfModule>

# BEGIN WordPress
<IfModule mod_rewrite.c>
RewriteEngine On
RewriteBase /
RewriteRule ^index\\.php$ - [L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /index.php [L]
</IfModule>
# END WordPress
`

describe('stripExternalRedirects', () => {
  it('removes an off-site 301 together with the RewriteCond lines that guarded it', () => {
    const result = stripExternalRedirects(PRODUCTION_HTACCESS, 'acme.local')

    expect(result.removed).toBe(2)
    expect(result.content).not.toContain('https://acme.com.au/$1')
    // The conditions only qualified the removed rules, so they go too.
    expect(result.content).not.toContain('RewriteCond %{HTTPS} off')
    expect(result.content).not.toContain('^www\\.acme\\.com\\.au$')
    // The WordPress front controller is untouched — its targets are relative.
    expect(result.content).toContain('RewriteRule . /index.php [L]')
    expect(result.content).toContain('RewriteRule ^index\\.php$ - [L]')
    expect(result.content).toContain('RewriteCond %{REQUEST_FILENAME} !-f')
  })

  it('preserves the auto-generated upload block, which redirects off-site on purpose', () => {
    const block = buildUploadRewriteBlock('acme.local', 'acme.com.au', 'https')
    const content = `${block}\n\n${PRODUCTION_HTACCESS}`

    const result = stripExternalRedirects(content, 'acme.local')

    expect(result.content).toContain(UPLOAD_REWRITE_BEGIN)
    expect(result.content).toContain(UPLOAD_REWRITE_END)
    expect(result.content).toContain('RewriteRule ^(.*)$ https://acme.com.au/$1 [QSA,L]')
    expect(result.content).toContain('RewriteCond %{HTTP_HOST} ^acme\\.local$')
    // Only the two production rules outside the block were dropped.
    expect(result.removed).toBe(2)
  })

  it('keeps a rule that redirects back at the local site, with or without www', () => {
    const content = [
      'RewriteRule ^(.*)$ https://acme.local/$1 [R=301,L]',
      'RewriteRule ^(.*)$ https://www.acme.local/$1 [R=301,L]',
      'RewriteRule ^(.*)$ https://ACME.LOCAL/$1 [R=301,L]',
      'RewriteRule ^(.*)$ https://elsewhere.test/$1 [R=301,L]'
    ].join('\n')

    const result = stripExternalRedirects(content, 'Acme.Local')

    expect(result.removed).toBe(1)
    expect(result.content).toContain('https://acme.local/$1')
    expect(result.content).toContain('https://www.acme.local/$1')
    expect(result.content).toContain('https://ACME.LOCAL/$1')
    expect(result.content).not.toContain('elsewhere.test')
  })

  it('returns the original content untouched when nothing redirects off-site', () => {
    const content = '# BEGIN WordPress\nRewriteRule . /index.php [L]\n'
    const result = stripExternalRedirects(content, 'acme.local')

    expect(result.removed).toBe(0)
    expect(result.content).toBe(content)
  })

  it('strips every off-site rule when no local domain is configured', () => {
    const content = 'RewriteRule ^(.*)$ https://acme.com.au/$1 [R=301,L]\n'
    expect(stripExternalRedirects(content, '').removed).toBe(1)
    expect(stripExternalRedirects(content, '   ').removed).toBe(1)
  })

  it('collapses the blank-line runs a removal leaves behind and keeps the trailing newline', () => {
    const content = 'a\n\nRewriteRule ^(.*)$ http://live.test/$1 [L]\n\nb\n'
    const result = stripExternalRedirects(content, 'acme.local')

    expect(result.content).toBe('a\n\nb\n')
  })
})

describe('buildUploadRewriteBlock', () => {
  it('proxies only uploads that are missing locally, to the live protocol and domain', () => {
    const block = buildUploadRewriteBlock('acme.local', 'acme.com.au', 'http')

    expect(block.startsWith(UPLOAD_REWRITE_BEGIN)).toBe(true)
    expect(block.endsWith(UPLOAD_REWRITE_END)).toBe(true)
    expect(block).toContain('\tRewriteCond %{HTTP_HOST} ^acme\\.local$')
    expect(block).toContain('\tRewriteCond %{REQUEST_URI} ^/wp-content/uploads/[^\\/]*/.*$')
    // Without these two a locally-present file would be proxied to production as well.
    expect(block).toContain('\tRewriteCond %{REQUEST_FILENAME} !-f')
    expect(block).toContain('\tRewriteCond %{REQUEST_FILENAME} !-d')
    expect(block).toContain('\tRewriteRule ^(.*)$ http://acme.com.au/$1 [QSA,L]')
  })
})

describe('applyWpUploadRewrite', () => {
  it('prepends the block to an existing .htaccess', async () => {
    const { context, logs } = createTestContext()
    writeFileSync(path.join(wpDir, '.htaccess'), PRODUCTION_HTACCESS)

    await applyWpUploadRewrite(context, createConfig())

    const written = htaccess()
    expect(written.startsWith(UPLOAD_REWRITE_BEGIN)).toBe(true)
    expect(written).toContain('# BEGIN WordPress')
    expect(logs).toContain('WP Upload Rewrite Rule added successfully')
  })

  it('creates .htaccess when the import produced none', async () => {
    const { context } = createTestContext()

    await applyWpUploadRewrite(context, createConfig())

    expect(htaccess().trim()).toBe(buildUploadRewriteBlock('acme.local', 'acme.com.au', 'https'))
  })

  it('replaces its own previous block instead of stacking one per import', async () => {
    const { context } = createTestContext()

    await applyWpUploadRewrite(context, createConfig())
    await applyWpUploadRewrite(context, createConfig({ liveDomain: 'staging.acme.com.au' }))

    const written = htaccess()
    expect(written.split(UPLOAD_REWRITE_BEGIN)).toHaveLength(2)
    expect(written).toContain('https://staging.acme.com.au/$1')
    expect(written).not.toContain('https://acme.com.au/$1')
  })

  it('skips when either domain is unset, rather than writing a broken rule', async () => {
    const { context, statuses } = createTestContext()

    await applyWpUploadRewrite(context, createConfig({ localDomain: '' }))
    await applyWpUploadRewrite(context, createConfig({ liveDomain: '' }))

    expect(statuses).toEqual([
      'Skipping WP Upload Rewrite: Local or Live domain not specified',
      'Skipping WP Upload Rewrite: Local or Live domain not specified'
    ])
    expect(() => htaccess()).toThrow()
  })
})

describe('cleanUpLocalHtaccess', () => {
  it('drops the cPanel handler block and the production redirects', async () => {
    const { context, logs } = createTestContext()
    writeFileSync(path.join(wpDir, '.htaccess'), PRODUCTION_HTACCESS)

    await cleanUpLocalHtaccess(context, createConfig())

    const written = htaccess()
    expect(written).not.toContain('cPanel-generated handler')
    expect(written).not.toContain('https://acme.com.au/$1')
    expect(written).toContain('# BEGIN WordPress')
    expect(logs).toContain('Removed 2 production redirect rule(s) from .htaccess')
  })

  it('keeps the upload block written by the previous step', async () => {
    const { context } = createTestContext()
    const config = createConfig()

    await applyWpUploadRewrite(context, config)
    writeFileSync(path.join(wpDir, '.htaccess'), `${htaccess()}${PRODUCTION_HTACCESS}`)
    await cleanUpLocalHtaccess(context, config)

    const written = htaccess()
    expect(written).toContain(UPLOAD_REWRITE_BEGIN)
    expect(written).toContain('RewriteRule ^(.*)$ https://acme.com.au/$1 [QSA,L]')
    expect(written).not.toContain('[R=301,L]')
  })

  it('reports and returns when there is no .htaccess to clean', async () => {
    const { context, logs } = createTestContext()

    await cleanUpLocalHtaccess(context, createConfig())

    expect(logs).toContain('No .htaccess file found, skipping cleanup')
  })
})
