// Shortens a harness config path for display.
//
// Three rows each showing `/Users/<name>/.claude.json` is three copies of the same prefix and one
// useful word. Collapsing the home directory to `~` puts the part that differs where the eye lands.
// The full path stays available as the element's title, because it is what someone would paste into
// a terminal.

const HOME_PATTERN = /^(\/Users\/[^/]+|\/home\/[^/]+|[A-Za-z]:\\Users\\[^\\]+)(?=[/\\]|$)/

export function shortenExtensionConfigPath(path: string): string {
  return path.replace(HOME_PATTERN, '~')
}
