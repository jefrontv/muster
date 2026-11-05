// Renderer states (success, attention, danger, info) use the --status-* tokens so both themes stay
// in contrast. This ratchet freezes the per-file count of raw status-hue palette classes; a file
// may only lower its count, and new files start at zero. Categorical palettes (chart series,
// kanban lanes, marketing visuals) are the expected remainder.
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

const BASELINE_PATH = 'config/raw-status-palette-baseline.txt'
const SOURCE_ROOT = 'src/renderer/src'
const RAW_STATUS_CLASS =
  /(?<![\w-])(?:[^\s"'`:{}()]+:)*!?(?:text|bg|border(?:-[trblxy])?|ring|fill|stroke|outline|decoration|divide|caret|accent)-(?:emerald|green|amber|yellow|rose|red|sky|blue)-\d{2,3}(?![\w-])/g

export function countRawStatusClasses(source) {
  return source.match(RAW_STATUS_CLASS)?.length ?? 0
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

export function collectCounts(root) {
  const counts = new Map()
  for (const rel of listSources(root, path.join(root, SOURCE_ROOT))) {
    const count = countRawStatusClasses(fs.readFileSync(path.join(root, rel), 'utf8'))
    if (count > 0) {
      counts.set(rel, count)
    }
  }
  return counts
}

export function parseBaseline(text) {
  const baseline = new Map()
  for (const line of text.split('\n')) {
    const match = /^(\S+)\s+(\d+)$/.exec(line.trim())
    if (match) {
      baseline.set(match[1], Number(match[2]))
    }
  }
  return baseline
}

export function diffCounts(current, baseline) {
  const grew = []
  const shrank = []
  for (const [file, count] of current) {
    const allowed = baseline.get(file) ?? 0
    if (count > allowed) {
      grew.push({ file, count, allowed })
    }
  }
  for (const [file, allowed] of baseline) {
    const count = current.get(file) ?? 0
    if (count < allowed) {
      shrank.push({ file, count, allowed })
    }
  }
  return { grew, shrank }
}

function formatBaseline(counts) {
  return `${[...counts]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([file, count]) => `${file} ${count}`)
    .join('\n')}\n`
}

export function main(root = process.cwd(), argv = process.argv.slice(2)) {
  const current = collectCounts(root)
  const baselineFile = path.join(root, BASELINE_PATH)
  if (argv.includes('--write-baseline')) {
    fs.writeFileSync(baselineFile, formatBaseline(current))
    return 0
  }
  const baseline = parseBaseline(
    fs.existsSync(baselineFile) ? fs.readFileSync(baselineFile, 'utf8') : ''
  )
  const { grew, shrank } = diffCounts(current, baseline)
  for (const { file, count, allowed } of grew) {
    console.error(
      `::error::${file}: ${count} raw status-hue classes (allowed ${allowed}). Use text-status-*, bg-status-*-background or border-status-*-border.`
    )
  }
  for (const { file, count, allowed } of shrank) {
    console.error(
      `::error::${file}: down to ${count} from ${allowed}. Lower its entry in ${BASELINE_PATH} so it can't grow back.`
    )
  }
  return grew.length + shrank.length > 0 ? 1 : 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main())
}
