import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SourceControlDropdownMenuEntries } from './source-control-dropdown-menu-entries'
import { resolveDropdownItems } from './source-control-dropdown-items'

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <span>{children}</span>
}))

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuSub: ({ children }: { children: React.ReactNode }) => (
    <section data-testid="submenu">{children}</section>
  ),
  DropdownMenuSubTrigger: ({ children }: { children: React.ReactNode }) => <h4>{children}</h4>,
  DropdownMenuSubContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuItem: ({ children, title }: { children: React.ReactNode; title?: string }) => (
    <div data-testid="menu-item" title={title}>
      {children}
    </div>
  )
}))

const entries = resolveDropdownItems({
  stagedCount: 1,
  hasUnstagedChanges: false,
  hasStageableChanges: false,
  hasPartiallyStagedChanges: false,
  hasMessage: true,
  hasUnresolvedConflicts: false,
  isCommitting: false,
  isRemoteOperationActive: false,
  upstreamStatus: { hasUpstream: true, upstreamName: 'origin/x', ahead: 1, behind: 0 },
  rebaseBaseRef: 'origin/main'
})

describe('SourceControlDropdownMenuEntries', () => {
  it('renders Fast-forward and Rebase inside the More submenu', () => {
    const markup = renderToStaticMarkup(
      <SourceControlDropdownMenuEntries entries={entries} isBusy={false} onAction={vi.fn()} />
    )
    const submenu = markup.match(/<section data-testid="submenu">[\s\S]*?<\/section>/)?.[0] ?? ''
    expect(submenu).toContain('<h4>More</h4>')
    expect(submenu).toContain('Fast-forward')
    expect(submenu).toContain('Rebase from origin/main')
    expect(submenu).not.toContain('Fetch')
  })

  it('uses native titles in title mode for the review composer', () => {
    const markup = renderToStaticMarkup(
      <SourceControlDropdownMenuEntries
        entries={entries}
        isBusy={false}
        onAction={vi.fn()}
        reasonDisplay="title"
      />
    )
    expect(markup).toContain('title="Fetch from remote without merging"')
  })
})
