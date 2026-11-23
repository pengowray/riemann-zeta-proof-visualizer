// The treemap drawn through the map s ↦ ζ(s): the flat map is placed on a rectangle of
// the complex plane and every module's rectangle is drawn where ζ sends it.
import { zeta } from "./zeta.js";

// The rectangle of the s-plane that the flat map is placed on. It lies to the right of
// the pole at s = 1, where ζ is one-to-one, so no two modules land on the same spot.
export const DOMAIN = { sigma0: 1.35, sigma1: 3.2, t0: -1.7, t1: 1.7 };
const GX = 240, GY = 150; // ζ is evaluated on this grid and interpolated in between

let grid = null, bounds = null;
function ensureGrid() {
  if (grid) return;
  grid = new Float64Array((GX + 1) * (GY + 1) * 2);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let j = 0; j <= GY; j++) {
    for (let i = 0; i <= GX; i++) {
      // left edge of the flat map is nearest the pole; top edge has the largest imaginary part
      const sigma = DOMAIN.sigma0 + (DOMAIN.sigma1 - DOMAIN.sigma0) * (i / GX);
      const t = DOMAIN.t1 + (DOMAIN.t0 - DOMAIN.t1) * (j / GY);
      const [re, im] = zeta(sigma, t);
      const k = (j * (GX + 1) + i) * 2;
      grid[k] = re; grid[k + 1] = im;
      x0 = Math.min(x0, re); x1 = Math.max(x1, re); y0 = Math.min(y0, im); y1 = Math.max(y1, im);
    }
  }
  bounds = { x0, x1, y0, y1 };
}

/** Draw the bent map. `data` holds the flat layout (W, H, x0, y0, x1, y1 per module),
 *  the colour index per module, the palette and an optional highlight mask. Returns a
 *  function that gives the module drawn at a canvas position, or -1. */
export function drawBent(canvas, data) {
  ensureGrid();
  const { W, H, LX0, LY0, LX1, LY1, cidx, palette, mask, background, n } = data;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const cw = canvas.clientWidth, ch = canvas.clientHeight;
  canvas.width = cw * dpr; canvas.height = ch * dpr;
  const pad = 14;
  const scale = Math.min((cw - 2 * pad) / (bounds.x1 - bounds.x0), (ch - 2 * pad) / (bounds.y1 - bounds.y0));
  const ox = (cw - scale * (bounds.x1 - bounds.x0)) / 2 - scale * bounds.x0;
  const oy = (ch + scale * (bounds.y1 - bounds.y0)) / 2 + scale * bounds.y0;
  const out = [0, 0];
  const point = (x, y) => {
    const gx = Math.min(Math.max((x / W) * GX, 0), GX - 1e-9), gy = Math.min(Math.max((y / H) * GY, 0), GY - 1e-9);
    const i = Math.floor(gx), j = Math.floor(gy), fx = gx - i, fy = gy - j;
    const a = (j * (GX + 1) + i) * 2, b = a + 2, c = a + (GX + 1) * 2, d = c + 2;
    const re = (grid[a] * (1 - fx) + grid[b] * fx) * (1 - fy) + (grid[c] * (1 - fx) + grid[d] * fx) * fy;
    const im = (grid[a + 1] * (1 - fx) + grid[b + 1] * fx) * (1 - fy) + (grid[c + 1] * (1 - fx) + grid[d + 1] * fx) * fy;
    out[0] = ox + scale * re; out[1] = oy - scale * im;
  };
  // quad corners for every module, computed once per draw
  const quads = new Float32Array(n * 8);
  for (let i = 0; i < n; i++) {
    const q = i * 8;
    point(LX0[i], LY0[i]); quads[q] = out[0]; quads[q + 1] = out[1];
    point(LX1[i], LY0[i]); quads[q + 2] = out[0]; quads[q + 3] = out[1];
    point(LX1[i], LY1[i]); quads[q + 4] = out[0]; quads[q + 5] = out[1];
    point(LX0[i], LY1[i]); quads[q + 6] = out[0]; quads[q + 7] = out[1];
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cw, ch);
  const fade = (hex) => {
    const f = parseInt(hex.slice(1), 16), b = parseInt(background.slice(1), 16);
    const mix = (s) => Math.round(((b >> s) & 255) + (((f >> s) & 255) - ((b >> s) & 255)) * 0.16);
    return `rgb(${mix(16)},${mix(8)},${mix(0)})`;
  };
  for (let pass = 0; pass < (mask ? 2 : 1); pass++) {
    for (let c = 0; c < palette.length; c++) {
      ctx.fillStyle = mask && pass === 0 ? fade(palette[c]) : palette[c];
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        if (cidx[i] !== c) continue;
        if (mask && (mask[i] ? pass === 0 : pass === 1)) continue;
        const q = i * 8;
        if (Math.abs(quads[q + 4] - quads[q]) + Math.abs(quads[q + 5] - quads[q + 1]) < 0.7) { ctx.rect(quads[q], quads[q + 1], 0.6, 0.6); continue; }
        ctx.moveTo(quads[q], quads[q + 1]); ctx.lineTo(quads[q + 2], quads[q + 3]); ctx.lineTo(quads[q + 4], quads[q + 5]); ctx.lineTo(quads[q + 6], quads[q + 7]); ctx.closePath();
      }
      ctx.fill();
    }
  }
  // Hit testing: a coarse grid of buckets over the canvas, each listing the modules whose
  // bounding box touches it; the pointer is then tested against those quads only.
  const cell = 16, cols = Math.ceil(cw / cell), rowsN = Math.ceil(ch / cell);
  const buckets = Array.from({ length: cols * rowsN }, () => []);
  for (let i = 0; i < n; i++) {
    const q = i * 8;
    const xs = [quads[q], quads[q + 2], quads[q + 4], quads[q + 6]], ys = [quads[q + 1], quads[q + 3], quads[q + 5], quads[q + 7]];
    const bx0 = Math.max(0, Math.floor(Math.min(...xs) / cell)), bx1 = Math.min(cols - 1, Math.floor(Math.max(...xs) / cell));
    const by0 = Math.max(0, Math.floor(Math.min(...ys) / cell)), by1 = Math.min(rowsN - 1, Math.floor(Math.max(...ys) / cell));
    for (let by = by0; by <= by1; by++) for (let bx = bx0; bx <= bx1; bx++) buckets[by * cols + bx].push(i);
  }
  return (px, py) => {
    const bx = Math.floor(px / cell), by = Math.floor(py / cell);
    if (bx < 0 || by < 0 || bx >= cols || by >= rowsN) return -1;
    let best = -1, bestDist = 9;
    for (const i of buckets[by * cols + bx]) {
      const q = i * 8;
      let inside = false;
      for (let a = 0, b = 3; a < 4; b = a++) {
        const xa = quads[q + a * 2], ya = quads[q + a * 2 + 1], xb = quads[q + b * 2], yb = quads[q + b * 2 + 1];
        if (ya > py !== yb > py && px < ((xb - xa) * (py - ya)) / (yb - ya) + xa) inside = !inside;
      }
      if (inside) return i;
      const d = Math.hypot((quads[q] + quads[q + 4]) / 2 - px, (quads[q + 1] + quads[q + 5]) / 2 - py);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    return best;
  };
}
