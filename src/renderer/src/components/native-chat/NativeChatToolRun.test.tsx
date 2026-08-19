// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { NativeChatBlock } from '../../../../shared/native-chat-types'
import { NativeChatToolRun } from './NativeChatToolRun'

afterEach(cleanup)

const call = (name: string, i: number): NativeChatBlock =>
  ({ type: 'tool-call', name, input: { file_path: `/tmp/${i}` } }) as NativeChatBlock

const result = (output = 'ok'): NativeChatBlock =>
  ({ type: 'tool-result', output }) as NativeChatBlock

describe('NativeChatToolRun deck', () => {
  it('collapsed run renders a cascading deck: front card + capped peeks', () => {
    render(
      <NativeChatToolRun
        blocks={[call('Read', 0), call('Grep', 1), call('Edit', 2), call('Bash', 3)]}
        expandSignal={false}
      />
    )
    const deck = screen.getByRole('button', { name: 'Show tool calls' })
    // Newest call fronts the deck with the total count, as a plain-English sentence.
    expect(deck).toHaveTextContent('Running a command')
    expect(deck).toHaveTextContent('×4')
    // 4 calls → front + 2 peeks mounted, the deepest hidden entirely.
    expect(deck.childElementCount).toBe(3)
    // Reserved height covers the front card plus both peek slivers.
    expect(deck.style.height).toBe(`${30 + 2 * 7}px`)
  })

  it('single call renders one card, no count badge', () => {
    render(<NativeChatToolRun blocks={[call('Read', 0)]} expandSignal={false} />)
    const deck = screen.getByRole('button', { name: 'Show tool calls' })
    expect(deck.childElementCount).toBe(1)
    expect(deck).not.toHaveTextContent('×1')
    expect(deck.style.height).toBe('30px')
  })

  it('clicking the deck expands to the detailed list', () => {
    render(<NativeChatToolRun blocks={[call('Read', 0), call('Edit', 1)]} expandSignal={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Show tool calls' }))
    // Deck gone; the pill header + per-call lines take over.
    expect(screen.queryByRole('button', { name: 'Show tool calls' })).toBeNull()
    expect(screen.getByText('2 tool calls')).toBeInTheDocument()
  })
})

describe('NativeChatToolRun call progress', () => {
  it('spins the front card while the newest call is unanswered', () => {
    render(<NativeChatToolRun blocks={[call('Read', 0)]} expandSignal={false} live />)
    expect(screen.getByLabelText('Running')).toBeInTheDocument()
  })

  it('stops spinning once the result pairs with the call', () => {
    render(
      <NativeChatToolRun blocks={[call('Read', 0), result()]} expandSignal={false} live />
    )
    expect(screen.queryByLabelText('Running')).toBeNull()
  })

  it('pairs FIFO, so an earlier answered call does not settle a later one', () => {
    // One result for two calls: the second is the one still out.
    render(
      <NativeChatToolRun
        blocks={[call('Read', 0), result(), call('Edit', 1)]}
        expandSignal={false}
        live
      />
    )
    expect(screen.getByLabelText('Running')).toBeInTheDocument()
  })

  it('never spins in a settled turn, where a missing result means interrupted', () => {
    render(<NativeChatToolRun blocks={[call('Read', 0)]} expandSignal={false} />)
    expect(screen.queryByLabelText('Running')).toBeNull()
  })

  it('spins the expanded pill while any of its calls is out', () => {
    render(
      <NativeChatToolRun blocks={[call('Read', 0), call('Edit', 1)]} expandSignal live />
    )
    expect(screen.getByText('2 tool calls')).toBeInTheDocument()
    expect(screen.getByLabelText('Running')).toBeInTheDocument()
  })
})
