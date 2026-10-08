// @vitest-environment happy-dom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { CommitArea } from './SourceControl'
import {
  resolveCommitAreaPrimaryAction,
  type PrimaryActionInputs
} from './source-control-primary-action'
import { resolveDropdownItems, type DropdownActionKind } from './source-control-dropdown-items'
import {
  clearCommitMessageFocusRequest,
  requestCommitMessageFocus
} from './source-control-commit-message-focus'
import { resolveCommitMessagePlaceholder } from './source-control-commit-message-placeholder'

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>
}))

afterEach(() => {
  cleanup()
  clearCommitMessageFocusRequest()
  vi.unstubAllGlobals()
})

function setUserAgent(userAgent: string): void {
  vi.stubGlobal('navigator', { ...navigator, userAgent })
}

function props(): Parameters<typeof CommitArea>[0] {
  const inputs: PrimaryActionInputs = {
    stagedCount: 1,
    hasUnstagedChanges: false,
    hasStageableChanges: false,
    hasPartiallyStagedChanges: false,
    hasMessage: false,
    hasUnresolvedConflicts: false,
    isCommitting: false,
    isRemoteOperationActive: false,
    upstreamStatus: { hasUpstream: true, ahead: 0, behind: 0 }
  }
  return {
    worktreeId: 'wt-1',
    groupId: 'group-1',
    branchName: 'feature/login',
    commitMessage: '',
    commitError: null,
    commitFailureRecoveryPrompt: null,
    pushRecovery: null,
    remoteActionError: null,
    isCommitting: false,
    isFixingCommitFailureWithAI: false,
    isFixingPushFailureWithAI: false,
    sourceControlAiActionsVisible: false,
    aiAgentConfigured: false,
    isGenerating: false,
    generateError: null,
    stagedCount: 1,
    hasPartiallyStagedChanges: false,
    hasUnresolvedConflicts: false,
    isRemoteOperationActive: false,
    inFlightRemoteOpKind: null,
    primaryAction: resolveCommitAreaPrimaryAction(inputs),
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

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

describe('commit message placeholder', () => {
  it('names the Mac shortcut and branch', () => {
    setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)')
    expect(resolveCommitMessagePlaceholder('main')).toBe('Message (⌘ Enter to commit on main)')
  })

  it('names the Ctrl shortcut on Windows and Linux', () => {
    setUserAgent('Mozilla/5.0 (X11; Linux x86_64)')
    expect(resolveCommitMessagePlaceholder('main')).toBe('Message (Ctrl+Enter to commit on main)')
  })

  it('falls back to Message without a branch', () => {
    expect(resolveCommitMessagePlaceholder('')).toBe('Message')
    expect(resolveCommitMessagePlaceholder(null)).toBe('Message')
  })

  it('renders on the commit textarea', () => {
    setUserAgent('Mozilla/5.0 (X11; Linux x86_64)')
    const { getByRole } = render(<CommitArea {...props()} />)
    expect(getByRole('textbox').getAttribute('placeholder')).toBe(
      'Message (Ctrl+Enter to commit on feature/login)'
    )
  })
})

describe('commit message focus request', () => {
  it('focuses the textarea when the shortcut requested it', async () => {
    requestCommitMessageFocus()
    const { getByRole } = render(<CommitArea {...props()} />)
    await nextFrame()
    expect(document.activeElement).toBe(getByRole('textbox'))
  })

  it('does not steal focus on a plain mount', async () => {
    const { getByRole } = render(<CommitArea {...props()} />)
    await nextFrame()
    expect(document.activeElement).not.toBe(getByRole('textbox'))
  })

  it('consumes the request so a later remount does not refocus', async () => {
    requestCommitMessageFocus()
    const first = render(<CommitArea {...props()} />)
    await nextFrame()
    first.unmount()
    ;(document.activeElement as HTMLElement | null)?.blur()
    const { getByRole } = render(<CommitArea {...props()} />)
    await nextFrame()
    expect(document.activeElement).not.toBe(getByRole('textbox'))
  })
})
