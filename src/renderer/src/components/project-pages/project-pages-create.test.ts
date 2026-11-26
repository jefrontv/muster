import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createProjectPage } from './project-pages-create'

const create = vi.fn()
const enableDiagram = vi.fn()

beforeEach(() => {
  create.mockReset().mockResolvedValue({ ok: true, value: { meta: { id: 'p1' } } })
  enableDiagram.mockReset().mockResolvedValue({ ok: true, value: {} })
  ;(globalThis as unknown as { window: unknown }).window = {
    api: { projectPages: { create, enableDiagram } }
  }
})

describe('createProjectPage', () => {
  it('switches a new diagram page to a diagram before returning it', async () => {
    const result = await createProjectPage('scope', { parentId: null, diagram: true })
    expect(create).toHaveBeenCalledWith('scope', { parentId: null, folder: false })
    expect(enableDiagram).toHaveBeenCalledWith('scope', 'p1')
    expect(result).toEqual({ ok: true, value: { id: 'p1' } })
  })

  it('leaves a plain page alone', async () => {
    await createProjectPage('scope', { parentId: 'f1' })
    expect(enableDiagram).not.toHaveBeenCalled()
  })

  it('reports a failed diagram switch', async () => {
    enableDiagram.mockResolvedValue({ ok: false, code: 'io', message: 'disk full' })
    const result = await createProjectPage('scope', { parentId: null, diagram: true })
    expect(result).toMatchObject({ ok: false, message: 'disk full' })
  })
})
