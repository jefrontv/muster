// Minimal anti-aliased rasterizer for the Formation icons: rounded rects and circles only,
// so icon builds need no ImageMagick, librsvg or native canvas.
import { hexToRgb } from './formation-mark-geometry.mjs'

const SAMPLES = 8

function roundedRectDistance(px, py, s) {
  const hx = s.w / 2
  const hy = s.h / 2
  const qx = Math.abs(px - (s.x + hx)) - (hx - s.r)
  const qy = Math.abs(py - (s.y + hy)) - (hy - s.r)
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0))
  return outside + Math.min(Math.max(qx, qy), 0) - s.r
}

function circleDistance(px, py, s) {
  return Math.hypot(px - s.cx, py - s.cy) - s.r
}

function bounds(s) {
  return s.type === 'rect'
    ? { x0: s.x, y0: s.y, x1: s.x + s.w, y1: s.y + s.h }
    : { x0: s.cx - s.r, y0: s.cy - s.r, x1: s.cx + s.r, y1: s.cy + s.r }
}

function coverage(distance, s, x, y) {
  const centre = distance(x + 0.5, y + 0.5, s)
  if (centre <= -0.75) {
    return 1
  }
  if (centre >= 0.75) {
    return 0
  }
  let inside = 0
  for (let sy = 0; sy < SAMPLES; sy++) {
    for (let sx = 0; sx < SAMPLES; sx++) {
      if (distance(x + (sx + 0.5) / SAMPLES, y + (sy + 0.5) / SAMPLES, s) <= 0) {
        inside++
      }
    }
  }
  return inside / (SAMPLES * SAMPLES)
}

/** Returns straight-alpha RGBA bytes (the layout pngjs expects). */
export function rasterizeShapes(width, height, shapes) {
  const premult = new Float32Array(width * height * 4)
  for (const s of shapes) {
    const distance = s.type === 'rect' ? roundedRectDistance : circleDistance
    const { r, g, b } = hexToRgb(s.color)
    const box = bounds(s)
    const x0 = Math.max(0, Math.floor(box.x0))
    const y0 = Math.max(0, Math.floor(box.y0))
    const x1 = Math.min(width, Math.ceil(box.x1))
    const y1 = Math.min(height, Math.ceil(box.y1))
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const a = coverage(distance, s, x, y)
        if (a === 0) {
          continue
        }
        const i = (y * width + x) * 4
        premult[i] = (r / 255) * a + premult[i] * (1 - a)
        premult[i + 1] = (g / 255) * a + premult[i + 1] * (1 - a)
        premult[i + 2] = (b / 255) * a + premult[i + 2] * (1 - a)
        premult[i + 3] = a + premult[i + 3] * (1 - a)
      }
    }
  }
  const data = Buffer.alloc(width * height * 4)
  for (let i = 0; i < premult.length; i += 4) {
    const a = premult[i + 3]
    if (a === 0) {
      continue
    }
    data[i] = Math.round((premult[i] / a) * 255)
    data[i + 1] = Math.round((premult[i + 1] / a) * 255)
    data[i + 2] = Math.round((premult[i + 2] / a) * 255)
    data[i + 3] = Math.round(a * 255)
  }
  return { width, height, data }
}
