// Muster's live theme, handed to the Bots guest so it wears Muster's colours instead of its own skins.
// The guest maps these token names (main.css) onto its own (muster-host-theme.ts in the muster-bots fork).

const HOST_THEME_TOKENS = [
  'background',
  'background-solid',
  'foreground',
  'card',
  'popover',
  'primary',
  'secondary',
  'muted',
  'muted-foreground',
  'border',
  'ring',
  'destructive',
  'sidebar',
  'chat-accent',
  'chat-bubble',
  'chat-ink-secondary',
  'status-success',
  'status-attention',
  'app-font-family'
] as const

/** Muster's sidebar width and the room its mode toggle needs above the guest's sidebar. */
export type BotsHostLayout = { sidebarWidth: number; chromeTop: number }

export type BotsHostTheme = {
  dark: boolean
  tokens: Record<string, string>
  layout?: BotsHostLayout
}

export function readBotsHostTheme(root: HTMLElement = document.documentElement): BotsHostTheme {
  const computed = getComputedStyle(root)
  const tokens: Record<string, string> = {}
  for (const name of HOST_THEME_TOKENS) {
    const value = computed.getPropertyValue(`--${name}`).trim()
    if (value) {
      tokens[name] = value
    }
  }
  return { dark: root.classList.contains('dark'), tokens }
}

/** Stores the theme on the guest, then asks it to paint; the guest also reads it at boot if it loads later. */
export function botsHostThemeScript(theme: BotsHostTheme): string {
  return `window.__musterHostTheme = ${JSON.stringify(theme)}; window.__musterApplyHostTheme?.(); void 0`
}

/** Pushes now and whenever Muster's theme changes (the .dark class or inline token overrides on <html>). */
export function syncBotsHostTheme(
  webview: Electron.WebviewTag,
  layout?: { get: () => BotsHostLayout; subscribe: (onChange: () => void) => () => void }
): () => void {
  let last = ''
  let frame = 0
  const push = (): void => {
    frame = 0
    const theme = readBotsHostTheme()
    const script = botsHostThemeScript(layout ? { ...theme, layout: layout.get() } : theme)
    if (script === last) {
      return
    }
    last = script
    webview.executeJavaScript(script).catch(() => {
      // Guest not ready or navigating; dom-ready pushes again.
      last = ''
    })
  }
  const schedule = (): void => {
    frame ||= requestAnimationFrame(push)
  }
  const onDomReady = (): void => {
    last = ''
    push()
  }
  webview.addEventListener('dom-ready', onDomReady)
  const observer = new MutationObserver(schedule)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'style']
  })
  const stopLayout = layout?.subscribe(schedule)
  return () => {
    stopLayout?.()
    observer.disconnect()
    webview.removeEventListener('dom-ready', onDomReady)
    cancelAnimationFrame(frame)
  }
}
