#!/usr/bin/env node
// Live check that the editor tab strip keeps tab geometry stable. Needs a dev build
// started with CDP (MUSTER_CDP_PORT, default 9557); it uses the dev-only window.__store.
// Usage: node config/scripts/check-tab-strip-stability.mjs [--shot out.png] [--pages "A,B"]
import { readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const PORT = Number(process.env.MUSTER_CDP_PORT ?? 9557)
const TOLERANCE_PX = 0.5
const SETTLE_MS = 450
const args = process.argv.slice(2)
const argValue = (flag) => {
  const index = args.indexOf(flag)
  return index >= 0 ? args[index + 1] : undefined
}
const shotPath = argValue('--shot')
const pageTitles = (argValue('--pages') ?? 'Comments probe').split(',').map((t) => t.trim())

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function connect() {
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
  const page = targets.find(
    (t) =>
      t.type === 'page' && !t.url.startsWith('devtools:') && /localhost|index\.html/.test(t.url)
  )
  if (!page) {
    throw new Error(`no renderer page on CDP port ${PORT}`)
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.onopen = resolve
    ws.onerror = reject
  })
  let nextId = 1
  const pending = new Map()
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data)
    const entry = pending.get(message.id)
    if (!entry) {
      return
    }
    pending.delete(message.id)
    if (message.error) {
      entry.reject(new Error(message.error.message))
    } else {
      entry.resolve(message.result)
    }
  }
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++
      pending.set(id, { resolve, reject })
      ws.send(JSON.stringify({ id, method, params }))
    })
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    })
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description ?? 'evaluate failed')
    }
    return result.result.value
  }
  return { ws, send, evaluate }
}

// Runs in the renderer: tab rects, strip viewport and the first close button of each tab.
const SNAP = `(() => {
  const strip = document.querySelector('[data-tab-strip]') ?? document.querySelector('.terminal-tab-strip')
  if (!strip) return null
  const round = (n) => Math.round(n * 10) / 10
  const tabs = [...strip.querySelectorAll('[data-tab-id]')].map((el) => {
    const r = el.getBoundingClientRect()
    const close = el.querySelector('[data-tab-close-button]')?.getBoundingClientRect()
    return { id: el.dataset.tabId, label: (el.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 28), x: round(r.x), w: round(r.width), cy: round(r.y + r.height / 2), closeX: close ? round(close.x) : null }
  })
  const row = strip.closest('[data-tab-group-strip-id]') ?? strip.parentElement
  return { stripX: round(strip.getBoundingClientRect().x), viewport: strip.clientWidth, scrollWidth: strip.scrollWidth, scrollLeft: Math.round(strip.scrollLeft), rowWidth: round(row.getBoundingClientRect().width), tabs }
})()`

const failures = []
const rows = []

function compareStable(step, before, after, ignoreIds = new Set()) {
  let worst = 0
  for (const tab of before.tabs) {
    if (ignoreIds.has(tab.id)) {
      continue
    }
    const next = after.tabs.find((t) => t.id === tab.id)
    if (!next) {
      continue
    }
    worst = Math.max(worst, Math.abs(next.x - tab.x), Math.abs(next.w - tab.w))
  }
  const ok = worst <= TOLERANCE_PX
  rows.push({
    step,
    worstShiftPx: Math.round(worst * 10) / 10,
    widths: after.tabs.map((t) => t.w).join(' '),
    ok
  })
  if (!ok) {
    failures.push(`${step}: tabs moved or resized by ${worst}px`)
  }
}

async function main() {
  const { ws, send, evaluate } = await connect()
  const snap = () => evaluate(SNAP)
  const store = (body) => evaluate(`(() => { const s = window.__store.getState(); ${body} })()`)
  const worktreeId = await store('return s.activeWorktreeId')
  if (!worktreeId || !(await snap())) {
    throw new Error('no active worktree or tab strip in the renderer')
  }
  const worktreePath = worktreeId.split('::')[1] ?? ''
  const openedFileIds = []
  let openedPagesTab = false

  const openFile = async (relativePath, preview) => {
    await store(
      `s.openFile({ filePath: ${JSON.stringify(path.join(worktreePath, relativePath))}, relativePath: ${JSON.stringify(relativePath)}, worktreeId: ${JSON.stringify(worktreeId)}, language: 'plaintext', mode: 'edit' }, { preview: ${preview} })`
    )
    await sleep(SETTLE_MS)
    const id = await store('return s.activeFileId')
    if (id && !openedFileIds.includes(id)) {
      openedFileIds.push(id)
    }
  }
  const click = async (x, y) => {
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
      await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 })
    }
    await sleep(SETTLE_MS)
  }

  const tabBarDir = path.join(worktreePath, 'src/renderer/src/components/tab-bar')
  let files = []
  try {
    files = readdirSync(tabBarDir)
      .filter((f) => /\.tsx?$/.test(f) && !f.includes('.test.'))
      .map((f) => `src/renderer/src/components/tab-bar/${f}`)
  } catch {
    throw new Error(`cannot list ${tabBarDir}; run against a Muster checkout`)
  }

  try {
    let before = await snap()
    await openFile(files[0], false)
    compareStable('open file', before, await snap())
    before = await snap()
    await openFile(files[1], true)
    compareStable('open preview', before, await snap())
    before = await snap()
    await openFile(files[2], true)
    const replacedId = await store('return s.activeFileId')
    compareStable('replace preview', before, await snap(), new Set([replacedId]))

    const pageButton = await evaluate(
      `(() => { const b = [...document.querySelectorAll('button')].find((el) => el.innerText.trim() === ${JSON.stringify(pageTitles[0])}); if (!b) return null; const r = b.getBoundingClientRect(); return r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null })()`
    )
    const hadPagesTab = await store(
      "return s.openFiles.some((o) => o.mode === 'project-pages' && o.worktreeId === s.activeWorktreeId)"
    )
    if (pageButton && !hadPagesTab) {
      before = await snap()
      await click(pageButton.x, pageButton.y)
      const pagesOpened = await store("return s.openFiles.some((o) => o.mode === 'project-pages' && o.worktreeId === s.activeWorktreeId)")
      if (!pagesOpened) {
        // Why: a synthetic pointer click can land before the hidden window repaints; fall back to a DOM click.
        await evaluate(
          `[...document.querySelectorAll('button')].find((el) => el.innerText.trim() === ${JSON.stringify(pageTitles[0])})?.click()`
        )
        await sleep(SETTLE_MS)
      }
      openedPagesTab = true
      compareStable('open Pages tab', before, await snap())
      const pagesFile = await store(
        "const f = s.openFiles.find((o) => o.id === s.activeFileId && o.mode === 'project-pages'); return f ? { id: f.id, pageId: f.projectPages.pageId, label: f.relativePath } : null"
      )
      if (pagesFile) {
        for (const title of [
          'A',
          'A much longer page title for the stability check',
          'Mid title'
        ]) {
          before = await snap()
          await store(
            `s.showProjectPagesTabPage(${JSON.stringify(pagesFile.id)}, ${JSON.stringify(pagesFile.pageId)}, ${JSON.stringify(title)})`
          )
          await sleep(SETTLE_MS)
          compareStable(`Pages label "${title.slice(0, 12)}"`, before, await snap())
        }
      }
    } else {
      rows.push({
        step: 'Pages steps skipped (needs the Pages sidebar and no open Pages tab)',
        worstShiftPx: 0,
        widths: '',
        ok: true
      })
    }

    for (const tab of (await snap()).tabs.slice(0, 4)) {
      before = await snap()
      const current = before.tabs.find((t) => t.id === tab.id)
      await click(current.x + Math.min(current.w / 2, 40), current.cy)
      const after = await snap()
      compareStable(`click ${tab.label.slice(0, 16)}`, before, after)
      if (after.scrollLeft !== before.scrollLeft) {
        failures.push(
          `click ${tab.label}: strip scrolled ${after.scrollLeft - before.scrollLeft}px`
        )
      }
    }

    let stripXBeforeOverflow = (await snap()).stripX
    for (const file of files.slice(3, 40)) {
      const pre = await snap()
      if (pre.scrollWidth > pre.viewport + 1) {
        break
      }
      stripXBeforeOverflow = pre.stripX
      await openFile(file, false)
    }
    const overflowed = await snap()
    const stripShift = Math.abs(overflowed.stripX - stripXBeforeOverflow)
    rows.push({
      step: 'overflow strip left edge',
      worstShiftPx: stripShift,
      widths: `x ${stripXBeforeOverflow} -> ${overflowed.stripX}`,
      ok: stripShift <= TOLERANCE_PX
    })
    if (stripShift > TOLERANCE_PX) {
      failures.push(`overflow moved the strip ${stripShift}px`)
    }

    if (shotPath) {
      const strip = await evaluate(
        "(() => { const r = (document.querySelector('[data-tab-group-strip-id]') ?? document.querySelector('.terminal-tab-strip')).getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } })()"
      )
      const shot = await send('Page.captureScreenshot', {
        format: 'png',
        clip: { ...strip, scale: 1 }
      })
      writeFileSync(shotPath, Buffer.from(shot.data, 'base64'))
    }

    for (const mode of ['overflowed', 'fitting']) {
      for (let i = 0; i < 3; i++) {
        const pre = await snap()
        const index = Math.min(pre.tabs.length - 2, 5)
        const target = pre.tabs[index]
        const entityId = await store(
          `return (s.unifiedTabsByWorktree[s.activeWorktreeId] ?? []).find((t) => t.id === ${JSON.stringify(target?.id ?? '')})?.entityId ?? null`
        )
        if (!target || target.closeX === null || !openedFileIds.includes(entityId)) {
          break
        }
        const closeBox = await evaluate(
          `(() => { const b = document.querySelector('[data-tab-id="${target.id}"] [data-tab-close-button]').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 } })()`
        )
        await click(closeBox.x, closeBox.y)
        const post = await snap()
        const next = post.tabs[index]
        const drift = next?.closeX === null || !next ? 0 : Math.abs(next.closeX - target.closeX)
        rows.push({
          step: `close (${mode}) ${target.label.slice(0, 14)}`,
          worstShiftPx: Math.round(drift * 10) / 10,
          widths: `close x ${target.closeX} -> ${next?.closeX}`,
          ok: drift <= TOLERANCE_PX
        })
        if (drift > TOLERANCE_PX) {
          failures.push(`close ${target.label}: next close button moved ${drift}px`)
        }
        openedFileIds.splice(openedFileIds.indexOf(entityId), 1)
      }
      while (mode === 'overflowed') {
        const pre = await snap()
        if (pre.scrollWidth <= pre.viewport + 1 || openedFileIds.length === 0) {
          break
        }
        await store(`s.closeFile(${JSON.stringify(openedFileIds.pop())})`)
        await sleep(150)
      }
    }
  } finally {
    await store(
      `for (const id of ${JSON.stringify(openedFileIds)}) { if (s.openFiles.some((f) => f.id === id && !f.isDirty)) s.closeFile(id) }`
    )
    if (openedPagesTab) {
      await store(
        "const f = s.openFiles.find((o) => o.mode === 'project-pages' && o.worktreeId === s.activeWorktreeId); if (f) s.closeFile(f.id)"
      )
    }
    ws.close()
  }

  console.table(rows)
  if (failures.length > 0) {
    console.error(`\n${failures.length} stability failure(s):\n- ${failures.join('\n- ')}`)
    process.exit(1)
  }
  console.log('\nTab strip geometry stable.')
}

main().catch((error) => {
  console.error(error.message)
  process.exit(2)
})
