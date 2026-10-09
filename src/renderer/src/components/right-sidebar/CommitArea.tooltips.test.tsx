import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { CommitArea } from './SourceControl'
import { resolvePrimaryAction, type PrimaryActionInputs } from './source-control-primary-action'
import { resolveDropdownItems, type DropdownActionKind } from './source-control-dropdown-items'
import {
  resolveDropdownRowHint,
  shouldShowDropdownRowTooltip
} from './source-control-dropdown-row-hint'

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="tooltip">{children}</div>
  ),
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>
}))

// Why: render the menu content inline so row markup is inspectable without a pointer-driven open.
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="menu">{children}</div>
  ),
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuSub: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuSubTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuSubContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuItem: ({
    children,
    disabled,
    title
  }: {
    children: React.ReactNode
    disabled?: boolean
    title?: string
  }) => (
    <div data-testid="menu-item" data-disabled={disabled ? 'true' : undefined} title={title}>
      {children}
    </div>
  )
}))

function props(overrides: Partial<PrimaryActionInputs> = {}): Parameters<typeof CommitArea>[0] {
  const inputs: PrimaryActionInputs = {
    stagedCount: 1,
    hasUnstagedChanges: false,
    hasStageableChanges: false,
    hasPartiallyStagedChanges: false,
    hasMessage: false,
    hasUnresolvedConflicts: false,
    isCommitting: false,
    isRemoteOperationActive: false,
    upstreamStatus: { hasUpstream: false, ahead: 0, behind: 0 },
    ...overrides
  }
  return {
    worktreeId: 'wt-1',
    groupId: 'group-1',
    commitMessage: '',
    commitError: null,
    commitFailureRecoveryPrompt: null,
    pushRecovery: null,
    remoteActionError: null,
    isCommitting: inputs.isCommitting,
    isFixingCommitFailureWithAI: false,
    isFixingPushFailureWithAI: false,
    sourceControlAiActionsVisible: true,
    aiAgentConfigured: true,
    isGenerating: false,
    generateError: null,
    stagedCount: inputs.stagedCount,
    hasPartiallyStagedChanges: false,
    hasUnresolvedConflicts: false,
    isRemoteOperationActive: inputs.isRemoteOperationActive,
    inFlightRemoteOpKind: null,
    primaryAction: resolvePrimaryAction(inputs),
    dropdownItems: resolveDropdownItems(inputs),
    onCommitMessageChange: vi.fn(),
    onGenerate: vi.fn(),
    onCancelGenerate: vi.fn(),
    onFixCommitFailureWithAI: vi.fn(),
    onFixPushFailureWithAI: vi.fn(),
    onPrimaryAction: vi.fn(),
    onDropdownAction: vi.fn() as (kind: DropdownActionKind) => void
  }
}

function menuItems(markup: string): string[] {
  return markup.match(/<div data-testid="menu-item"[\s\S]*?<\/div>/g) ?? []
}

describe('CommitArea tooltips', () => {
  it('uses only the Radix tooltip on the primary, chevron, and dropdown rows', () => {
    const markup = renderToStaticMarkup(<CommitArea {...props()} />)
    const buttons = markup.match(/<button\b[^>]*>/g) ?? []
    expect(buttons.length).toBeGreaterThan(0)
    for (const button of buttons) {
      expect(button).not.toContain('title=')
    }
    for (const item of menuItems(markup)) {
      expect(item).not.toContain('title=')
    }
  })

  it('labels the Generate fallback tooltip in plain words', () => {
    const markup = renderToStaticMarkup(<CommitArea {...props()} />)
    expect(markup).toContain('Generate commit message')
    expect(markup).not.toContain('ai commit msg')
  })

  it('points to settings with the house separator', () => {
    const markup = renderToStaticMarkup(<CommitArea {...props()} aiAgentConfigured={false} />)
    expect(markup).toContain('Pick an agent in Settings &gt; Git &gt; Source Control AI.')
  })

  it('shows disabled reasons inline on dropdown rows', () => {
    const markup = renderToStaticMarkup(<CommitArea {...props()} />)
    const syncRow = menuItems(markup).find((item) => item.includes('Commit &amp; Sync'))
    expect(syncRow).toBeDefined()
    expect(syncRow).toContain('data-disabled="true"')
    expect(syncRow).toContain('Publish the branch first to sync commits')
  })
})

describe('resolveDropdownRowHint', () => {
  const disabledRow = { disabled: true, title: 'Publish the branch first', hint: undefined }

  it('falls back to the disabled reason', () => {
    expect(resolveDropdownRowHint(disabledRow, false)).toBe('Publish the branch first')
  })

  it('keeps an explicit hint', () => {
    expect(resolveDropdownRowHint({ ...disabledRow, hint: 'Push first' }, false)).toBe('Push first')
  })

  it('stays quiet for enabled rows and while an operation runs', () => {
    expect(resolveDropdownRowHint({ ...disabledRow, disabled: false }, false)).toBeUndefined()
    expect(resolveDropdownRowHint(disabledRow, true)).toBeUndefined()
  })

  it('skips the tooltip when it would repeat the inline hint', () => {
    expect(shouldShowDropdownRowTooltip(disabledRow, 'Publish the branch first')).toBe(false)
    expect(shouldShowDropdownRowTooltip(disabledRow, 'Push first')).toBe(true)
  })
})
