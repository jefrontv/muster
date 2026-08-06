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

/* ------------------------------------------------------------------ boot */
heroIntro()
panelReveals()
initBoard()
phaseSequence()
stepProgress()
counters()
indexNav()
copyButtons()
magnetic()
initLanes()
