// Bending the map by ζ: the flat map is placed on a rectangle of the complex plane and
// each point is moved towards where the Riemann zeta function sends it.
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

/** Returns a function (x, y, out) that writes to out[0], out[1] the fully bent position
 *  of the flat-map point (x, y). The bent map is scaled to fit the same W × H box. */
export function makeBend(W, H) {
  ensureGrid();
  const pad = 10;
  const scale = Math.min((W - 2 * pad) / (bounds.x1 - bounds.x0), (H - 2 * pad) / (bounds.y1 - bounds.y0));
  const ox = (W - scale * (bounds.x1 - bounds.x0)) / 2 - scale * bounds.x0;
  const oy = (H + scale * (bounds.y1 - bounds.y0)) / 2 + scale * bounds.y0;
  return (x, y, out) => {
    const gx = Math.min(Math.max((x / W) * GX, 0), GX - 1e-9), gy = Math.min(Math.max((y / H) * GY, 0), GY - 1e-9);
    const i = Math.floor(gx), j = Math.floor(gy), fx = gx - i, fy = gy - j;
    const a = (j * (GX + 1) + i) * 2, b = a + 2, c = a + (GX + 1) * 2, d = c + 2;
    const re = (grid[a] * (1 - fx) + grid[b] * fx) * (1 - fy) + (grid[c] * (1 - fx) + grid[d] * fx) * fy;
    const im = (grid[a + 1] * (1 - fx) + grid[b + 1] * fx) * (1 - fy) + (grid[c + 1] * (1 - fx) + grid[d + 1] * fx) * fy;
    out[0] = ox + scale * re; out[1] = oy - scale * im;
  };
}
