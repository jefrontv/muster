import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { TabColorMenuSection } from './TabColorMenuSection'

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children?: React.ReactNode }) => (
    <span data-tooltip-content>{children}</span>
  )
}))

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenuItem: ({
    children,
    onSelect: _onSelect,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & { onSelect?: () => void }) => (
    <div {...props}>{children}</div>
  )
}))

describe('TabColorMenuSection', () => {
  it('lays out ten swatches in a five-column grid with none first', () => {
    const markup = renderToStaticMarkup(<TabColorMenuSection value={null} onChange={vi.fn()} />)
    expect(markup).toContain('grid-cols-5')
    const swatches = [...markup.matchAll(/data-tab-color-swatch="([^"]+)"/g)].map((m) => m[1])
    expect(swatches).toHaveLength(10)
    expect(swatches[0]).toBe('none')
    expect(markup).toContain('border-dashed')
  })

  it('marks the stored colour as selected and names every swatch', () => {
    const markup = renderToStaticMarkup(<TabColorMenuSection value="#EC4899" onChange={vi.fn()} />)
    expect(markup).toMatch(/aria-label="Pink" aria-checked="true"/)
    expect(markup).toMatch(/aria-label="None" aria-checked="false"/)
    expect(markup).toContain('>Teal<')
  })
})
