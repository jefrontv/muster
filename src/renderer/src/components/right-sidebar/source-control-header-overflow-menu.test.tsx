import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SourceControlHeaderOverflowMenu } from './source-control-header-overflow-menu'
import type { SourceControlStashMenu } from './use-source-control-stash-actions'

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: () => null
}))

// Why: render the menu content inline so row markup is inspectable without a pointer-driven open.
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuItem: ({ children, disabled }: { children: React.ReactNode; disabled?: boolean }) => (
    <div data-testid="menu-item" data-disabled={disabled ? 'true' : 'false'}>
      {children}
    </div>
  )
}))

function renderMenu(stashMenu: SourceControlStashMenu | null): string {
  return renderToStaticMarkup(
    <SourceControlHeaderOverflowMenu
      sourceControlViewMode="list"
      viewModeToggleDisabled={false}
      onToggleViewMode={vi.fn()}
      onChangeBaseRef={vi.fn()}
      onRefreshBranchCompare={vi.fn()}
      branchCompareRefreshDisabled={false}
      diffCommentCount={0}
      onExpandNotes={vi.fn()}
      stashMenu={stashMenu}
    />
  )
}

function itemDisabled(markup: string, label: string): string | undefined {
  const items = markup.match(/<div data-testid="menu-item"[^>]*>[\s\S]*?<\/div>/g) ?? []
  return items.find((item) => item.includes(label))?.match(/data-disabled="(\w+)"/)?.[1]
}

const stashMenu: SourceControlStashMenu = {
  canStash: true,
  branchStash: { branch: 'main', stash: { ref: 'stash@{1}', subject: 'WIP on main: abc123 base' } },
  disabled: false,
  onMenuOpen: vi.fn(),
  onStash: vi.fn(),
  onPop: vi.fn()
}

describe('SourceControlHeaderOverflowMenu stash items', () => {
  it('offers Stash Changes and Pop Latest Stash', () => {
    const markup = renderMenu(stashMenu)
    expect(itemDisabled(markup, 'Stash Changes')).toBe('false')
    expect(itemDisabled(markup, 'Pop Latest Stash')).toBe('false')
  })

  it('disables Pop with a reason when the branch has no stash', () => {
    const markup = renderMenu({ ...stashMenu, branchStash: { branch: 'main', stash: null } })
    expect(itemDisabled(markup, 'Pop Latest Stash')).toBe('true')
    expect(markup).toContain('No stash for main')
  })

  it('disables Pop on a detached HEAD and while the lookup is loading', () => {
    const detached = renderMenu({ ...stashMenu, branchStash: { branch: null, stash: null } })
    expect(itemDisabled(detached, 'Pop Latest Stash')).toBe('true')
    expect(detached).toContain('Detached HEAD')
    expect(
      itemDisabled(renderMenu({ ...stashMenu, branchStash: undefined }), 'Pop Latest Stash')
    ).toBe('true')
  })

  it('disables Stash Changes on a clean tree', () => {
    expect(itemDisabled(renderMenu({ ...stashMenu, canStash: false }), 'Stash Changes')).toBe(
      'true'
    )
  })

  it('hides stash items for folder workspaces', () => {
    expect(renderMenu(null)).not.toContain('Stash')
  })
})
