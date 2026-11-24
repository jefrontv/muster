#!/usr/bin/env node
// Renders every Formation app icon from the geometry in formation-mark-geometry.mjs:
// SVG masters, the macOS .icns, the Windows .ico, runtime PNGs and the Windows tray set.
// Sizes under 48px take the hand-fit small mark, because 25 dots blur at 16px.
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  formationTileShapes,
  macCanvasShapes,
  shapesToSvg,
  FORMATION_DOT_MAP
} from './formation-mark-geometry.mjs'
import { rasterizeShapes } from './formation-mark-raster.mjs'
import { encodeIco, encodePng } from './trim-windows-icon-source.mjs'

const projectDir = dirname(dirname(import.meta.dirname))
const resources = join(projectDir, 'resources')
const iconSource = join(resources, 'icon-source')

const SMALL_MARK_LIMIT = 48
const ICO_FRAME_SIZES = [256, 128, 64, 48, 32, 16]
// Electron's nativeImage picks up @Nx siblings of the 16px tray image on scaled displays.
const TRAY_SCALES = [
  ['', 16],
  ['@1.25x', 20],
  ['@1.5x', 24],
  ['@2x', 32],
  ['@2.5x', 40],
  ['@3x', 48]
]

function writeFile(path, contents) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, contents)
  console.log(`  -> ${path.slice(projectDir.length + 1)}`)
}

function png(size, shapes) {
  return encodePng(rasterizeShapes(size, size, shapes))
}

// Full-bleed tile (Windows, Linux, tray, small macOS list slots).
function fullBleed(size, theme = 'paper') {
  return formationTileShapes({ tileSize: size, small: size < SMALL_MARK_LIMIT, theme })
}

// Windows keeps a 2% margin around the full-bleed tile (see trim-windows-icon-source.mjs).
function windowsFrame(size) {
  if (size < SMALL_MARK_LIMIT) {
    return rasterizeShapes(size, size, fullBleed(size))
  }
  const margin = Math.round(size * 0.02)
  const shapes = formationTileShapes({ tileSize: size - 2 * margin, offset: margin })
  return rasterizeShapes(size, size, shapes)
}

function macSlot(size) {
  return size < SMALL_MARK_LIMIT ? png(size, fullBleed(size)) : png(size, macCanvasShapes(size))
}

function writeSvgMasters() {
  writeFile(join(iconSource, 'muster-icon.svg'), shapesToSvg(1024, macCanvasShapes(1024)))
  writeFile(
    join(iconSource, 'muster-icon-dark.svg'),
    shapesToSvg(1024, macCanvasShapes(1024, 'dark'))
  )
  writeFile(
    join(iconSource, 'muster-icon-dev.svg'),
    shapesToSvg(1024, macCanvasShapes(1024, 'dev'))
  )
  for (const size of [16, 20, 24, 32]) {
    writeFile(join(iconSource, `muster-icon-small-${size}.svg`), shapesToSvg(size, fullBleed(size)))
  }
}

// Icon Composer layers: the M, the stone dots and the coral dot each on their own layer.
function writeIconComposerAssets() {
  const shapes = macCanvasShapes(1024).filter((s) => s.type === 'circle')
  const cells = FORMATION_DOT_MAP.join('')
  const layer = (kind) => shapes.filter((_, index) => cells[index] === kind)
  const assets = join(iconSource, 'icon.icon', 'Assets')
  writeFile(join(assets, 'formation-m.svg'), shapesToSvg(1024, layer('D')))
  writeFile(join(assets, 'formation-stone.svg'), shapesToSvg(1024, layer('s')))
  writeFile(join(assets, 'formation-coral.svg'), shapesToSvg(1024, layer('C')))
}

function writeIcns() {
  if (process.platform !== 'darwin') {
    console.log('  (skipped icon.icns: iconutil is macOS only)')
    return
  }
  const tmp = mkdtempSync(join(tmpdir(), 'formation-icns-'))
  const iconset = join(tmp, 'icon.iconset')
  mkdirSync(iconset)
  try {
    for (const base of [16, 32, 128, 256, 512]) {
      writeFileSync(join(iconset, `icon_${base}x${base}.png`), macSlot(base))
      writeFileSync(join(iconset, `icon_${base}x${base}@2x.png`), macSlot(base * 2))
    }
    const out = join(resources, 'build', 'icon.icns')
    execFileSync('iconutil', ['-c', 'icns', iconset, '-o', out])
    console.log('  -> resources/build/icon.icns')
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

// The renderer HTML entries (desktop, web client, popout) link these as favicons.
function writeFavicons() {
  const brand = join(projectDir, 'src', 'renderer', 'src', 'assets', 'brand')
  writeFile(join(brand, 'favicon.svg'), shapesToSvg(16, fullBleed(16)))
  writeFile(join(brand, 'favicon-32.png'), png(32, fullBleed(32)))
  writeFile(join(brand, 'apple-touch-icon.png'), png(180, fullBleed(180)))
}

function main() {
  writeSvgMasters()
  writeFavicons()
  writeIconComposerAssets()
  writeFile(join(resources, 'build', 'icon.png'), png(1024, macCanvasShapes(1024)))
  writeFile(join(resources, 'icon.png'), png(256, macCanvasShapes(256)))
  writeFile(join(resources, 'icon-dev.png'), png(256, macCanvasShapes(256, 'dev')))
  writeFile(
    join(resources, 'app-icons', 'muster-dark.png'),
    png(1024, macCanvasShapes(1024, 'dark'))
  )
  writeIcns()
  writeFile(join(resources, 'build', 'icon.ico'), encodeIco(ICO_FRAME_SIZES.map(windowsFrame)))
  for (const theme of ['paper', 'dark']) {
    const name = theme === 'paper' ? 'tray' : 'tray-dark'
    for (const [suffix, size] of TRAY_SCALES) {
      writeFile(join(resources, 'tray', `${name}${suffix}.png`), png(size, fullBleed(size, theme)))
    }
  }
}

main()
