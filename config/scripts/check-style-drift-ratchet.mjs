// Ratchets for two recipes the styleguide pins down: readable muted text is full
// text-muted-foreground (faded /20-/60 fails AA), and hover fills are bg-accent for rows or
// bg-foreground/[0.07] for controls. Per-file counts may only fall; new files start at zero.
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { diffCounts, parseBaseline } from './check-raw-status-palette.mjs'

const SOURCE_ROOT = 'src/renderer/src'

export const RULES = [
  {
    name: 'faded muted text',
    baseline: 'config/faded-muted-text-baseline.txt',
    pattern:
      /(?<![\w-])(?:[^\s"'`:{}()]+:)*text-muted-foreground\/(?:[2-6]0|\[0?\.[2-6]\d*\])(?![\w-])/g,
    fix: 'Use full text-muted-foreground; keep a fade only on separators, disabled states or decorative glyphs.'
  },
  {
    name: 'one-off hover fill',
    baseline: 'config/hover-fill-baseline.txt',
    pattern:
      /(?<![\w-])(?:[^\s"'`:{}()]+:)*hover:bg-(?!accent(?![\w/-])|foreground\/\[0\.07\](?![\w-])|transparent(?![\w-]))[^\s"'`]+/g,
    fix: 'Use ROW_HOVER (hover:bg-accent) or CONTROL_HOVER (hover:bg-foreground/[0.07]).'
  }
]

export function countMatches(source, pattern) {
  return source.match(pattern)?.length ?? 0
}

function listSources(dir, root, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '__snapshots__') {
        listSources(full, root, out)
      }
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name)) {
      out.push(path.relative(root, full).split(path.sep).join('/'))
    }
  }
  return out
}

function collectCounts(root, files, pattern) {
  const counts = new Map()
  for (const rel of files) {
    const count = countMatches(fs.readFileSync(path.join(root, rel), 'utf8'), pattern)
    if (count > 0) {
      counts.set(rel, count)
    }
  }
  return counts
}

function formatBaseline(counts) {
  return `${[...counts]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([file, count]) => `${file} ${count}`)
    .join('\n')}\n`
}

export function main(root = process.cwd(), argv = process.argv.slice(2)) {
  const files = listSources(path.join(root, SOURCE_ROOT), root)
  let failures = 0
  for (const rule of RULES) {
    const current = collectCounts(root, files, rule.pattern)
    const baselineFile = path.join(root, rule.baseline)
    if (argv.includes('--write-baseline')) {
      fs.writeFileSync(baselineFile, formatBaseline(current))
      continue
    }
    const baseline = parseBaseline(
      fs.existsSync(baselineFile) ? fs.readFileSync(baselineFile, 'utf8') : ''
    )
    const { grew, shrank } = diffCounts(current, baseline)
    for (const { file, count, allowed } of grew) {
      console.error(
        `::error::${file}: ${count} ${rule.name} classes (allowed ${allowed}). ${rule.fix}`
      )
    }
    for (const { file, count, allowed } of shrank) {
      console.error(
        `::error::${file}: ${rule.name} down to ${count} from ${allowed}. Lower its entry in ${rule.baseline} so it can't grow back.`
      )
    }
    failures += grew.length + shrank.length
  }
  return failures > 0 ? 1 : 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main())
}
