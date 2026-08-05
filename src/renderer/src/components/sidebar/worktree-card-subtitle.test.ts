import { describe, expect, it } from 'vitest'
import {
  dedupeWorktreeCardSubtitle,
  findSiteLocalDomainForWorkspacePath,
  getFolderWorkspaceSubtitle,
  pathLooksLikeAppPublicRoot
} from './worktree-card-subtitle'

function siteSummary(site: { path: string; localWpRoot?: string; localDomain?: string }): {
  site: { path: string; localWpRoot: string; localDomain: string }
} {
  return {
    site: {
      path: site.path,
      localWpRoot: site.localWpRoot ?? '',
      localDomain: site.localDomain ?? ''
    }
  }
}

describe('dedupeWorktreeCardSubtitle', () => {
  it('suppresses a subtitle that repeats the visible title', () => {
    expect(dedupeWorktreeCardSubtitle('fabbrica-v2', 'fabbrica-v2')).toBeNull()
    expect(dedupeWorktreeCardSubtitle('  fabbrica-v2 ', 'fabbrica-v2  ')).toBeNull()
  })

  it('keeps a subtitle that differs from the title', () => {
    expect(dedupeWorktreeCardSubtitle('feature/login', 'Fix login flow')).toBe('feature/login')
    expect(dedupeWorktreeCardSubtitle('/x/fabbrica-v2', 'fabbrica-v2')).toBe('/x/fabbrica-v2')
  })

  it('preserves original spacing when the subtitle is kept', () => {
    expect(dedupeWorktreeCardSubtitle(' /Users/x/projects/my-app ', 'Docs folder')).toBe(
      ' /Users/x/projects/my-app '
    )
  })

  it('suppresses empty and whitespace-only subtitles', () => {
    expect(dedupeWorktreeCardSubtitle('', 'title')).toBeNull()
    expect(dedupeWorktreeCardSubtitle('   ', 'title')).toBeNull()
    expect(dedupeWorktreeCardSubtitle(null, 'title')).toBeNull()
    expect(dedupeWorktreeCardSubtitle(undefined, 'title')).toBeNull()
  })
})

describe('pathLooksLikeAppPublicRoot', () => {
  it('detects LocalWP app/public roots on both path flavors', () => {
    expect(pathLooksLikeAppPublicRoot('/Users/me/Local Sites/acme/app/public')).toBe(true)
    expect(pathLooksLikeAppPublicRoot('C:\\Users\\me\\Local Sites\\acme\\app\\public')).toBe(true)
    expect(pathLooksLikeAppPublicRoot('/Users/me/Local Sites/acme/app/public/')).toBe(true)
  })

  it('rejects non-LocalWP folders named public', () => {
    expect(pathLooksLikeAppPublicRoot('/srv/public')).toBe(false)
    expect(pathLooksLikeAppPublicRoot('/srv/web/public')).toBe(false)
    expect(pathLooksLikeAppPublicRoot('/Users/me/Local Sites/acme')).toBe(false)
  })
})

describe('findSiteLocalDomainForWorkspacePath', () => {
  const acme = siteSummary({
    path: '/Users/me/Local Sites/acme',
    localWpRoot: 'app/public',
    localDomain: 'acme.local'
  })

  it('matches when the workspace is the site checkout itself', () => {
    expect(findSiteLocalDomainForWorkspacePath('/Users/me/Local Sites/acme', [acme])).toBe(
      'acme.local'
    )
  })

  it('matches when the workspace is the LocalWP WordPress root under the site', () => {
    expect(
      findSiteLocalDomainForWorkspacePath('/Users/me/Local Sites/acme/app/public', [acme])
    ).toBe('acme.local')
  })

  it('does not join localWpRoot when it is empty', () => {
    const bare = siteSummary({ path: '/srv/site', localDomain: 'bare.local' })
    expect(findSiteLocalDomainForWorkspacePath('/srv/site/app/public', [bare])).toBeNull()
    expect(findSiteLocalDomainForWorkspacePath('/srv/site', [bare])).toBe('bare.local')
  })

  it('returns null when no site matches or the matched domain is blank', () => {
    expect(
      findSiteLocalDomainForWorkspacePath('/Users/me/Local Sites/other/app/public', [acme])
    ).toBeNull()
    const blankDomain = siteSummary({ path: '/srv/site', localWpRoot: 'app/public' })
    expect(findSiteLocalDomainForWorkspacePath('/srv/site/app/public', [blankDomain])).toBeNull()
  })

  it('matches Windows site paths against normalized workspace paths', () => {
    const win = siteSummary({
      path: 'C:\\Users\\me\\Local Sites\\acme',
      localWpRoot: 'app/public',
      localDomain: 'acme.local'
    })
    expect(
      findSiteLocalDomainForWorkspacePath('C:\\Users\\me\\Local Sites\\acme\\app\\public', [win])
    ).toBe('acme.local')
  })
})

describe('getFolderWorkspaceSubtitle', () => {
  it('shows the folder basename when it differs from the title', () => {
    expect(
      getFolderWorkspaceSubtitle({
        workspacePath: '/Users/me/Sites/fabbrica-v2',
        visibleTitle: 'Fabbrica',
        siteLocalDomain: null
      })
    ).toBe('fabbrica-v2')
  })

  it('suppresses the basename when it repeats the title', () => {
    expect(
      getFolderWorkspaceSubtitle({
        workspacePath: '/Users/me/Sites/fabbrica-v2',
        visibleTitle: 'fabbrica-v2',
        siteLocalDomain: null
      })
    ).toBeNull()
  })

  it('shows the site local domain for a LocalWP app/public root', () => {
    expect(
      getFolderWorkspaceSubtitle({
        workspacePath: '/Users/me/Local Sites/acme/app/public',
        visibleTitle: 'acme',
        siteLocalDomain: 'acme.local'
      })
    ).toBe('acme.local')
  })

  it('shows nothing — never public — for an app/public root with no matched site', () => {
    expect(
      getFolderWorkspaceSubtitle({
        workspacePath: '/Users/me/Local Sites/acme/app/public',
        visibleTitle: 'acme',
        siteLocalDomain: null
      })
    ).toBeNull()
  })
})
