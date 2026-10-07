import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import type { ChildProcess } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { parseClaudeCliModels, probeClaudeCliModels } from './claude-cli-models'

describe('parseClaudeCliModels', () => {
  it('keeps each alias with the model it resolves to', () => {
    expect(
      parseClaudeCliModels({
        models: [
          { value: 'haiku', resolvedModel: 'claude-haiku-5-5', displayName: 'Haiku 5.5' },
          { value: 'default', displayName: 'Default (recommended)' },
          { displayName: 'no value' }
        ]
      })
    ).toEqual([
      { value: 'haiku', resolvedModel: 'claude-haiku-5-5', displayName: 'Haiku 5.5' },
      { value: 'default', resolvedModel: null, displayName: 'Default (recommended)' }
    ])
  })

  it('returns nothing for an error or older CLI response', () => {
    expect(parseClaudeCliModels(undefined)).toEqual([])
    expect(parseClaudeCliModels({ commands: [] })).toEqual([])
  })
})

function fakeCli(reply: (request: string) => string | null): () => ChildProcess {
  return () => {
    const child = new EventEmitter() as ChildProcess
    const stdin = new PassThrough()
    const stdout = new PassThrough()
    Object.assign(child, { stdin, stdout, kill: () => true })
    stdin.on('data', (chunk: Buffer) => {
      const out = reply(chunk.toString())
      if (out) {
        // Login-shell noise first, then the JSON line split across two chunks.
        stdout.write('Last login: today\n')
        stdout.write(out.slice(0, 10))
        stdout.write(`${out.slice(10)}\n`)
      }
    })
    return child
  }
}

describe('probeClaudeCliModels', () => {
  it('asks with initialize and reads the models from the control response', async () => {
    let asked = ''
    const models = await probeClaudeCliModels(
      fakeCli((request) => {
        asked = request
        return JSON.stringify({
          type: 'control_response',
          response: {
            subtype: 'success',
            request_id: 'models',
            response: {
              models: [
                { value: 'sonnet', resolvedModel: 'claude-sonnet-5-5', displayName: 'Sonnet 5.5' }
              ]
            }
          }
        })
      })
    )
    expect(JSON.parse(asked)).toMatchObject({
      type: 'control_request',
      request: { subtype: 'initialize' }
    })
    expect(models).toEqual([
      { value: 'sonnet', resolvedModel: 'claude-sonnet-5-5', displayName: 'Sonnet 5.5' }
    ])
  })

  it('gives up quietly when the CLI exits without answering', async () => {
    const spawnSilent = fakeCli(() => null)
    const models = probeClaudeCliModels(() => {
      const child = spawnSilent()
      setTimeout(() => child.emit('exit', 1), 5)
      return child
    })
    await expect(models).resolves.toEqual([])
  })
})
