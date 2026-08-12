import type { IBufferCell, ITheme, Terminal } from '@xterm/xterm'

// Why: the cell grid never divides the pane evenly, so a strip of the xterm host
// stays uncovered on the right/bottom (sub-cell remainder plus the scrollbar
// gutter FitAddon reserves). xterm paints that host with the *configured* theme
// background, so any TUI that fills its screen with its own background colour
// leaves a bright band beside the content. Match the host to what the grid paints
// and the leftover reads as padding instead of a gap.

const ANSI_THEME_KEYS = [
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
  'brightBlack',
  'brightRed',
  'brightGreen',
  'brightYellow',
  'brightBlue',
  'brightMagenta',
  'brightCyan',
  'brightWhite'
] as const satisfies readonly (keyof ITheme)[]

function toHex(r: number, g: number, b: number): string {
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

function resolvePaletteColor(index: number, theme: ITheme | undefined): string | null {
  if (index < 16) {
    const color = theme?.[ANSI_THEME_KEYS[index]]
    return typeof color === 'string' ? color : null
  }
  if (index < 232) {
    const cube = index - 16
    const level = (value: number): number => (value === 0 ? 0 : 55 + value * 40)
    return toHex(level(Math.floor(cube / 36) % 6), level(Math.floor(cube / 6) % 6), level(cube % 6))
  }
  if (index < 256) {
    const gray = 8 + (index - 232) * 10
    return toHex(gray, gray, gray)
  }
  return null
}

export function readCellBackground(
  cell: IBufferCell | undefined,
  theme: ITheme | undefined
): string | null {
  if (!cell || cell.isBgDefault()) {
    return null
  }
  const value = cell.getBgColor()
  if (cell.isBgRGB()) {
    return toHex((value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff)
  }
  return cell.isBgPalette() ? resolvePaletteColor(value, theme) : null
}

/** `#rgb`, `#rrggbb`, `#rrrrggggbbbb` and `rgb:h…/h…/h…` — the forms OSC 11 answers with. */
export function parseOscColor(spec: string): string | null {
  const trimmed = spec.trim()
  let channels: string[] | null = null
  if (trimmed.startsWith('#')) {
    const digits = trimmed.slice(1)
    const width = digits.length / 3
    channels =
      Number.isInteger(width) && width >= 1 && width <= 4
        ? [0, 1, 2].map((i) => digits.slice(i * width, (i + 1) * width))
        : null
  } else if (/^rgb:/i.test(trimmed)) {
    channels = trimmed.slice(4).split('/')
  }
  if (channels?.length !== 3) {
    return null
  }
  const scaled = channels.map((channel) => {
    if (!/^[0-9a-f]{1,4}$/i.test(channel)) {
      return -1
    }
    const value = Number.parseInt(channel, 16)
    const max = 16 ** channel.length - 1
    return Math.round((value / max) * 255)
  })
  return scaled.some((value) => value < 0) ? null : toHex(scaled[0], scaled[1], scaled[2])
}

/** Alpha the composed theme carries, so a translucent terminal stays translucent. */
export function readBackgroundAlpha(background: string | undefined): number {
  const match = background?.match(/^rgba?\([^)]*,\s*([\d.]+)\s*\)$/i)
  const alpha = match ? Number.parseFloat(match[1]) : 1
  return Number.isFinite(alpha) ? Math.min(1, Math.max(0, alpha)) : 1
}

/** Divides a translucent `rgba()` by its own alpha, clamped. See `sync` for why. */
export function unpremultiplyBackground(background: string): string {
  const match = background.match(
    /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)[,/\s]+([\d.]+)\s*\)$/i
  )
  const alpha = match ? Number.parseFloat(match[4]) : 1
  if (!match || !(alpha > 0) || alpha >= 1) {
    return background
  }
  const channels = [1, 2, 3].map((i) =>
    Math.min(255, Math.round(Number.parseFloat(match[i]) / alpha))
  )
  return `rgba(${channels[0]}, ${channels[1]}, ${channels[2]}, ${alpha})`
}

function withAlpha(hex: string, alpha: number): string {
  if (alpha >= 1 || !/^#[0-9a-f]{6}$/i.test(hex)) {
    return hex
  }
  const value = Number.parseInt(hex.slice(1), 16)
  return `rgba(${(value >> 16) & 0xff}, ${(value >> 8) & 0xff}, ${value & 0xff}, ${alpha})`
}

type PaintedBackgroundTerminal = Pick<Terminal, 'buffer' | 'cols' | 'rows' | 'options'>

/** The colour every sampled edge cell shares, or null when the grid is not uniformly painted. */
export function readPaintedEdgeBackground(terminal: PaintedBackgroundTerminal): string | null {
  const buffer = terminal.buffer?.active
  const column = terminal.cols - 1
  // Why guarded: pane lifecycle tests and torn-down panes hand over a terminal
  // without a live buffer or grid.
  if (!buffer || column < 0 || terminal.rows < 1) {
    return null
  }
  const theme = terminal.options?.theme
  let shared: string | null = null
  // Why the last column: it is the one the leftover strip sits beside. Three rows
  // keep a partially painted screen (a coloured status line, say) from winning.
  for (const offset of [0, Math.floor((terminal.rows - 1) / 2), terminal.rows - 1]) {
    const color = readCellBackground(
      buffer.getLine(buffer.viewportY + offset)?.getCell(column),
      theme
    )
    if (!color || (shared && color !== shared)) {
      return null
    }
    shared = color
  }
  return shared
}

export function attachTerminalPaintedBackgroundSync(terminal: Terminal): () => void {
  const element = terminal.element
  if (!element?.style) {
    return () => {}
  }
  // Why all three: xterm sizes its host to the cell grid and paints it plus the
  // scrollable element it stacks on top, so the right-hand strip needs both — and
  // the row remainder below the grid falls outside them onto the pane container.
  const hosts = [
    element.parentElement,
    element,
    element.querySelector<HTMLElement>('.xterm-scrollable-element')
  ]
    .filter((host): host is HTMLElement => Boolean(host?.style))
    .map((host) => ({ host, original: host.style.backgroundColor }))
  let applied: string | null = null
  let frame: number | null = null
  // Why mirrored rather than read from options.theme: a shell or TUI can move the
  // default background with OSC 11, and xterm tracks that on its host element only —
  // the configured theme colour would repaint the pane a shade the grid never uses.
  let xtermBackground = element.style.backgroundColor || terminal.options?.theme?.background || null
  let overriding = false
  let writing = false

  const sync = (): void => {
    // Why the `applied` check: our own write would otherwise be mirrored back and
    // unpremultiplied again on every frame, walking the colour toward white.
    const live = element.style.backgroundColor
    if (!overriding && live && live !== applied) {
      xtermBackground = live
    }
    const painted = readPaintedEdgeBackground(terminal)
    overriding = painted !== null
    // Why the unpainted case still writes: the row remainder below the grid falls
    // outside xterm's own host, so leaving the container bare showed the split
    // background as a band above the status bar.
    // Why unpremultiplied there: with a translucent background the WebGL renderer
    // paints default cells at colour/alpha, so the grid reads ~5/255 lighter than
    // the identical CSS colour — measured, not theorised. Explicit cell colours are
    // drawn opaque, so the painted case keeps the colour as-is.
    const background = painted
      ? withAlpha(painted, readBackgroundAlpha(xtermBackground ?? undefined))
      : xtermBackground && unpremultiplyBackground(xtermBackground)
    if (background === applied) {
      return
    }
    applied = background
    writing = true
    for (const { host, original } of hosts) {
      host.style.backgroundColor = background ?? original
    }
    writing = false
  }

  const schedule = (): void => {
    if (frame != null) {
      return
    }
    frame = requestAnimationFrame(() => {
      frame = null
      sync()
    })
  }

  // Why an observer: xterm writes its host background straight to the style
  // attribute — on first paint and on every colour change — with no event to
  // subscribe to, so this is how a late theme or an OSC 11 reaches us.
  const styleObserver = new MutationObserver(() => {
    if (!writing) {
      schedule()
    }
  })
  styleObserver.observe(element, { attributes: true, attributeFilter: ['style'] })

  const disposables = [
    terminal.onRender(schedule),
    terminal.onResize(schedule),
    // Why `false`: these only observe; xterm's own handlers still apply the colour.
    // Why the parse gate on 11: a bare `?` is a query, not a new background.
    ...(terminal.parser
      ? [
          terminal.parser.registerOscHandler(11, (data) => {
            const parsed = parseOscColor(data)
            if (parsed) {
              xtermBackground = parsed
              schedule()
            }
            return false
          }),
          terminal.parser.registerOscHandler(111, () => {
            xtermBackground = terminal.options?.theme?.background ?? xtermBackground
            schedule()
            return false
          })
        ]
      : [])
  ]
  sync()

  return () => {
    if (frame != null) {
      cancelAnimationFrame(frame)
    }
    styleObserver.disconnect()
    for (const disposable of disposables) {
      disposable.dispose()
    }
    if (applied) {
      for (const { host, original } of hosts) {
        host.style.backgroundColor = original
      }
    }
  }
}
