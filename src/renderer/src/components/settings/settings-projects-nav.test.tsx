import { renderToStaticMarkup } from 'react-dom/server'
import { Folder } from 'lucide-react'
import { describe, expect, it } from 'vitest'
import { SettingsProjectsNav } from './settings-projects-nav'
import type { RepoNavSection } from './settings-projects-nav'

const sections: RepoNavSection[] = Array.from({ length: 12 }, (_, index) => ({
  id: `repo-${index}`,
  title: `Project ${index}`,
  icon: Folder
}))

function render(activeSectionId: string, searchQuery = ''): string {
  return renderToStaticMarkup(
    <SettingsProjectsNav
      activeSectionId={activeSectionId}
      repoSections={sections}
      hasRepos
      searchQuery={searchQuery}
      navItemClassName={() => 'row'}
      onSelectSection={() => {}}
    />
  )
}

describe('SettingsProjectsNav', () => {
  it('collapses to a counted header by default', () => {
    const html = render('general')
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('>12<')
    expect(html).not.toContain('Project 0')
  })

  it('opens with a filter when a project is active', () => {
    const html = render('repo-3')
    expect(html).toContain('aria-expanded="true"')
    expect(html).toContain('Project 3')
    expect(html).toContain('Filter projects')
  })

  it('shows every match while settings search is active, without its own filter', () => {
    const html = render('general', 'proj')
    expect(html).toContain('Project 0')
    expect(html).not.toContain('Filter projects')
  })

  it('previews the first projects plus the active one behind Show all', () => {
    const many = Array.from({ length: 20 }, (_, index) => ({
      id: `repo-${index}`,
      title: `Project ${index}`,
      icon: Folder
    }))
    const html = renderToStaticMarkup(
      <SettingsProjectsNav
        activeSectionId="repo-17"
        repoSections={many}
        hasRepos
        searchQuery=""
        navItemClassName={() => 'row'}
        onSelectSection={() => {}}
      />
    )
    expect(html).toContain('Project 11<')
    expect(html).not.toContain('Project 12<')
    expect(html).toContain('Project 17<')
    expect(html).toContain('Show all 20')
  })

  it('previews projects by name, not store order, and keeps the active one', () => {
    const titles = [
      'zeta',
      'yak',
      'xray',
      'wolf',
      'vole',
      'urchin',
      'tern',
      'stoat',
      'robin',
      'quail',
      'puffin',
      'owl',
      'newt',
      'aidc',
      'mole'
    ]
    const shuffled = titles.map((title, index) => ({
      id: `repo-${index}`,
      title,
      icon: Folder
    }))
    const renderWith = (activeSectionId: string): string =>
      renderToStaticMarkup(
        <SettingsProjectsNav
          activeSectionId={activeSectionId}
          repoSections={shuffled}
          hasRepos
          searchQuery=""
          navItemClassName={() => 'row'}
          onSelectSection={() => {}}
        />
      )

    const html = renderWith('repo-13')
    expect(html).toContain('aidc<')
    expect(html.indexOf('aidc<')).toBeLessThan(html.indexOf('mole<'))
    expect(html).not.toContain('zeta<')
    // Past the first 12 by name, the active project still shows.
    expect(renderWith('repo-0')).toContain('zeta<')
  })
})
