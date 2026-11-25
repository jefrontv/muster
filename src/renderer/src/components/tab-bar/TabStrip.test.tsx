import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { TabStrip } from './TabStrip'

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  TooltipContent: () => null
}))

function renderStrip(): string {
  return renderToStaticMarkup(
    <TabStrip
      worktreeId="wt-1"
      activeVisibleTabId="tab-1"
      layoutKey="tab-1"
      sortableIds={['tab-1']}
      menuEntries={[{ id: 'tab-1', label: 'index.ts', type: 'editor', isActive: true }]}
      onSelectMenuEntry={vi.fn()}
      trailingControls={<button type="button">New tab</button>}
    >
      <div data-tab-id="tab-1" />
    </TabStrip>
  )
}

describe('TabStrip', () => {
  it('keeps the strip content-sized until horizontal scrolling is needed', () => {
    const markup = renderStrip()
    expect(markup).toContain('flex-[0_1_auto]')
    expect(markup).toMatch(
      /data-tab-strip="true"[^>]*overflow-x-auto|overflow-x-auto[^>]*data-tab-strip="true"/
    )
    expect(markup).not.toContain('scrollbar-sleek')
    expect(markup).not.toMatch(/data-tab-strip="true" class="[^"]*border-r/)
  })

  it('reserves the all tabs button while nothing overflows, with no scroll chevrons', () => {
    const markup = renderStrip()
    expect(markup).toContain('data-tab-strip-all-tabs="true"')
    expect(markup).toMatch(/class="[^"]*invisible[^"]*"[^>]*data-tab-strip-all-tabs/)
    expect(markup).not.toContain('Scroll tabs left')
    expect(markup.indexOf('New tab')).toBeLessThan(markup.indexOf('data-tab-strip-all-tabs'))
  })
})
