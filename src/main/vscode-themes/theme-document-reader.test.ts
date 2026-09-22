import { describe, expect, it, vi } from 'vitest'
import { readThemeDocument, type ThemeDocumentReadEnv } from './theme-document-reader'

/** An in-memory themes directory, so the include walk is tested without touching disk. */
function env(files: Record<string, string>): ThemeDocumentReadEnv {
  return {
    readTextFile: async (path) => files[path] ?? null,
    realPath: async (path) => path
  }
}

const DIR = '/themes'

describe('readThemeDocument', () => {
  it('reads a standalone theme', async () => {
    const result = await readThemeDocument(
      '/themes/solo.json',
      DIR,
      env({ '/themes/solo.json': '{"name":"Solo","type":"dark","colors":{"editor.background":"#000"}}' })
    )
    expect(result?.document).toMatchObject({ name: 'Solo', type: 'dark' })
    expect(result?.files).toEqual(['/themes/solo.json'])
  })

  it('follows one include and layers the deriving file over it', async () => {
    const result = await readThemeDocument(
      '/themes/plus.json',
      DIR,
      env({
        '/themes/plus.json': '{"name":"Plus","include":"./base.json","colors":{"editor.background":"#111111"}}',
        '/themes/base.json':
          '{"type":"dark","colors":{"editor.background":"#000000","editor.foreground":"#ffffff"}}'
      })
    )
    expect(result?.document.colors).toEqual({
      'editor.background': '#111111',
      'editor.foreground': '#ffffff'
    })
    expect(result?.document.type).toBe('dark')
  })

  it('follows the real four-file chain shape', async () => {
    // 2026-dark -> dark_modern (colours, no tokenColors) -> dark_plus (tokenColors, no colours)
    // -> dark_vs (both). Stopping early yields a theme with a background and no highlighting.
    const result = await readThemeDocument(
      '/themes/2026-dark.json',
      DIR,
      env({
        '/themes/2026-dark.json': '{"name":"Dark 2026","include":"./dark_modern.json","colors":{"editor.background":"#181818"}}',
        '/themes/dark_modern.json': '{"name":"Dark Modern","include":"./dark_plus.json","colors":{"editorGutter.background":"#1f1f1f"}}',
        '/themes/dark_plus.json': '{"name":"Dark+","include":"./dark_vs.json","tokenColors":[{"scope":"variable","settings":{"foreground":"#9cdcfe"}}]}',
        '/themes/dark_vs.json': '{"type":"dark","colors":{"editor.foreground":"#d4d4d4"},"tokenColors":[{"scope":"comment","settings":{"foreground":"#6a9955"}}]}'
      })
    )
    expect(result?.files).toHaveLength(4)
    expect(result?.document.name).toBe('Dark 2026')
    expect(result?.document.type).toBe('dark')
    expect(result?.document.colors).toEqual({
      'editor.background': '#181818',
      'editorGutter.background': '#1f1f1f',
      'editor.foreground': '#d4d4d4'
    })
    // Base first, derived appended: the order styleForScope relies on for tie-breaking.
    expect(result?.document.tokenColors).toEqual([
      { scope: 'comment', settings: { foreground: '#6a9955' } },
      { scope: 'variable', settings: { foreground: '#9cdcfe' } }
    ])
  })

  it('keeps what it has when a file in the chain is missing', async () => {
    const result = await readThemeDocument(
      '/themes/plus.json',
      DIR,
      env({ '/themes/plus.json': '{"name":"Plus","include":"./gone.json","colors":{"editor.background":"#111111"}}' })
    )
    expect(result?.document.colors).toEqual({ 'editor.background': '#111111' })
    expect(result?.files).toEqual(['/themes/plus.json'])
  })

  it('answers null when the outermost file cannot be read', async () => {
    expect(await readThemeDocument('/themes/missing.json', DIR, env({}))).toBeNull()
  })

  it('answers null when the outermost file is not valid', async () => {
    expect(
      await readThemeDocument('/themes/bad.json', DIR, env({ '/themes/bad.json': '{"a":' }))
    ).toBeNull()
  })

  it('answers null when the outermost file is an array', async () => {
    expect(
      await readThemeDocument('/themes/arr.json', DIR, env({ '/themes/arr.json': '[1,2,3]' }))
    ).toBeNull()
  })

  it('reads a theme file with comments, which real ones have', async () => {
    const result = await readThemeDocument(
      '/themes/c.json',
      DIR,
      env({ '/themes/c.json': '{\n // a note\n "name":"C", "colors":{"editor.background":"#000000",}\n}' })
    )
    expect(result?.document).toMatchObject({ name: 'C' })
  })

  it('stops on a cycle instead of looping', async () => {
    const result = await readThemeDocument(
      '/themes/a.json',
      DIR,
      env({
        '/themes/a.json': '{"name":"A","include":"./b.json"}',
        '/themes/b.json': '{"include":"./a.json","colors":{"editor.background":"#000000"}}'
      })
    )
    expect(result?.files).toEqual(['/themes/a.json', '/themes/b.json'])
  })

  it('stops at the depth cap', async () => {
    const files: Record<string, string> = {}
    for (let index = 0; index < 20; index += 1) {
      files[`/themes/t${index}.json`] = `{"include":"./t${index + 1}.json"}`
    }
    const result = await readThemeDocument('/themes/t0.json', DIR, env(files))
    expect(result?.files.length).toBeLessThanOrEqual(10)
  })

  it('refuses an include that resolves outside the themes directory', async () => {
    // `themeIncludePath` already rejects `..`, so this is the symlink case: a file inside the
    // directory whose real path is elsewhere.
    const readTextFile = vi.fn(async (path: string) =>
      path === '/themes/a.json' ? '{"name":"A","include":"./link.json"}' : '{"name":"Outside"}'
    )
    const result = await readThemeDocument('/themes/a.json', DIR, {
      readTextFile,
      realPath: async (path) => (path === '/themes/link.json' ? '/elsewhere/evil.json' : path)
    })
    expect(result?.files).toEqual(['/themes/a.json'])
    expect(result?.document.name).toBe('A')
  })

  it('does not treat a sibling directory as contained', async () => {
    const result = await readThemeDocument('/themes-other/a.json', DIR, {
      readTextFile: async () => '{"name":"A"}',
      realPath: async (path) => path
    })
    expect(result).toBeNull()
  })
})
