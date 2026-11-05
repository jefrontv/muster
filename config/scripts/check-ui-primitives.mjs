// Keeps hand-rolled controls from drifting away from the ui/ primitives (docs/STYLEGUIDE.md):
// switches come from ui/switch, buttons are pills or round, and elevation uses the shadow tiers.
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

const SOURCE_ROOT = 'src/renderer/src'
// Feature-wall visuals are illustrations, not UI chrome.
const EXEMPT_DIRS = ['src/renderer/src/components/feature-wall/']
const SWITCH_PRIMITIVE = 'src/renderer/src/components/ui/switch.tsx'

const JSX_SWITCH_ROLE = /(^|[\s{(])role="switch"/m
const SWITCH_IMPORT = /from '@\/components\/ui\/switch'/
const BUTTON_TAG = /<(?:button|Button)\b[^>]*>/gs
const SQUARE_RADIUS = /(?<![\w:-])rounded-sm(?![\w-])/
// Inset strokes and hairline rings are borders drawn with box-shadow; anything else is elevation.
const BESPOKE_SHADOW = /(?<![\w-])(?:[\w-]+:)*shadow-\[(?!inset_|0_0_)[^\]]*\]/g

export function findViolations(rel, source) {
  const out = []
  const lineOf = (index) => source.slice(0, index).split('\n').length
  if (rel !== SWITCH_PRIMITIVE && JSX_SWITCH_ROLE.test(source) && !SWITCH_IMPORT.test(source)) {
    out.push(`${rel}: role="switch" without Switch or SwitchTrack from ui/switch`)
  }
  for (const match of source.matchAll(BUTTON_TAG)) {
    if (SQUARE_RADIUS.test(match[0])) {
      out.push(`${rel}:${lineOf(match.index)}: rounded-sm on a button; buttons are pills or round`)
    }
  }
  for (const match of source.matchAll(BESPOKE_SHADOW)) {
    out.push(
      `${rel}:${lineOf(match.index)}: ${match[0]}; use shadow-xs, shadow-sm or shadow-floating`
    )
  }
  return out
}

function listSources(root, dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '__snapshots__') {
        listSources(root, full, out)
      }
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name)) {
      out.push(path.relative(root, full).split(path.sep).join('/'))
    }
  }
  return out
}

export function collectViolations(root) {
  return listSources(root, path.join(root, SOURCE_ROOT))
    .filter((rel) => !EXEMPT_DIRS.some((dir) => rel.startsWith(dir)))
    .flatMap((rel) => findViolations(rel, fs.readFileSync(path.join(root, rel), 'utf8')))
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const violations = collectViolations(process.cwd())
  if (violations.length > 0) {
    console.error(`UI primitive check failed:\n${violations.join('\n')}`)
    process.exit(1)
  }
  console.log('UI primitive check passed.')
}
