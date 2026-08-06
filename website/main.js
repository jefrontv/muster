/* Muster site behaviour.
 *
 * Motion policy: every animation below is progressive. The stylesheet only hides an element when the
 * page has JS AND the reader allows motion, so a no-JS or reduced-motion visitor gets the finished
 * page with no blank panels. If GSAP fails to load, `reveal()` falls back to simply showing things.
 *
 * Each section gets its own treatment rather than one global fade, because each is doing a different
 * job: the hero announces, the model explains a sequence, the steps track progress, the spec is a
 * table you scan. */

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
const gsap = window.gsap
const hasGsap = Boolean(gsap) && !reduceMotion.matches

if (hasGsap && window.ScrollTrigger) {
  gsap.registerPlugin(window.ScrollTrigger)
}

/** Mark the elements GSAP will animate in, so CSS can hide only those. */
function arm(selector) {
  const nodes = [...document.querySelectorAll(selector)]
  if (hasGsap) {
    for (const node of nodes) {
      node.classList.add('anim')
    }
  }
  return nodes
}

/**
 * Animate armed elements IN.
 *
 * Deliberately fromTo rather than from: the stylesheet hides `.anim` at opacity 0, and a plain
 * gsap.from() reads that hidden value as the tween's END state — so the element animates 0 → 0 and
 * never appears. An explicit end state is the only safe pairing with CSS pre-hiding.
 */
function animIn(targets, from = {}, to = {}) {
  const nodes = Array.isArray(targets) ? targets : [...document.querySelectorAll(targets)]
  if (nodes.length === 0) {
    return null
  }
  // The `.anim` class is dropped on completion rather than clearing inline opacity: clearProps
  // would hand control back to that class, which hides the element again the moment it lands.
  const settle = () => {
    for (const node of nodes) {
      node.classList.remove('anim')
    }
  }
  return gsap.fromTo(
    nodes,
    { opacity: 0, ...from },
    {
      opacity: 1,
      y: 0,
      x: 0,
      yPercent: 0,
      duration: 0.7,
      ease: 'expo.out',
      clearProps: 'transform',
      onComplete: settle,
      ...to
    }
  )
}

/* ------------------------------------------------------------------ hero */
function heroIntro() {
  const lines = arm('.display .line > span')
  arm('.hero .strip, .hero .lede, .hero .figures, .hero .cta > *')
  if (!hasGsap) {
    return
  }

  const tl = gsap.timeline({ defaults: { ease: 'expo.out' } })

  // The type is the hero: lines rise into their own mask window, first and alone.
  tl.add(animIn(lines, { yPercent: 118 }, { duration: 1.05, stagger: 0.09 }))
    .add(animIn('.hero .strip', { x: -14 }, { duration: 0.6 }), 0.15)
    .add(animIn('.hero .lede', { y: 16 }, { duration: 0.8 }), 0.5)
    .add(animIn('.hero .figures', {}, { duration: 0.5 }), 0.62)
    .fromTo(
      '.hero .figures > div',
      { y: 22 },
      { y: 0, duration: 0.7, stagger: 0.07, ease: 'expo.out', clearProps: 'transform' },
      0.62
    )
    .add(animIn('.hero .cta > *', { y: 14 }, { duration: 0.6, stagger: 0.07 }), 0.85)
}

/* ------------------------------------------------------------------ generic panels */
function panelReveals() {
  if (!hasGsap) {
    return
  }

  // Section headers: designator slides, heading settles, note follows.
  for (const head of document.querySelectorAll('.phead')) {
    const parts = [...head.children]
    for (const part of parts) {
      part.classList.add('anim')
    }
    gsap
      .timeline({ scrollTrigger: { trigger: head, start: 'top 82%' } })
      .add(animIn(parts, { y: 18 }, { stagger: 0.08 }))
  }

  // Grids of framed cells: the FRAME fades in as one unit and the cells only travel. Fading the
  // cells individually left the frame's 1px-gap background visible as a grey slab beforehand.
  for (const grid of document.querySelectorAll('.cap-grid, .tiles, .tool-groups')) {
    if (grid.closest('.hero')) {
      continue
    }
    const cells = [...grid.children]
    grid.classList.add('anim')
    gsap
      .timeline({ scrollTrigger: { trigger: grid, start: 'top 82%' } })
      .add(animIn([grid], {}, { duration: 0.55 }))
      .fromTo(
        cells,
        { y: 26 },
        { y: 0, duration: 0.7, stagger: 0.06, ease: 'expo.out', clearProps: 'transform' },
        0
      )
  }

  // Spec rows: scanned top to bottom, so they arrive that way, quickly.
  const rows = [...document.querySelectorAll('.spec tr')]
  if (rows.length) {
    for (const row of rows) {
      row.classList.add('anim')
    }
    gsap
      .timeline({ scrollTrigger: { trigger: '.spec', start: 'top 78%' } })
      .add(animIn(rows, { x: -14 }, { duration: 0.4, stagger: 0.035, ease: 'power2.out' }))
  }

  // FAQ entries.
  const faqs = [...document.querySelectorAll('.faq details')]
  if (faqs.length) {
    for (const item of faqs) {
      item.classList.add('anim')
    }
    gsap
      .timeline({ scrollTrigger: { trigger: '.faq', start: 'top 80%' } })
      .add(animIn(faqs, { y: 12 }, { duration: 0.45, stagger: 0.05, ease: 'power2.out' }))
  }
}

/* ------------------------------------------------------------------ phases */
function phaseSequence() {
  const phases = [...document.querySelectorAll('.phase')]
  if (phases.length === 0) {
    return
  }

  if (!hasGsap || !window.ScrollTrigger) {
    phases[0]?.classList.add('is-live')
    return
  }

  // One live phase at a time, chosen from the list's own progress. Per-phase triggers overlapped
  // and lit two rows at once, which broke the "this is the current step" reading.
  let livePhase = -1
  const setLive = (index) => {
    const clamped = Math.max(0, Math.min(phases.length - 1, index))
    if (clamped === livePhase) {
      return
    }
    livePhase = clamped
    phases.forEach((phase, i) => phase.classList.toggle('is-live', i === clamped))
    setBoardPhase(clamped)
  }

  window.ScrollTrigger.create({
    trigger: '.phase-list',
    start: 'top 70%',
    end: 'bottom 55%',
    onUpdate: (self) => setLive(Math.floor(self.progress * phases.length)),
    onEnter: () => setLive(0),
    onLeaveBack: () => setLive(0)
  })

  for (const phase of phases) {
    phase.classList.add('anim')
  }
  gsap
    .timeline({ scrollTrigger: { trigger: '.phase-list', start: 'top 82%' } })
    .add(animIn(phases, { y: 20 }, { duration: 0.6, stagger: 0.08 }))

  const board = document.querySelector('.board')
  if (board) {
    board.classList.add('anim')
    gsap
      .timeline({ scrollTrigger: { trigger: board, start: 'top 85%' } })
      .add(animIn([board], { y: 26 }, { duration: 0.8 }))
  }
}

/* ------------------------------------------------------------------ board */
const BRANCHES = [
  'feat/checkout-rewrite',
  'fix/cart-total',
  'chore/dep-bumps',
  'feat/admin-search',
  'fix/cache-headers',
  'roads-australia · deploy',
  'feat/mobile-nav',
  'fix/invoice-pdf'
]

let setBoardPhase = () => {}

function initBoard() {
  const list = document.querySelector('[data-board-rows]')
  const queue = document.querySelector('[data-board-queue]')
  const count = document.querySelector('[data-board-count]')
  if (!list) {
    return
  }

  const rows = Array.from({ length: 4 }, (_, index) => {
    const li = document.createElement('li')
    li.className = 'brow'
    li.innerHTML =
      '<span class="m"></span><span class="b"></span><span class="s"></span>' +
      '<span class="p"><i></i></span>'
    list.append(li)
    return {
      el: li,
      branch: li.querySelector('.b'),
      state: li.querySelector('.s'),
      fill: li.querySelector('.p i'),
      name: BRANCHES[index],
      progress: 0.1 + index * 0.16,
      speed: 0.055 + Math.random() * 0.08,
      status: 'working',
      hold: 0
    }
  })

  function paint() {
    for (const row of rows) {
      row.branch.textContent = row.name
      row.el.dataset.state = row.status
      row.state.textContent = row.status === 'answered' ? 'Needs you' : 'Working'
      row.fill.style.width = `${Math.round(row.progress * 100)}%`
    }
    const waiting = rows.filter((row) => row.status === 'answered').length
    if (queue) {
      queue.textContent = String(waiting)
    }
    if (count) {
      count.textContent = `${rows.length} active`
    }
  }

  // Phase 01 creates, 02 runs, 03 has something waiting — the board illustrates the live phase.
  setBoardPhase = (phase) => {
    if (phase === 0) {
      rows.forEach((row, index) => {
        row.status = 'working'
        row.progress = index === 0 ? 0.02 : 0
      })
    } else if (phase === 1) {
      rows.forEach((row, index) => {
        row.status = 'working'
        row.progress = 0.2 + index * 0.14
      })
    } else {
      rows.forEach((row, index) => {
        row.status = index === 1 ? 'answered' : 'working'
        row.progress = index === 1 ? 1 : 0.35 + index * 0.13
      })
    }
    paint()
  }

  paint()
  if (reduceMotion.matches) {
    return
  }

  let timer = null
  function tick() {
    for (const row of rows) {
      if (row.status === 'answered') {
        row.hold -= 1
        if (row.hold <= 0) {
          row.status = 'working'
          row.progress = 0
          row.speed = 0.055 + Math.random() * 0.08
          row.name = BRANCHES[(BRANCHES.indexOf(row.name) + 4) % BRANCHES.length]
        }
        continue
      }
      row.progress = Math.min(1, row.progress + row.speed)
      if (row.progress >= 1) {
        row.status = 'answered'
        row.hold = 3 + Math.floor(Math.random() * 3)
      }
    }
    paint()
  }

  const start = () => {
    if (timer === null) {
      timer = window.setInterval(tick, 950)
    }
  }
  const stop = () => {
    if (timer !== null) {
      window.clearInterval(timer)
      timer = null
    }
  }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            start()
          } else {
            stop()
          }
        }
      },
      { threshold: 0 }
    ).observe(list)
  } else {
    start()
  }

  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()))
}

/* ------------------------------------------------------------------ steps */
function stepProgress() {
  const steps = [...document.querySelectorAll('.step')]
  const fill = document.querySelector('[data-steps-fill]')
  if (steps.length === 0) {
    return
  }

  if (!hasGsap || !window.ScrollTrigger) {
    if (fill) {
      fill.style.transform = 'scaleY(1)'
    }
    for (const step of steps) {
      step.classList.add('is-active')
    }
    return
  }

  for (const step of steps) {
    step.classList.add('anim')
  }
  gsap
    .timeline({ scrollTrigger: { trigger: '.steps', start: 'top 78%' } })
    .add(animIn(steps, { y: 24 }, { duration: 0.6, stagger: 0.1 }))

  if (fill) {
    // Scrubbed: the spine is a progress indicator through a real sequence, not a flourish.
    gsap.to(fill, {
      scaleY: 1,
      ease: 'none',
      scrollTrigger: {
        trigger: '.steps',
        start: 'top 62%',
        end: 'bottom 72%',
        scrub: 0.4
      }
    })
  }

  for (const step of steps) {
    window.ScrollTrigger.create({
      trigger: step,
      start: 'top 68%',
      end: 'bottom 40%',
      onToggle: (self) => step.classList.toggle('is-active', self.isActive)
    })
  }
}

/* ------------------------------------------------------------------ counters */
function counters() {
  const figures = [...document.querySelectorAll('[data-count]')]
  if (figures.length === 0 || !hasGsap || !window.ScrollTrigger) {
    return
  }

  for (const figure of figures) {
    const target = Number(figure.dataset.count)
    if (!Number.isFinite(target)) {
      continue
    }
    const state = { value: 0 }
    gsap.to(state, {
      value: target,
      duration: 1.1,
      ease: 'power2.out',
      scrollTrigger: { trigger: figure, start: 'top 92%', once: true },
      onUpdate: () => {
        figure.textContent = String(Math.round(state.value))
      }
    })
  }
}

/* ------------------------------------------------------------------ index nav */
function indexNav() {
  const links = new Map(
    [...document.querySelectorAll('.index-nav a')].map((a) => [a.getAttribute('href').slice(1), a])
  )
  const sections = [...document.querySelectorAll('.panel[id]')].filter((s) => links.has(s.id))
  if (sections.length === 0 || !('IntersectionObserver' in window)) {
    return
  }

  const visible = new Set()
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          visible.add(entry.target.id)
        } else {
          visible.delete(entry.target.id)
        }
      }
      const current = sections.find((section) => visible.has(section.id))
      for (const [id, link] of links) {
        if (current && current.id === id) {
          link.setAttribute('aria-current', 'true')
        } else {
          link.removeAttribute('aria-current')
        }
      }
    },
    { rootMargin: '-20% 0px -70% 0px' }
  )
  for (const section of sections) {
    observer.observe(section)
  }
}

/* ------------------------------------------------------------------ copy */
function copyButtons() {
  for (const button of document.querySelectorAll('.copy')) {
    button.addEventListener('click', async () => {
      const text = button.dataset.copy
      if (!text) {
        return
      }
      try {
        await navigator.clipboard.writeText(text)
        button.textContent = 'Copied'
        button.dataset.state = 'copied'
      } catch {
        // Clipboard access can be refused; say what to do instead of claiming success.
        button.textContent = 'Select it'
      }
      window.setTimeout(() => {
        button.textContent = 'Copy'
        delete button.dataset.state
      }, 2000)
    })
  }
}

/* ------------------------------------------------------------------ magnetic */
function magnetic() {
  if (!hasGsap) {
    return
  }
  for (const el of document.querySelectorAll('.magnetic')) {
    const move = (event) => {
      const rect = el.getBoundingClientRect()
      gsap.to(el, {
        x: ((event.clientX - rect.left) / rect.width - 0.5) * 10,
        y: ((event.clientY - rect.top) / rect.height - 0.5) * 6,
        duration: 0.4,
        ease: 'power3.out'
      })
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerleave', () => {
      gsap.to(el, { x: 0, y: 0, duration: 0.5, ease: 'elastic.out(1, 0.5)' })
    })
  }
}

/* ------------------------------------------------------------------ lanes canvas */
function readPalette() {
  const styles = getComputedStyle(document.documentElement)
  const pick = (name, fallback) => styles.getPropertyValue(name).trim() || fallback
  return {
    lane: pick('--rule', '#1e1e2a'),
    muted: pick('--faint', '#64647a'),
    signal: pick('--signal', '#22d3ee')
  }
}

function initLanes() {
  const canvas = document.querySelector('.lanes')
  const ctx = canvas?.getContext('2d')
  if (!canvas || !ctx) {
    return
  }

  let palette = readPalette()
  let width = 0
  let height = 0
  let lanes = []
  let rafId = null

  function build() {
    const total = window.innerWidth < 640 ? 5 : 8
    lanes = Array.from({ length: total }, (_, index) => ({
      branch: BRANCHES[index % BRANCHES.length],
      speed: 0.018 + Math.random() * 0.045,
      progress: Math.random(),
      reviewAt: 0.5 + Math.random() * 0.42,
      state: 'working',
      hold: 0,
      y: ((index + 1) / (total + 1)) * height
    }))
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const rect = canvas.getBoundingClientRect()
    width = rect.width
    height = rect.height
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    palette = readPalette()
    build()
    draw(0)
  }

  function step(dt) {
    for (const lane of lanes) {
      if (lane.state === 'answered') {
        lane.hold -= dt
        if (lane.hold <= 0) {
          lane.progress = 0
          lane.state = 'working'
          lane.speed = 0.018 + Math.random() * 0.045
          lane.reviewAt = 0.5 + Math.random() * 0.42
          lane.branch = BRANCHES[Math.floor(Math.random() * BRANCHES.length)]
        }
        continue
      }
      lane.progress += lane.speed * dt
      if (lane.progress >= lane.reviewAt) {
        lane.progress = lane.reviewAt
        lane.state = 'answered'
        lane.hold = 1.5 + Math.random() * 1.8
      }
    }
  }

  function draw(time) {
    ctx.clearRect(0, 0, width, height)
    const left = Math.min(width * 0.06, 90)
    const right = width - left

    for (const lane of lanes) {
      const y = lane.y
      const x = left + (right - left) * lane.progress
      const answered = lane.state === 'answered'

      ctx.strokeStyle = palette.lane
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(left, y)
      ctx.lineTo(right, y)
      ctx.stroke()

      ctx.strokeStyle = answered ? palette.signal : palette.muted
      ctx.globalAlpha = answered ? 0.7 : 0.3
      ctx.lineWidth = answered ? 1.6 : 1.1
      ctx.beginPath()
      ctx.moveTo(left, y)
      ctx.lineTo(x, y)
      ctx.stroke()
      ctx.globalAlpha = 1

      const r = answered ? 3.2 + Math.sin(time / 340) * 0.8 : 2.2
      if (answered) {
        ctx.fillStyle = palette.signal
        ctx.globalAlpha = 0.15
        ctx.beginPath()
        ctx.arc(x, y, r * 3.4, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
      }
      ctx.fillStyle = answered ? palette.signal : palette.muted
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  let last = performance.now()
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05)
    last = now
    step(dt)
    draw(now)
    rafId = window.requestAnimationFrame(frame)
  }

  const start = () => {
    if (rafId === null && !reduceMotion.matches) {
      last = performance.now()
      rafId = window.requestAnimationFrame(frame)
    }
  }
  const stop = () => {
    if (rafId !== null) {
      window.cancelAnimationFrame(rafId)
      rafId = null
    }
  }

  resize()
  window.addEventListener('resize', resize)

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            start()
          } else {
            stop()
          }
        }
      },
      { threshold: 0 }
    ).observe(canvas)
  } else {
    start()
  }

  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()))

  // A theme change rewrites every colour the simulation draws with.
  new MutationObserver(() => {
    palette = readPalette()
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    palette = readPalette()
  })
}

/* ------------------------------------------------------------ app window
 * The hero's recreation of the app: rail rows change status, the terminal
 * types a session, the ctx bar creeps. Reduced motion gets the finished
 * transcript with no typing. */
function initAppWindow() {
  const root = document.querySelector('[data-app]')
  const tree = document.querySelector('[data-app-tree]')
  const lines = document.querySelector('[data-app-lines]')
  if (!root || !tree || !lines) {
    return
  }

  const RAIL = [
    {
      proj: 'roads-australia',
      ws: [{ name: 'fix/cart-total', on: true }, { name: 'feat/admin-search' }]
    },
    { proj: 'orleton-om', ws: [{ name: 'feat/mobile-nav' }] }
  ]
  const dots = []
  for (const group of RAIL) {
    const proj = document.createElement('li')
    proj.className = 'proj'
    proj.textContent = group.proj
    tree.append(proj)
    for (const ws of group.ws) {
      const li = document.createElement('li')
      li.className = ws.on ? 'ws on' : 'ws'
      const dot = document.createElement('span')
      dot.className = 'app-dot'
      li.append(dot, document.createTextNode(ws.name))
      tree.append(li)
      dots.push(dot)
    }
  }

  // One terminal session, as the app renders it.
  const SCRIPT = [
    '<span class="u">❯ fix the cart total rounding on checkout</span>',
    '<span class="t">●</span> Read src/cart/totals.ts',
    '<span class="t">●</span> Edit src/cart/totals.ts <span class="dim">— round once, at display</span>',
    '<span class="t">●</span> Bash npm test -- totals',
    '<span class="ok">  ✓ 14 passed</span>',
    '<span class="sig">✳</span> Done — 2 files changed, ready to review'
  ]

  const ctxFill = document.querySelector('[data-app-ctx]')
  const ctxPct = document.querySelector('[data-app-pct]')

  function renderStatic() {
    lines.innerHTML = SCRIPT.map((html) => `<div class="app-line">${html}</div>`).join('')
    if (ctxFill && ctxPct) {
      ctxFill.style.width = '9%'
      ctxPct.textContent = '9%'
    }
  }

  if (reduceMotion.matches) {
    renderStatic()
    return
  }

  let shown = 0
  let ctx = 4
  let timer = null
  let holding = 0

  function step() {
    if (holding > 0) {
      // Hold the finished transcript for a few beats, then run the session again.
      holding -= 1
      if (holding === 0) {
        shown = 0
        ctx = 4
        lines.innerHTML = ''
        paintCtx()
      }
      return
    }
    if (shown >= SCRIPT.length) {
      holding = 4
      return
    }
    const div = document.createElement('div')
    div.className = 'app-line'
    div.innerHTML = `${SCRIPT[shown]}<span class="app-caret"></span>`
    const prev = lines.querySelector('.app-caret')
    if (prev) {
      prev.remove()
    }
    lines.append(div)
    shown += 1
    ctx += 1 + Math.floor(Math.random() * 2)
    paintCtx()
    // A finished line flips the active workspace dot to "needs you".
    if (shown === SCRIPT.length && dots[0]) {
      dots[0].dataset.s = 'answered'
    } else if (dots[0]) {
      delete dots[0].dataset.s
    }
  }

  function paintCtx() {
    if (ctxFill && ctxPct) {
      ctxFill.style.width = `${ctx}%`
      ctxPct.textContent = `${ctx}%`
    }
  }

  // The idle workspaces drift between working and waiting so the rail feels alive.
  function drift() {
    for (const dot of dots.slice(1)) {
      if (Math.random() < 0.25) {
        dot.dataset.s = dot.dataset.s === 'answered' ? '' : 'answered'
        if (dot.dataset.s === '') {
          delete dot.dataset.s
        }
      }
    }
  }

  let driftTimer = null
  const start = () => {
    if (timer === null) {
      timer = window.setInterval(step, 1150)
      driftTimer = window.setInterval(drift, 2400)
    }
  }
  const stop = () => {
    if (timer !== null) {
      window.clearInterval(timer)
      window.clearInterval(driftTimer)
      timer = null
      driftTimer = null
    }
  }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            start()
          } else {
            stop()
          }
        }
      },
      { threshold: 0 }
    ).observe(root)
  } else {
    start()
  }
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()))
}

/* ------------------------------------------------------------ feature mocks
 * The dashboard, run-log and usage visuals. Same rules as the app window:
 * loop only while visible, and reduced motion gets the finished state. */

/** Run `tick` on an interval only while `el` is on screen. */
function whileVisible(el, tick, ms) {
  let timer = null
  const start = () => {
    if (timer === null) {
      timer = window.setInterval(tick, ms)
    }
  }
  const stop = () => {
    if (timer !== null) {
      window.clearInterval(timer)
      timer = null
    }
  }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            start()
          } else {
            stop()
          }
        }
      },
      { threshold: 0 }
    ).observe(el)
  } else {
    start()
  }
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()))
}

function initAgentBoard() {
  const list = document.querySelector('[data-agent-rows]')
  if (!list) {
    return
  }

  const AGENTS = [
    {
      name: 'Claude Code',
      steps: ['Edit src/cart/totals.ts', 'Bash npm test -- totals', 'Read src/checkout/form.tsx']
    },
    {
      name: 'Codex',
      steps: ['Grep "invoice_total"', 'Edit app/models/invoice.rb', 'Bash bundle exec rspec']
    },
    {
      name: 'Gemini',
      steps: ['Read docs/deploy.md', 'Bash git diff --stat', 'Edit config/nginx.conf']
    },
    { name: 'OpenCode', steps: ['Bash pnpm build', 'Read vite.config.ts', 'Edit src/router.ts'] }
  ]

  const rows = AGENTS.map((agent, index) => {
    const li = document.createElement('li')
    li.className = 'arow'
    li.innerHTML =
      '<span class="arow-dot"></span>' +
      '<span class="arow-main"><span class="arow-name"></span><br /><span class="arow-step"></span></span>' +
      '<span class="arow-state"></span>'
    li.querySelector('.arow-name').textContent = agent.name
    list.append(li)
    return {
      el: li,
      step: li.querySelector('.arow-step'),
      state: li.querySelector('.arow-state'),
      agent,
      at: index,
      waiting: false
    }
  })

  const count = document.querySelector('[data-agent-count]')
  function paint() {
    for (const row of rows) {
      row.step.textContent = row.waiting
        ? 'stopped — waiting on you'
        : row.agent.steps[row.at % row.agent.steps.length]
      row.state.textContent = row.waiting ? 'Needs you' : 'Working'
      if (row.waiting) {
        row.el.dataset.state = 'answered'
      } else {
        delete row.el.dataset.state
      }
    }
    if (count) {
      const busy = rows.filter((row) => !row.waiting).length
      count.textContent = `${busy} running`
    }
  }

  paint()
  if (reduceMotion.matches) {
    rows[1].waiting = true
    paint()
    return
  }

  whileVisible(
    list,
    () => {
      for (const row of rows) {
        if (row.waiting) {
          if (Math.random() < 0.35) {
            row.waiting = false
            row.at += 1
          }
        } else if (Math.random() < 0.18) {
          row.waiting = true
        } else if (Math.random() < 0.55) {
          row.at += 1
        }
      }
      paint()
    },
    1400
  )
}

function initUsageBars() {
  const bars = [...document.querySelectorAll('[data-us]')]
  if (bars.length === 0) {
    return
  }
  const fill = () => {
    for (const bar of bars) {
      bar.style.width = `${bar.dataset.us}%`
    }
  }
  if (reduceMotion.matches || !('IntersectionObserver' in window)) {
    fill()
    return
  }
  const io = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) {
      fill()
      io.disconnect()
    }
  })
  io.observe(bars[0])
}

function initRunLog() {
  const root = document.querySelector('.runlog')
  if (!root) {
    return
  }
  const steps = [...root.querySelectorAll('[data-step]')]
  const tail = root.querySelector('[data-run-tail]')
  const state = root.querySelector('[data-run-state]')

  const LOG = [
    ['$ git pull --ff-only', 'Updating 4d9b57b..ad752b3', 'Fast-forward · 12 files changed'],
    ['$ wp cache flush', 'Success: The cache was flushed.'],
    ['rsync dist/ → themes/roads/dist', 'sent 214 files · 3.1 MB', 'deploy complete ✓']
  ]

  function renderDone() {
    for (const step of steps) {
      step.setAttribute('data-done', '')
      step.removeAttribute('data-on')
    }
    if (tail) {
      tail.innerHTML = LOG.flat()
        .slice(-4)
        .map((line) => `<div>${line}</div>`)
        .join('')
    }
    if (state) {
      state.textContent = 'succeeded'
    }
  }

  if (reduceMotion.matches) {
    renderDone()
    return
  }

  let at = 0 // 0..steps*2: even = start step, odd = finish step
  whileVisible(
    root,
    () => {
      const total = steps.length * 2
      if (at >= total + 2) {
        // hold, then restart
        at = 0
        for (const step of steps) {
          step.removeAttribute('data-done')
          step.removeAttribute('data-on')
        }
        if (tail) {
          tail.innerHTML = ''
        }
        if (state) {
          state.textContent = 'running'
        }
        return
      }
      const index = Math.floor(at / 2)
      if (at % 2 === 0 && index < steps.length) {
        steps[index].setAttribute('data-on', '')
        if (tail && LOG[index]) {
          tail.innerHTML = LOG[index].map((line) => `<div>${line}</div>`).join('')
        }
      } else if (index < steps.length) {
        steps[index].removeAttribute('data-on')
        steps[index].setAttribute('data-done', '')
      }
      if (state && at === total) {
        state.textContent = 'succeeded'
      }
      at += 1
    },
    1300
  )
}

function featureReveals() {
  if (!hasGsap) {
    return
  }
  for (const feature of document.querySelectorAll('.feature')) {
    // Copy slides in; the mock only fades here — its travel belongs to the
    // parallax scrub in scrollFlourishes, and two tweens on one y fight.
    const copy = feature.querySelector('.feature-copy')
    const mock = feature.querySelector('.mock')
    if (copy) {
      copy.classList.add('anim')
      gsap
        .timeline({ scrollTrigger: { trigger: feature, start: 'top 80%' } })
        .add(animIn([copy], { y: 26 }, { duration: 0.75 }))
    }
    if (mock) {
      mock.classList.add('anim')
      gsap.fromTo(
        mock,
        { opacity: 0 },
        {
          opacity: 1,
          duration: 0.9,
          ease: 'power2.out',
          onComplete: () => mock.classList.remove('anim'),
          scrollTrigger: { trigger: feature, start: 'top 80%' }
        }
      )
    }
  }
}

/* ------------------------------------------------------------ scroll flourishes
 * The scrub layer: reading progress, parallax on the product mocks, and small
 * cascades inside them. All gated on hasGsap, so reduced motion skips the lot. */
function scrollFlourishes() {
  if (!hasGsap || !window.ScrollTrigger) {
    return
  }

  // Reading progress along the very top edge.
  const progress = document.createElement('div')
  progress.className = 'scroll-progress'
  document.body.append(progress)
  gsap.to(progress, {
    scaleX: 1,
    ease: 'none',
    scrollTrigger: { start: 0, end: 'max', scrub: 0.4 }
  })

  // Product mocks drift slower than the page — depth without theatrics.
  for (const mock of document.querySelectorAll('.feature .mock')) {
    gsap.fromTo(
      mock,
      { y: 44 },
      {
        y: -28,
        ease: 'none',
        scrollTrigger: {
          trigger: mock.parentElement,
          start: 'top bottom',
          end: 'bottom top',
          scrub: 0.5
        }
      }
    )
  }

  // The hero app window recedes slightly as it scrolls away.
  const app = document.querySelector('.hero .app')
  if (app) {
    gsap.to(app, {
      y: -36,
      scale: 0.985,
      ease: 'none',
      scrollTrigger: { trigger: app, start: 'top 60%', end: 'bottom top', scrub: 0.5 }
    })
  }

  // Section designator rules draw themselves in.
  for (const strip of document.querySelectorAll('.strip')) {
    window.ScrollTrigger.create({
      trigger: strip,
      start: 'top 88%',
      once: true,
      onEnter: () => strip.classList.add('grown')
    })
  }

  // Agent chips scatter in.
  const chips = [...document.querySelectorAll('.chips li')]
  if (chips.length) {
    for (const chip of chips) {
      chip.classList.add('anim')
    }
    gsap
      .timeline({ scrollTrigger: { trigger: '.chips', start: 'top 88%' } })
      .add(
        animIn(
          chips,
          { y: 10, scale: 0.9 },
          { duration: 0.4, stagger: 0.03, ease: 'back.out(1.6)' }
        )
      )
  }

  // Inside the diff mock: lines land first, then the comment card.
  const diffLines = [...document.querySelectorAll('.diff-lines li')]
  const diffComment = document.querySelector('.diff-comment')
  if (diffLines.length) {
    for (const line of diffLines) {
      line.classList.add('anim')
    }
    if (diffComment) {
      diffComment.classList.add('anim')
    }
    const tl = gsap
      .timeline({ scrollTrigger: { trigger: '.diff', start: 'top 82%' } })
      .add(animIn(diffLines, { x: -16 }, { duration: 0.4, stagger: 0.1, ease: 'power2.out' }), 0.15)
    if (diffComment) {
      tl.add(
        animIn([diffComment], { y: 12, scale: 0.97 }, { duration: 0.5, ease: 'back.out(1.4)' }),
        '-=0.1'
      )
    }
  }

  // Task rows cascade.
  const taskRows = [...document.querySelectorAll('.tasks-rows li, .tasks-group, .tasks-foot')]
  if (taskRows.length) {
    for (const row of taskRows) {
      row.classList.add('anim')
    }
    gsap
      .timeline({ scrollTrigger: { trigger: '.tasks', start: 'top 82%' } })
      .add(animIn(taskRows, { x: -14 }, { duration: 0.35, stagger: 0.05, ease: 'power2.out' }), 0.1)
  }

  // Automation cards stack in.
  const autoCards = [...document.querySelectorAll('.auto-card')]
  if (autoCards.length) {
    for (const card of autoCards) {
      card.classList.add('anim')
    }
    gsap
      .timeline({ scrollTrigger: { trigger: '.autos', start: 'top 84%' } })
      .add(animIn(autoCards, { y: 18 }, { duration: 0.55, stagger: 0.12 }), 0.1)
  }
}

/* ------------------------------------------------------------------ boot */
heroIntro()
panelReveals()
initBoard()
initAppWindow()
initAgentBoard()
initUsageBars()
initRunLog()
featureReveals()
scrollFlourishes()
phaseSequence()
stepProgress()
counters()
indexNav()
copyButtons()
magnetic()
initLanes()

/* ------------------------------------------------------------------ live release
 * The page claims the download is always current, so it should be able to say WHICH build that is.
 * Read from the public releases API; a rate limit, an offline visitor or a private repo simply
 * leaves the slot hidden rather than showing a stale number baked in at build time. */
async function liveRelease() {
  const slot = document.querySelector('[data-version]')
  if (!slot) {
    return
  }
  // The PHP page prints the version server-side, where crawlers and no-JS readers can see it. When
  // it has already done so, this fetch is pure waste — and worse, it would spend the visitor's own
  // GitHub rate limit to arrive at the same answer. Only the static build reaches past this.
  if (!slot.hidden) {
    return
  }
  try {
    const response = await fetch('https://api.github.com/repos/jefrontv/muster/releases/latest', {
      headers: { Accept: 'application/vnd.github+json' }
    })
    if (!response.ok) {
      return
    }
    const release = await response.json()
    const tag = typeof release.tag_name === 'string' ? release.tag_name.replace(/^v/, '') : ''
    if (!tag) {
      return
    }
    const value = slot.querySelector('b')
    if (value) {
      value.textContent = tag
    }
    slot.hidden = false
  } catch {
    // Offline or blocked: the download links still work, so say nothing.
  }
}

/* ------------------------------------------------------------------ chip detection
 * Removes a decision the reader should not have to make. Only claims a match when the GPU string
 * actually names an Apple chip — `navigator.platform` reports "MacIntel" on Apple Silicon too, so
 * trusting it would send half the team to the wrong build. Anything ambiguous is left alone. */
function detectChip() {
  const isMac = /Mac/i.test(navigator.userAgent)
  if (!isMac) {
    return null
  }
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
    if (!gl) {
      return null
    }
    const info = gl.getExtension('WEBGL_debug_renderer_info')
    const renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : ''
    if (/Apple\s+M\d/i.test(renderer)) {
      return 'arm64'
    }
    if (/Intel|AMD|Radeon/i.test(renderer)) {
      return 'x64'
    }
  } catch {
    // WebGL blocked; fall through to no claim.
  }
  return null
}

function markDetectedBuild() {
  const chip = detectChip()
  if (!chip) {
    return
  }
  const wanted = chip === 'arm64' ? 'arm64' : 'x64'
  for (const link of document.querySelectorAll('a[href*="muster-macos-"]')) {
    if (!link.href.includes(`muster-macos-${wanted}`)) {
      continue
    }
    if (link.querySelector('.detected') || link.classList.contains('index-dl')) {
      continue
    }
    const badge = document.createElement('span')
    badge.className = 'detected'
    badge.textContent = 'your Mac'
    link.append(badge)
  }
}

liveRelease()
markDetectedBuild()

/* og:image has to be an absolute URL for a crawler to fetch it, and this page has no fixed host
 * yet — so it is resolved against wherever the page is actually being served from. */
const ogImage = document.querySelector('[data-og-image]')
if (ogImage) {
  ogImage.setAttribute('content', new URL('assets/og.png', document.baseURI).href)
}
