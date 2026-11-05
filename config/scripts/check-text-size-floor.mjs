// Renderer text is 11px or larger, on whole pixels. Numeric counters use the 10px `text-2xs` token.
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

const SOURCE_ROOT = 'src/renderer/src'
const ARBITRARY_TEXT_SIZE = /(?<![\w-])text-\[(\d+(?:\.\d+)?)px\](?![\w-])/g

export function findTextSizeViolations(source) {
  const violations = []
  source.split('\n').forEach((line, index) => {
    for (const match of line.matchAll(ARBITRARY_TEXT_SIZE)) {
      const size = Number(match[1])
      if (size < 11 || !Number.isInteger(size)) {
        violations.push({ line: index + 1, text: match[0] })
      }
    }
  })
  return violations
}

function listSources(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '__snapshots__') {
        listSources(full, out)
      }
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

export function main(root = process.cwd()) {
  let failed = 0
  for (const file of listSources(path.join(root, SOURCE_ROOT))) {
    for (const { line, text } of findTextSizeViolations(fs.readFileSync(file, 'utf8'))) {
      failed += 1
      const rel = path.relative(root, file).split(path.sep).join('/')
      console.error(
        `::error::${rel}:${line} ${text}: use 11px or larger on whole pixels, or text-2xs for a numeric counter.`
      )
    }
  }
  return failed > 0 ? 1 : 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main())
}
