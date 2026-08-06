# Muster site

The download and install page the team is pointed at. Plain HTML, CSS and JS — no build step, no
package install, nothing to compile.

```
website/
  index.html          markup and all copy
  styles.css          design tokens, layout, both themes
  main.js             GSAP timelines, the lane canvas, the workspace board, copy buttons
  assets/logo.svg     the app icon
  assets/fonts/       Geist Variable, the app's own typeface
  vendor/             GSAP + ScrollTrigger, vendored so the page works offline
```

## Run it locally

```sh
cd website && python3 -m http.server 8899
# then open http://localhost:8899
```

Open it as a `file://` URL and the font and vendored scripts still load, but treat the served
version as the real one.

## Deploy

Any static host works — the page has no server dependency.

**GitHub Pages:** Settings → Pages → deploy from a branch, folder `/website`. Push and it is live.

**Netlify / Cloudflare Pages / S3:** publish directory `website`, no build command.

## Editing

- **Download links** point at `/releases/latest/download/…`, which GitHub redirects to the newest
  release. They never need updating when a version ships.
- **Copy lives in `index.html`**, not in JS. The install steps and the troubleshooting answers are
  the parts worth keeping current; everything else is stable.
- **Colours and type** are custom properties at the top of `styles.css`, defined once per theme.
  Change them there rather than in component rules.
- **Motion** is all in `main.js`. Every animation is written so the finished state is what renders
  without it: elements are only hidden when JavaScript is present *and* the reader has not asked for
  reduced motion, so a no-JS or reduced-motion visitor sees a complete page.

## The one gotcha

Anything animated in must use `gsap.fromTo()` with an explicit `opacity: 1`, never `gsap.from()`.
The stylesheet pre-hides `.anim` elements at `opacity: 0`; `from()` reads that hidden value as the
tween's *end* state, so the element animates 0 → 0 and never appears. `animIn()` in `main.js`
handles this — use it rather than calling GSAP directly.
