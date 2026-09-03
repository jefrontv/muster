import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

const terminalCss = fs.readFileSync(new URL('./terminal.css', import.meta.url), 'utf8')

// Anchored to line start so `.xterm-container` does not match the descendant
// selectors (e.g. `.pane[data-terminal-attention] .xterm-container`) that share it.
function readRuleBody(selector: string): string {
  const pattern = new RegExp(`^${selector.replace(/[.[\]{}()*+?^$|\\]/g, '\\$&')}`, 'm')
  const start = terminalCss.search(pattern)
  expect(start, `${selector} rule missing from terminal.css`).toBeGreaterThanOrEqual(0)
  const open = terminalCss.indexOf('{', start)
  const close = terminalCss.indexOf('}', open)
  return terminalCss.slice(open + 1, close)
}

describe('xterm container height', () => {
  it('insets the terminal evenly on every edge, flush by default', () => {
    // Why doubled: the margin insets one side only, so a single subtraction left
    // a gutter on top/left and none on bottom/right.
    const body = readRuleBody('.xterm-container {')
    expect(body).toContain('width: calc(100% - var(--pane-padding-x, 0px) * 2);')
    expect(body).toContain('height: calc(100% - var(--pane-padding-y, 0px) * 2);')
    expect(body).toContain('margin: var(--pane-padding-y, 0px) var(--pane-padding-x, 0px);')
  })

  it('keeps the bottom inset when a title bar replaces the top one', () => {
    expect(readRuleBody('.pane[data-has-title] .xterm-container {')).toContain(
      'height: calc(100% - var(--orca-pane-title-height) - var(--pane-padding-y, 0px));'
    )
  })

  it('never reserves a strip for the hover link tooltip', () => {
    // Why: the tooltip is hover-only and absolutely positioned, so reserving
    // layout space for it costs every pane a permanent bottom gap and a PTY row.
    for (const selector of ['.xterm-container {', '.pane[data-has-title] .xterm-container {']) {
      expect(readRuleBody(selector)).not.toContain('--orca-terminal-link-tooltip-height')
    }
  })

  it('anchors the hover link tooltip over the pane bottom edge', () => {
    const tooltip = readRuleBody('.pane-link-tooltip {')
    expect(tooltip).toContain('position: absolute;')
    expect(tooltip).toContain('bottom: 0;')
    expect(tooltip).toContain('height: var(--orca-terminal-link-tooltip-height);')
  })
})
