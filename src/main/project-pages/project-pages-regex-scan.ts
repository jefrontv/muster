// grep_pages regexes run in a worker: a catastrophic pattern stalls only the worker, which is
// terminated at the deadline, never the main process.
import { Worker } from 'node:worker_threads'

// Plain JS so it runs as an eval worker, with no extra build entry. Results go to shared memory
// so the ones before a stuck line survive terminate(); slot 0 counts the lines scanned.
const SCAN_SOURCE = `
const { parentPort, workerData } = require('node:worker_threads')
const { source, flags, texts, shared } = workerData
const pattern = new RegExp(source, flags)
const found = new Int32Array(shared)
texts.forEach((text, i) => {
  const match = pattern.exec(text)
  found[i + 1] = match ? match.index : -1
  Atomics.store(found, 0, i + 1)
})
parentPort.postMessage('done')
`

/** First match index per text, in order; shorter than texts when the deadline cut it off. */
export function scanWithRegex(pattern: RegExp, texts: string[], ms: number): Promise<number[]> {
  return new Promise((resolve) => {
    const shared = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * (texts.length + 1))
    const found = new Int32Array(shared)
    const worker = new Worker(SCAN_SOURCE, {
      eval: true,
      workerData: { source: pattern.source, flags: pattern.flags, texts, shared }
    })
    let settled = false
    const finish = (): void => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      worker.removeAllListeners()
      void worker.terminate()
      resolve(Array.from(found.subarray(1, Atomics.load(found, 0) + 1)))
    }
    const timer = setTimeout(finish, ms)
    worker.on('message', finish)
    worker.on('error', finish)
    worker.on('exit', finish)
  })
}
