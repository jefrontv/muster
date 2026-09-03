import { describe, expect, it } from 'vitest'
import {
  bitbucketCloneUrlForReponame,
  deriveBindLocalDomain,
  extractSiteBindUrl,
  generateSiteBindUrl,
  isSiteBindUrl,
  parseSiteBindUrl
} from './site-bind-url'
import type { SiteBindFields } from '../../shared/site-bind-types'
import { defaultLocalDomain, repoSlug as bitbucketRepoSlug } from '../../shared/site-local-domain'

const MINIMUM = 'hostname=dedicated-11.example.com&username=acme'

function parseOk(url: string): { fields: SiteBindFields; password: string } {
  const parsed = parseSiteBindUrl(url)
  if (!parsed.ok) {
    throw new Error(`expected a parse, got: ${parsed.error}`)
  }
  return parsed
}

describe('parseSiteBindUrl scheme and action', () => {
  it('accepts muster://', () => {
    expect(parseOk(`muster://configure?${MINIMUM}`).fields.hostname).toBe(
      'dedicated-11.example.com'
    )
  })

  it('accepts musterdev://, the scheme a dev run claims, so links can be tested against dev', () => {
    expect(parseOk(`musterdev://configure?${MINIMUM}`).fields.hostname).toBe(
      'dedicated-11.example.com'
    )
    expect(isSiteBindUrl(`musterdev://configure?${MINIMUM}`)).toBe(true)
  })

  it('rejects ocsites:// and the ocsite typo so the installed ocsites app keeps its links', () => {
    for (const scheme of ['ocsites', 'ocsite']) {
      expect(parseSiteBindUrl(`${scheme}://configure?${MINIMUM}`)).toEqual({
        ok: false,
        error: 'The link does not use the muster:// scheme.'
      })
    }
  })

  it('accepts the scheme-only and no-slash link shapes', () => {
    expect(parseOk(`muster://?${MINIMUM}`).fields.username).toBe('acme')
    expect(parseOk(`muster:configure?${MINIMUM}`).fields.username).toBe('acme')
    expect(parseOk(`muster://configure/?${MINIMUM}`).fields.username).toBe('acme')
  })

  it('rejects an unknown scheme and an unknown action', () => {
    expect(parseSiteBindUrl(`https://configure?${MINIMUM}`)).toEqual({
      ok: false,
      error: 'The link does not use the muster:// scheme.'
    })
    expect(parseSiteBindUrl(`muster://deploy?${MINIMUM}`)).toEqual({
      ok: false,
      error: 'Unsupported bind action: configure is expected.'
    })
  })

  it('rejects a link with no parameters at all', () => {
    expect(parseSiteBindUrl('muster://configure')).toEqual({
      ok: false,
      error: 'The link carries no configuration parameters.'
    })
  })

  it('reports the missing required parameters by name', () => {
    expect(parseSiteBindUrl('muster://configure?reponame=efront_au/acme')).toEqual({
      ok: false,
      error: 'The link is missing required parameters: hostname, username.'
    })
    expect(parseSiteBindUrl('muster://configure?hostname=host.example.com')).toEqual({
      ok: false,
      error: 'The link is missing required parameters: username.'
    })
  })
})

describe('parseSiteBindUrl parameter aliases', () => {
  const cases: [string, string, string][] = [
    ['reponame', 'reponame=efront_au/acme', 'efront_au/acme'],
    ['reponame', 'repo=efront_au/acme', 'efront_au/acme'],
    ['rootPath', 'root_path=web', 'web'],
    ['rootPath', 'root-path=web', 'web'],
    ['rootPath', 'root=web', 'web'],
    ['environment', 'branch=staging', 'staging'],
    ['environment', 'env=staging', 'staging'],
    ['environment', 'environment=staging', 'staging'],
    ['deployCommand', 'deploy_command=npm run build', 'npm run build'],
    ['deployCommand', 'build-command=npm run build', 'npm run build'],
    ['themeDistPath', 'theme_dist_path=a/dist', 'a/dist'],
    ['themeDistPath', 'deploy-path=a/dist', 'a/dist'],
    ['themeDistPath', 'dist_path=a/dist', 'a/dist'],
    ['notes', 'notes=hello', 'hello'],
    ['notes', 'note=hello', 'hello']
  ]

  for (const [field, query, expected] of cases) {
    it(`reads ${field} from ${query.split('=')[0]}`, () => {
      const fields = parseOk(`muster://configure?${MINIMUM}&${query}`).fields
      expect(fields[field as 'reponame']).toBe(expected)
    })
  }

  it('reads hostname from host and username from user', () => {
    const fields = parseOk('muster://configure?host=h.example.com&user=bob').fields
    expect(fields).toMatchObject({ hostname: 'h.example.com', username: 'bob' })
  })

  it('reads the live domain from every alias and strips protocol and www', () => {
    for (const alias of ['live-domain', 'live_domain', 'live-url', 'live_url', 'live']) {
      const fields = parseOk(
        `muster://configure?${MINIMUM}&${alias}=${encodeURIComponent('https://www.acme.com/path')}`
      ).fields
      expect(fields.liveDomain).toBe('acme.com')
      expect(fields.liveDomainProtocol).toBe('https')
    }
  })

  it('keeps an http live domain on http', () => {
    const fields = parseOk(
      `muster://configure?${MINIMUM}&live-domain=${encodeURIComponent('http://acme.com')}`
    ).fields
    expect(fields.liveDomainProtocol).toBe('http')
  })

  it('matches alias keys case-insensitively and decodes + as a space', () => {
    const fields = parseOk(`muster://configure?HostName=h.example.com&USER=bob&notes=a+b`).fields
    expect(fields).toMatchObject({ hostname: 'h.example.com', username: 'bob', notes: 'a b' })
  })

  it('defaults an absent root path to public_html', () => {
    expect(parseOk(`muster://configure?${MINIMUM}`).fields.rootPath).toBe('public_html')
  })
})

describe('local domain derivation', () => {
  it('drops every label but the first, so acme.com.au becomes acme.local', () => {
    expect(defaultLocalDomain('acme.com.au')).toBe('acme.local')
    expect(defaultLocalDomain('acme')).toBe('acme.local')
    expect(defaultLocalDomain('ACME.local')).toBe('acme.local')
    expect(defaultLocalDomain('')).toBe('site.local')
  })

  it('derives acme.local from a live domain of acme.com.au', () => {
    const fields = parseOk(`muster://configure?${MINIMUM}&live-domain=acme.com.au`).fields
    expect(fields.localDomain).toBe('acme.local')
  })

  it('prefers the repo slug over the live domain', () => {
    expect(deriveBindLocalDomain('efront_au/tradeflex', 'acme.com.au')).toBe('tradeflex.local')
    expect(deriveBindLocalDomain('efront_au/melbournejazz.com.git', '')).toBe('melbournejazz.local')
    expect(deriveBindLocalDomain('', 'https://www.acme.com.au/x')).toBe('acme.local')
    expect(deriveBindLocalDomain('', '')).toBe('')
  })

  it('reduces a repo name to its slug', () => {
    expect(bitbucketRepoSlug('efront_au/Acme.git')).toBe('acme')
    expect(bitbucketRepoSlug('acme')).toBe('acme')
    expect(bitbucketRepoSlug('')).toBe('')
  })
})

describe('password handling', () => {
  it('reads the password from every alias but keeps it out of the fields record', () => {
    for (const alias of ['password', 'pass', 'ssh_password']) {
      const parsed = parseOk(`muster://configure?${MINIMUM}&${alias}=hunter2`)
      expect(parsed.password).toBe('hunter2')
      expect(JSON.stringify(parsed.fields)).not.toContain('hunter2')
    }
  })

  it('never echoes the password in a rejection message', () => {
    const bad = parseSiteBindUrl('muster://configure?password=hunter2&reponame=acme')
    expect(bad.ok).toBe(false)
    expect(bad.ok ? '' : bad.error).not.toContain('hunter2')

    const overlong = parseSiteBindUrl(`muster://configure?${MINIMUM}&password=${'x'.repeat(1_025)}`)
    expect(overlong).toEqual({ ok: false, error: 'password exceeds 1024 characters.' })

    const control = parseSiteBindUrl(
      `muster://configure?${MINIMUM}&password=${encodeURIComponent('bad\u0007secret')}`
    )
    expect(control.ok).toBe(false)
    expect(control.ok ? '' : control.error).toBe('password contains control characters.')
    expect(control.ok ? '' : control.error).not.toContain('secret')
  })
})

describe('bounded field guards', () => {
  it('rejects an overlong link, field, or invalid host and user', () => {
    expect(parseSiteBindUrl(`muster://configure?${MINIMUM}&notes=${'x'.repeat(9_000)}`)).toEqual({
      ok: false,
      error: 'The bind link exceeds 8192 characters.'
    })
    expect(parseSiteBindUrl(`muster://configure?${MINIMUM}&repo=${'x'.repeat(257)}`)).toEqual({
      ok: false,
      error: 'reponame exceeds 256 characters.'
    })
    expect(parseSiteBindUrl('muster://configure?hostname=bad host&username=acme')).toEqual({
      ok: false,
      error: 'hostname is not a valid host name.'
    })
    expect(parseSiteBindUrl('muster://configure?hostname=h.example.com&username=a;rm')).toEqual({
      ok: false,
      error: 'username contains characters that are not allowed.'
    })
    expect(
      parseSiteBindUrl(
        `muster://configure?${MINIMUM}&root=${encodeURIComponent('public_html\nrm -rf')}`
      )
    ).toEqual({ ok: false, error: 'rootPath contains control characters.' })
  })

  it('rejects a non-string and an empty input', () => {
    expect(parseSiteBindUrl(undefined)).toEqual({ ok: false, error: 'No bind link was supplied.' })
    expect(parseSiteBindUrl('   ')).toEqual({ ok: false, error: 'No bind link was supplied.' })
  })
})

// Why: `branch=staging` set up a staging ENVIRONMENT and then cloned the repository's default
// branch, because nothing in the link ever reached the clone. A link naming a branch means both.
describe('checkout branch', () => {
  it('takes the branch from the environment parameter', () => {
    const parsed = parseOk('muster://configure?hostname=h.example.com&username=u&branch=staging')
    expect(parsed.fields.environment).toBe('staging')
    expect(parsed.fields.checkoutBranch).toBe('staging')
  })

  it('accepts env= for the same thing', () => {
    const parsed = parseOk('muster://configure?hostname=h.example.com&username=u&env=staging')
    expect(parsed.fields.checkoutBranch).toBe('staging')
  })

  it('lets an explicit checkout override the environment name', () => {
    const parsed = parseOk(
      'muster://configure?hostname=h.example.com&username=u&env=staging&checkout=main'
    )
    expect(parsed.fields.environment).toBe('staging')
    expect(parsed.fields.checkoutBranch).toBe('main')
  })

  it('is empty when the link names no environment', () => {
    const parsed = parseOk('muster://configure?hostname=h.example.com&username=u')
    expect(parsed.fields.checkoutBranch).toBe('')
  })
})

describe('generateSiteBindUrl', () => {
  it('round-trips every field through parseSiteBindUrl', () => {
    const fields = {
      reponame: 'efront_au/acme',
      hostname: 'dedicated-11.example.com',
      username: 'acme',
      rootPath: 'public_html',
      liveDomain: 'acme.com.au',
      liveDomainProtocol: 'https' as const,
      localDomain: 'acme.local',
      environment: 'staging',
      checkoutBranch: 'staging',
      deployCommand: 'npm ci && npm run build:prod',
      themeDistPath: 'wp-content/themes/<theme>/assets/dist',
      notes: 'client hand-off'
    }
    const url = generateSiteBindUrl({ ...fields, password: 'hunter2' })
    expect(url.startsWith('muster://configure?')).toBe(true)

    const parsed = parseOk(url)
    expect(parsed.fields).toEqual(fields)
    expect(parsed.password).toBe('hunter2')
  })

  it('round-trips an http live domain and omits absent fields', () => {
    const url = generateSiteBindUrl({
      hostname: 'h.example.com',
      username: 'bob',
      liveDomain: 'acme.com',
      liveDomainProtocol: 'http'
    })
    expect(url).not.toContain('notes')
    const parsed = parseOk(url)
    expect(parsed.fields.liveDomainProtocol).toBe('http')
    expect(parsed.fields.notes).toBe('')
    expect(parsed.password).toBe('')
  })

  it('emits the canonical alias for each field', () => {
    const url = generateSiteBindUrl({ hostname: 'h.example.com', username: 'bob', rootPath: 'web' })
    expect(url).toContain('root_path=web')
    expect(url).not.toContain('root-path=')
  })
})

describe('link recognition', () => {
  it('recognises muster:// only, case-insensitively', () => {
    expect(isSiteBindUrl('muster://configure?a=1')).toBe(true)
    expect(isSiteBindUrl('MUSTER://configure?a=1')).toBe(true)
    // Why: an ocsites:// link must fall through to the user's installed ocsites app untouched.
    expect(isSiteBindUrl('OCSITES://configure?a=1')).toBe(false)
    expect(isSiteBindUrl('ocsites://configure?a=1')).toBe(false)
    expect(isSiteBindUrl('https://example.com')).toBe(false)
    expect(isSiteBindUrl('configure')).toBe(false)
  })

  it('pulls the last bind link out of a second-instance argv', () => {
    expect(
      extractSiteBindUrl(['/Applications/Muster.app', '--flag', 'muster://configure?a=1'])
    ).toBe('muster://configure?a=1')
    expect(extractSiteBindUrl(['/Applications/Muster.app'])).toBeNull()
  })
})

describe('clone URL derivation', () => {
  it('builds an SSH clone URL only for a workspace-qualified repo name', () => {
    expect(bitbucketCloneUrlForReponame('efront_au/acme')).toBe(
      'git@bitbucket.org:efront_au/acme.git'
    )
    expect(bitbucketCloneUrlForReponame('efront_au/acme.git')).toBe(
      'git@bitbucket.org:efront_au/acme.git'
    )
    expect(bitbucketCloneUrlForReponame('acme')).toBe('')
    expect(bitbucketCloneUrlForReponame('')).toBe('')
  })
})
