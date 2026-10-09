// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { fireEvent, render } from '@testing-library/react'
import { OperationBanner } from './source-control-operation-banner'

function buttonContaining(markup: string, label: string): string {
  const buttons = markup.match(/<button\b[\s\S]*?<\/button>/g) ?? []
  const button = buttons.find((candidate) => candidate.includes(label))
  if (!button) {
    throw new Error(`button not found: ${label}`)
  }
  return button
}

describe('OperationBanner', () => {
  it('shows the abort action for each in-progress operation', () => {
    const merge = renderToStaticMarkup(
      <OperationBanner conflictOperation="merge" onAbortOperation={vi.fn()} />
    )
    const rebase = renderToStaticMarkup(
      <OperationBanner conflictOperation="rebase" onAbortOperation={vi.fn()} />
    )
    const cherryPick = renderToStaticMarkup(
      <OperationBanner conflictOperation="cherry-pick" onAbortOperation={vi.fn()} />
    )

    expect(merge).toContain('Abort merge')
    expect(rebase).toContain('Abort rebase')
    expect(cherryPick).toContain('Abort cherry-pick')
  })

  it('renders abort actions with the quiet outline button treatment', () => {
    const merge = renderToStaticMarkup(
      <OperationBanner conflictOperation="merge" onAbortOperation={vi.fn()} />
    )
    expect(buttonContaining(merge, 'Abort merge')).toContain('data-variant="outline"')
  })

  it('offers Continue for rebase and cherry-pick but not merge', () => {
    const props = { onAbortOperation: vi.fn(), onSequencerAction: vi.fn() }
    const merge = renderToStaticMarkup(<OperationBanner conflictOperation="merge" {...props} />)
    const rebase = renderToStaticMarkup(<OperationBanner conflictOperation="rebase" {...props} />)
    const cherryPick = renderToStaticMarkup(
      <OperationBanner conflictOperation="cherry-pick" {...props} />
    )

    expect(merge).not.toContain('Continue')
    expect(merge).toContain('Commit to finish the merge')
    expect(rebase).toContain('Continue Rebase')
    expect(rebase).toContain('More rebase actions')
    expect(cherryPick).toContain('Continue')
    expect(cherryPick).not.toContain('More rebase actions')
  })

  it('runs the matching continue action', () => {
    const onSequencerAction = vi.fn()
    const { getByText, unmount } = render(
      <OperationBanner conflictOperation="rebase" onSequencerAction={onSequencerAction} />
    )
    fireEvent.click(getByText('Continue Rebase'))
    expect(onSequencerAction).toHaveBeenCalledWith('rebase-continue')
    unmount()

    const cherryPick = render(
      <OperationBanner conflictOperation="cherry-pick" onSequencerAction={onSequencerAction} />
    )
    fireEvent.click(cherryPick.getByText('Continue'))
    expect(onSequencerAction).toHaveBeenLastCalledWith('cherry-pick-continue')
  })

  it('disables every action while an operation is running', () => {
    const markup = renderToStaticMarkup(
      <OperationBanner
        conflictOperation="rebase"
        isAbortingOperation
        onAbortOperation={vi.fn()}
        onSequencerAction={vi.fn()}
      />
    )
    expect(buttonContaining(markup, 'Continue Rebase')).toContain('disabled')
    expect(buttonContaining(markup, 'Abort rebase')).toContain('disabled')
  })
})
