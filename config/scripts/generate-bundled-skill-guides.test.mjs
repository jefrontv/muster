import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { BUNDLED_SKILL_GUIDES } from '../../src/cli/bundled-skill-guides'
import {
  CANONICAL_GUIDE_NAMES,
  GUIDE_ALIASES,
  STUB_TOPICS,
  assertAliasContract,
  buildArtifacts,
  frontmatterBlock,
  normalizeMarkdown,
  parseFrontmatter,
  upstreamBrandedProjection,
  verifyArtifacts,
  writeArtifacts
} from './generate-bundled-skill-guides.mjs'

const projectDir = path.resolve(import.meta.dirname, '..', '..')
const temporaryDirectories = []

async function createFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'orca-bundled-skill-guides-'))
  temporaryDirectories.push(root)
  await Promise.all([
    cp(path.join(projectDir, 'skill-guides'), path.join(root, 'skill-guides'), {
      recursive: true
    }),
    cp(path.join(projectDir, 'skill-stubs'), path.join(root, 'skill-stubs'), {
      recursive: true
    }),
    cp(path.join(projectDir, 'skills'), path.join(root, 'skills'), { recursive: true }),
    mkdir(path.join(root, 'src', 'cli'), { recursive: true })
  ])
  return root
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true }))
  )
})

describe('bundled skill guide generator', () => {
  it('keeps every fat (non-stub) projection byte-identical to its authoritative source', async () => {
    for (const name of CANONICAL_GUIDE_NAMES) {
      if (STUB_TOPICS.includes(name)) {
        continue
      }
      const source = await readFile(path.join(projectDir, 'skill-guides', `${name}.md`))
      const projection = await readFile(path.join(projectDir, 'skills', name, 'SKILL.md'))
      expect(projection, name).toEqual(source)
    }
  })

  it('projects stub topics as hybrid discovery stubs that reuse the guide frontmatter', async () => {
    expect(STUB_TOPICS.length).toBeGreaterThan(0)
    for (const name of STUB_TOPICS) {
      const source = await readFile(path.join(projectDir, 'skill-guides', `${name}.md`), 'utf8')
      const projection = await readFile(path.join(projectDir, 'skills', name, 'SKILL.md'), 'utf8')

      // The routing frontmatter is the unchanged discovery surface — de-branded, because the
      // projection is the file upstream serves and its bytes are what freshness fingerprints.
      expect(
        projection.startsWith(upstreamBrandedProjection(frontmatterBlock(source, `${name}.md`)))
      ).toBe(true)
      // The stub is a thin hybrid pointer, not the full guide.
      expect(projection).not.toEqual(source)
      expect(projection.length).toBeLessThan(source.length)
      expect(projection).toContain('discovery stub')
      expect(projection).toContain(`skills get ${name}`)
    }
  })

  it('ships installable projections that carry no Muster branding', async () => {
    // The nag this prevents: `npx skills update` installs upstream's Orca-branded file, while
    // resources/skills/*.json fingerprints whatever sits in skills/. Rebrand the projection and
    // the two can never agree, so every skill reads "Update available" forever and the command
    // that claims to fix it is a no-op. Embedded full guides keep saying Muster; projections do not.
    for (const name of STUB_TOPICS) {
      const projection = await readFile(path.join(projectDir, 'skills', name, 'SKILL.md'), 'utf8')
      expect(projection, name).not.toMatch(/\bMuster\b/)
    }
    const guide = await readFile(path.join(projectDir, 'skill-guides', 'orca-cli.md'), 'utf8')
    expect(guide).toMatch(/\bMuster\b/)
  })

  it('fixes the article when de-branding, so prose stays grammatical', () => {
    // "a Muster-managed terminal" must become "an Orca-managed terminal"; a bare noun swap would
    // emit "a Orca-managed" and lose byte parity with upstream over a single character.
    expect(upstreamBrandedProjection('outside a Muster-managed terminal')).toBe(
      'outside an Orca-managed terminal'
    )
    expect(upstreamBrandedProjection('A Muster workspace')).toBe('An Orca workspace')
    expect(upstreamBrandedProjection('the Muster app')).toBe('the Orca app')
  })

  it('keeps pre-guide fallback useful and read-only for every converted domain', async () => {
    const expectedFallbackCommands = {
      'computer-use': ['ORCA computer capabilities --json', 'ORCA computer list-apps --json'],
      'linear-tickets': ['ORCA linear --help', 'ORCA linear issue --current --full --json'],
      'orca-emulator': ['ORCA emulator list --json'],
      'orca-emulator-android': ['ORCA emulator devices --json'],
      'orca-linear': ['ORCA linear --help', 'ORCA linear issue --current --full --json'],
      'orca-per-workspace-env': ['ORCA vm recipe doctor <recipe-id> --repo-path <repo> --json']
    }

    for (const [name, commands] of Object.entries(expectedFallbackCommands)) {
      const stub = await readFile(path.join(projectDir, 'skill-stubs', `${name}.md`), 'utf8')
      const fallback = stub.split('## If an older Muster does not recognize `skills get`')[1]

      expect(fallback, name).toBeDefined()
      for (const command of commands) {
        expect(fallback, name).toContain(command)
      }
      expect(fallback, name).not.toContain('ORCA worktree ps --json')
    }
  })

  it('embeds canonical names, discovery descriptions, Markdown, and append-only aliases', async () => {
    expect(BUNDLED_SKILL_GUIDES.map((guide) => guide.name)).toEqual(
      [...CANONICAL_GUIDE_NAMES].sort((left, right) => left.localeCompare(right, 'en'))
    )

    for (const guide of BUNDLED_SKILL_GUIDES) {
      const source = await readFile(
        path.join(projectDir, 'skill-guides', `${guide.name}.md`),
        'utf8'
      )
      const frontmatter = parseFrontmatter(source, `${guide.name}.md`)
      expect(guide.description).toBe(frontmatter.description)
      expect(guide.markdown).toBe(source)
      expect(guide.fullMarkdown).toBe(source)
      expect(guide.aliases).toEqual(GUIDE_ALIASES[guide.name])
    }
  })

  it('keeps CLI guide examples safe across shells and Linux command names', async () => {
    for (const name of ['orca-cli', 'computer-use', 'orca-emulator', 'orca-emulator-android']) {
      const source = await readFile(path.join(projectDir, 'skill-guides', `${name}.md`), 'utf8')

      expect(source).toContain('ORCA_CLI_COMMAND')
      expect(source).toContain('orca-dev')
      expect(source).toContain('orca-ide')
      expect(source).toContain('PowerShell')
      expect(source).toContain('cmd.exe')
      expect(source).toMatch(/^ORCA .+--json$/mu)
      // Why: bare command lines can launch GNOME Orca, while shell variables make
      // the same guide unusable from PowerShell and cmd.exe.
      expect(source).not.toMatch(/^orca /mu)
      expect(source).not.toMatch(/\$ORCA(?:_|\b)/u)
    }
  })

  it('builds deterministic artifacts and verifies the checked-in outputs', async () => {
    const first = await buildArtifacts(projectDir)
    const second = await buildArtifacts(projectDir)

    expect(second).toEqual(first)
    await expect(verifyArtifacts(first, projectDir)).resolves.toBeUndefined()
  })

  it('generates platform-identical output from CRLF guide sources', async () => {
    const expected = await buildArtifacts(projectDir)
    const root = await createFixture()
    for (const name of CANONICAL_GUIDE_NAMES) {
      const sourcePath = path.join(root, 'skill-guides', `${name}.md`)
      const source = await readFile(sourcePath, 'utf8')
      await writeFile(sourcePath, source.replaceAll('\n', '\r\n'))
    }
    for (const name of STUB_TOPICS) {
      const stubPath = path.join(root, 'skill-stubs', `${name}.md`)
      const stubSource = await readFile(stubPath, 'utf8')
      await writeFile(stubPath, stubSource.replaceAll('\n', '\r\n'))
    }

    const actual = await buildArtifacts(root)
    expect(actual.map((artifact) => artifact.content)).toEqual(
      expected.map((artifact) => artifact.content)
    )
  })

  it('pins guide sources, projections, and embedded output to LF in Git', async () => {
    const attributes = await readFile(path.join(projectDir, '.gitattributes'), 'utf8')
    expect(normalizeMarkdown(attributes)).toContain('/skill-guides/*.md text eol=lf\n')
    expect(normalizeMarkdown(attributes)).toContain('/skill-stubs/*.md text eol=lf\n')
    expect(normalizeMarkdown(attributes)).toContain('/skills/*/SKILL.md text eol=lf\n')
    expect(normalizeMarkdown(attributes)).toContain(
      '/src/cli/bundled-skill-guides.ts text eol=lf\n'
    )
  })

  it('reports stale outputs and write mode repairs all projections', async () => {
    const root = await createFixture()
    const artifacts = await buildArtifacts(root)

    await expect(verifyArtifacts(artifacts, root)).rejects.toThrow(
      'src/cli/bundled-skill-guides.ts'
    )
    await writeArtifacts(artifacts)
    await expect(verifyArtifacts(artifacts, root)).resolves.toBeUndefined()

    await writeFile(path.join(root, 'skills', 'computer-use', 'SKILL.md'), 'stale\n')
    await expect(verifyArtifacts(artifacts, root)).rejects.toThrow('skills/computer-use/SKILL.md')
  })

  it('rejects mismatched source names and ambiguous aliases', async () => {
    const root = await createFixture()
    await writeFile(
      path.join(root, 'skill-guides', 'computer-use.md'),
      '---\nname: wrong\ndescription: present\n---\n'
    )
    await expect(buildArtifacts(root)).rejects.toThrow('declares mismatched name wrong')

    expect(() =>
      assertAliasContract([
        { name: 'first', aliases: ['legacy'] },
        { name: 'second', aliases: ['legacy'] }
      ])
    ).toThrow('assigned more than once')
    expect(() =>
      assertAliasContract([
        { name: 'first', aliases: ['second'] },
        { name: 'second', aliases: [] }
      ])
    ).toThrow('collides with canonical name')
  })
})
