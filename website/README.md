# Muster site

The download and install page the team is pointed at. Plain HTML, CSS and JS — no build step, no
package install, nothing to compile.

```
website/
  index.php           the page (PHP only renders the release number and absolute URLs)
  index.html          static twin, for hosts without PHP
  inc/release.php     GitHub release lookup, disk-cached
  styles.css          design tokens, layout, both themes
  main.js             GSAP timelines, the lane canvas, the workspace board, copy buttons
  assets/logo.svg     the app icon
  assets/og.png       link-preview card (generated, see below)
  assets/fonts/       Geist Variable, the app's own typeface
  vendor/             GSAP + ScrollTrigger, vendored so the page works offline
```

## Why there is PHP at all

Two things have to be in the HTML as delivered, because link-preview crawlers (Slack, Teams,
iMessage) never run JavaScript:

- **`og:image` as an absolute URL.** Resolved from `$_SERVER`, so the same file works on any host
  with no configuration.
- **The current release number.** Fetched from the GitHub API and cached on disk for 15 minutes.

Everything else is static. If GitHub is unreachable the page falls back to the last cached answer,
and if there has never been one it simply omits the version — the download links do not depend on
it, and the page still renders.

The disk cache matters: unauthenticated GitHub requests are rate-limited per IP, and server-side
that IP is shared by every visitor. Without the cache a busy page would exhaust the hour's quota.

## Run it locally

```sh
cd website && php -S 127.0.0.1:8899     # the real thing
cd website && python3 -m http.server 8899   # static twin, no version number
```

## Deploy

**Your server (PHP):** copy the `website/` directory anywhere PHP 7.4+ serves files. No composer,
no database, no writable directory beyond the system temp dir. Point the vhost at it and it works.

**A static host (GitHub Pages, Netlify, S3):** `index.html` is the same page without the two
server-rendered bits; it fills the version in with a client-side fetch instead. Regenerate it after
editing `index.php`:

```sh
cd website && php -S 127.0.0.1:8899 &
curl -s http://127.0.0.1:8899/ > index.html
```

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

## Social preview

`assets/og.png` is generated, not hand-drawn — `scratchpad/og-card.html` is rendered at 1200×630
with a headless browser. To change it, edit the card and re-screenshot; the `og:image` URL is made
absolute at runtime from wherever the page is served, so no host is baked in.

## Contrast

Every text colour clears WCAG AA (4.5:1 for small text) in both themes. The mono micro-labels are
all 10–11px, which is what makes `--faint` and the light-theme `--signal-text` the tight ones —
both were failing before they were measured. If you change a neutral, re-check rather than eyeball
it.

## The one gotcha

Anything animated in must use `gsap.fromTo()` with an explicit `opacity: 1`, never `gsap.from()`.
The stylesheet pre-hides `.anim` elements at `opacity: 0`; `from()` reads that hidden value as the
tween's *end* state, so the element animates 0 → 0 and never appears. `animIn()` in `main.js`
handles this — use it rather than calling GSAP directly.
