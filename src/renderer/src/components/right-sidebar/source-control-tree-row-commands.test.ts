// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest'
import { createSourceControlTreeRowCommands } from './source-control-tree-row-commands'
import type { SourceControlTreeRow } from './source-control-tree-rows'

function setup() {
  const deps = {
    toggleSection: vi.fn(),
    toggleTreeDir: vi.fn(),
    toggleSubmodule: vi.fn(),
    openDiff: vi.fn(),
    openCommittedDiff: vi.fn(),
    rowActions: { index: vi.fn(), discard: vi.fn() }
  }
  return { deps, commands: createSourceControlTreeRowCommands(deps) }
}

const section: SourceControlTreeRow = {
  kind: 'section',
  sectionId: 'staged',
  id: 'section::staged',
  level: 1,
  expanded: true,
  label: 'Staged Changes, 1 file'
}

function rowWithButton(action: string | null) {
  const element = document.createElement('div')
  const button = document.createElement('button')
  if (action) {
    button.setAttribute('data-source-control-row-action', action)
  }
  const onClick = vi.fn()
  button.addEventListener('click', onClick)
  element.append(button)
  return { element, onClick }
}

describe('createSourceControlTreeRowCommands', () => {
  it('toggles a section on Enter without pressing its header buttons', () => {
    const { deps, commands } = setup()
    const { element, onClick } = rowWithButton(null)

    commands.open(section, element)
    expect(deps.toggleSection).toHaveBeenCalledWith('staged')
    expect(onClick).not.toHaveBeenCalled()
  })

  it('opens a file diff on Enter', () => {
    const { deps, commands } = setup()
    const entry = { path: 'a.ts', status: 'modified', area: 'unstaged' } as const
    const row: SourceControlTreeRow = {
      kind: 'file',
      entry,
      id: 'unstaged::a.ts',
      level: 2,
      label: 'a.ts, modified, unstaged'
    }
    commands.open(row, document.createElement('div'))
    expect(deps.openDiff).toHaveBeenCalledWith(entry)
    expect(deps.toggleSection).not.toHaveBeenCalled()
  })

  it('presses the header bulk button for Space and nothing missing for Delete', () => {
    const { commands } = setup()
    const { element, onClick } = rowWithButton('unstage')

    commands.toggleIndex(section, element)
    commands.discard(section, element)
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
