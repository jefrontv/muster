# New defaults and Claude marketplace auto-update

Four changes, shipped together as one release:

1. The Extension Hub turns on Claude Code's own auto-update for marketplaces it installs.
2. The dark terminal theme defaults to **Claude Dark**.
3. Muster ships **GeistMono Nerd Font Mono** and makes it the default terminal font.
4. **Left Sidebar Appearance** defaults to **Match Terminal**.

## 1. Claude marketplace auto-update

Claude Code keeps a per-marketplace auto-update flag in user settings:
`~/.claude/settings.json` → `extraKnownMarketplaces["<name>"].autoUpdate`. With it on, Claude
refreshes the marketplace and its plugins every time it starts, even while Muster is closed. There
is no CLI flag for it, so the hub has to write the setting. Claude Code 2.1.312 reads the flag from
user settings only, and keeps that entry when the marketplace is uninstalled.

**Behaviour.** The hub's existing per-extension auto-update switch drives the flag for any catalog
entry whose command spec has `claudeMarketplace` (today: efront Agent Skills).

- Switch on (or the master switch on with no per-entry choice): write `autoUpdate: true`.
- Switch off: write `autoUpdate: false`.
- After a successful install, write the current switch state, so a fresh install picks it up.
- Uninstall leaves the flag alone, which matches Claude's own behaviour.
- Muster's own launch-time updater keeps running for these entries. Its `update` command also
  installs plugins that are newly added to the catalog list, which Claude's flag does not do.

**Writer** (new `src/main/extensions/claude-marketplace-auto-update.ts`):

- Config dir: `CLAUDE_CONFIG_DIR`, otherwise `~/.claude`, the same rule as
  `claude-marketplace-probe.ts`.
- Read `settings.json`. If it fails to parse, write nothing and report the error. Never replace a
  file it could not read.
- If the marketplace has no `extraKnownMarketplaces` entry yet, copy its `source` from
  `plugins/known_marketplaces.json`. If neither file has the marketplace, do nothing (it is not
  installed).
- Change only that one key. Write to a temp file, then rename, with 2-space JSON and a trailing
  newline, so every other setting is untouched.

**Wiring.** The renderer owns the switch state (`useExtensionPreferences.ts`). After it saves a
switch change, it calls a new IPC `extensions:syncClaudeMarketplaceAutoUpdate` with the entry ids
affected. The master switch syncs every installed `claudeMarketplace` entry that has no per-entry
choice. The install path in main calls the writer directly once the install command succeeds.

**Scope.** Local only, like every hub install today (`command-run.ts` has no SSH path).

## 2. Claude Dark as the dark terminal theme

`src/shared/constants.ts`: `terminalThemeDark: 'Claude Dark'` (built-in, defined at
`popular-dark-extended.ts:5`). The light theme stays `Builtin Tango Light`.

## 3. GeistMono Nerd Font Mono, bundled and the default

- **Source:** Nerd Fonts v3.4.0 `GeistMono.zip` from `ryanoasis/nerd-fonts` releases. Take
  `GeistMonoNerdFontMono-Regular`, `-Medium` and `-Bold` (400, 500, 700: the default terminal
  weight is 500 and bold is 700). Other weights fall back to the nearest one.
- **Format:** convert each file to woff2 with fontTools, and record the sizes. Add the files to
  `src/renderer/src/assets/fonts/`, next to the existing Geist and Nerd symbols fonts, with the
  font's OFL 1.1 licence text.
- **CSS:** three `@font-face` rules in `main.css`, family `'GeistMono Nerd Font Mono'`.
- **Default:** `terminalFontFamily: 'GeistMono Nerd Font Mono'` on every platform. The editor
  already follows the terminal font. `defaultTerminalFontFamily()` stays as the fallback list.
- **Loading:** xterm measures cell size when a terminal opens. If the font is still loading, cells
  measure wrong. Before the first terminal opens, wait on `document.fonts.load()` for the bundled
  family. If existing code already re-measures on `document.fonts` events, reuse that.
- **Picker:** the font list comes from the system (`settings:listFonts`), so a bundled font would
  not appear. Add it to the top of the list, labelled as bundled.

## 4. Match Terminal as the left sidebar default

`src/shared/constants.ts`: `leftSidebarAppearanceMode: 'match-terminal'`.

## Existing installs

Saved settings already hold the old defaults, so changing the constants only affects new installs.
Add a one-time migration in `src/main/persistence.ts`, using the same flag pattern as
`migrateTerminalTuiScrollSensitivityDefault`. It moves a value only when it is still the old
default:

| Setting                     | Moves from                                                                  | To                         |
| --------------------------- | --------------------------------------------------------------------------- | -------------------------- |
| `terminalThemeDark`         | `Ghostty Default Style Dark`                                                | `Claude Dark`              |
| `terminalFontFamily`        | the platform's old default (`SF Mono`, `Cascadia Mono`, `DejaVu Sans Mono`) | `GeistMono Nerd Font Mono` |
| `leftSidebarAppearanceMode` | `default`                                                                   | `match-terminal`           |

Anyone who picked something else keeps their choice. Someone who deliberately picked an old default
is moved once and can change it back.

**Open question:** should existing installs be migrated at all? The alternative is new installs
only.

## Verification

- Unit tests: settings writer (adds the key, keeps every other setting, refuses an unparseable
  file, copies `source` from `known_marketplaces.json`, no-op when not installed), switch sync
  (entry, master, install), migration (moves old defaults, keeps custom values, runs once).
- `pnpm run typecheck:release`, oxlint, the max-lines and reliability gates.
- Dev app: a new profile shows Claude Dark, GeistMono with Nerd glyphs rendering (`ls` with icons,
  Claude's status line), and Match Terminal. Toggle the hub switch and check
  `~/.claude/settings.json` changes only `autoUpdate`.
- The packaged app size difference is reported with the release.

## As built

Changes from the plan, made after review:

- The defaults match the live Muster profile, not only the four settings above. New installs also
  get a bar cursor, the cursor theme colour off, inactive pane opacity 0.8, and no separate light
  terminal theme (Claude Dark in light mode too).
- No migration. Existing profiles keep their saved settings; only new installs get the new
  defaults. A forced one-time move with a Revert toast was built and then dropped.
- The bundled font is not labelled in the picker. It is added to the suggestions after Geist.
- The master switch also covers the other catalog entries with a Claude marketplace
  (`context-mode`, `claude-code-cache-warmer`), not only efront Agent Skills.
- Claude Dark's selection colour moved from `#4a453d` to `#7a7265` to pass the default-theme
  contrast test.
- A profile with a terminal background override and opacity below 1 can still show the sidebar
  darker than the terminal. That comes from those two settings, not from the new defaults.
