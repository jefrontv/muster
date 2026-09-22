// Fails the build if the shipped extension catalog would not parse at runtime.
//
// The catalog is the one file in this repo that gets published on its own and read by builds that
// were compiled before it was written, so a typo in it is not a local mistake — it is a broken hub
// on every machine that fetches it. Validating here means the bad version never leaves CI.

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const catalogPath = join(repoRoot, 'resources', 'extensions', 'extension-catalog.json')

function fail(message) {
  console.error(`extension-catalog: ${message}`)
  process.exit(1)
}

const raw = await readFile(catalogPath, 'utf8').catch(() => null)
if (raw === null) {
  fail(`missing ${catalogPath}`)
}

let parsed
try {
  parsed = JSON.parse(raw)
} catch (error) {
  fail(`not valid JSON: ${error.message}`)
}

// The schema itself lives in TypeScript, which this plain Node script cannot import. Rather than
// duplicate it, check the invariants a human is most likely to break by hand and leave the full
// shape to the unit test that DOES import the schema.
if (parsed.schemaVersion !== 1) {
  fail(`schemaVersion must be 1, found ${JSON.stringify(parsed.schemaVersion)}`)
}
if (!Array.isArray(parsed.entries) || parsed.entries.length === 0) {
  fail('entries must be a non-empty array')
}

const seen = new Set()
for (const entry of parsed.entries) {
  for (const field of ['id', 'kind', 'name', 'description', 'version']) {
    if (typeof entry?.[field] !== 'string' || entry[field].length === 0) {
      fail(`entry ${JSON.stringify(entry?.id)} is missing ${field}`)
    }
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(entry.id)) {
    fail(`entry id ${JSON.stringify(entry.id)} must be lowercase kebab-case`)
  }
  if (seen.has(entry.id)) {
    fail(`duplicate entry id ${entry.id}`)
  }
  seen.add(entry.id)
  if (!['skill', 'mcp', 'app'].includes(entry.kind)) {
    fail(`entry ${entry.id} has unknown kind ${JSON.stringify(entry.kind)}`)
  }
  if (!['config-write', 'command', 'bundled-skill'].includes(entry.install?.method)) {
    fail(`entry ${entry.id} has unknown install method ${JSON.stringify(entry.install?.method)}`)
  }
  // Why this one specifically: an entry cleared for unattended updates with no update command is
  // the mistake that would otherwise only surface as a silent no-op on users' machines.
  if (entry.autoUpdate?.supported === true) {
    const command = entry.install?.command ?? entry.install?.provision
    if (!command?.update && !command?.install) {
      fail(`entry ${entry.id} allows auto-update but has no command to run`)
    }
  }
  if (entry.autoUpdate?.supported === false && !entry.autoUpdate.reason) {
    fail(`entry ${entry.id} refuses auto-update without saying why`)
  }
}

console.log(`extension-catalog: ${parsed.entries.length} entries OK`)
