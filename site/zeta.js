// Draws the curve t ↦ ζ(1/2 + it) on a canvas.

const N = 120; // terms in Borwein's alternating-series method; accurate to ~1e-9 for t ≤ 60
const D = (() => {
  const d = new Float64Array(N + 1);
  let term = 1 / N, sum = 0;
  for (let i = 0; i <= N; i++) {
    sum += term;
    d[i] = N * sum;
    term *= (4 * (N + i) * (N - i)) / ((2 * i + 1) * (2 * i + 2));
  }
  return d;
})();

/** ζ(σ + it) as [re, im], by Borwein's method for the Dirichlet eta function (σ > 0, s ≠ 1). */
export function zeta(sigma, t) {
  let re = 0, im = 0;
  for (let k = 0; k < N; k++) {
    const c = ((k & 1 ? -1 : 1) * (D[k] - D[N])) * Math.pow(k + 1, -sigma);
    const a = -t * Math.log(k + 1);
    re += c * Math.cos(a);
    im += c * Math.sin(a);
  }
  // divide by -d_N (1 - 2^(1-s))
  const a = -t * Math.LN2, r = Math.pow(2, 1 - sigma);
  const qr = -D[N] * (1 - r * Math.cos(a));
  const qi = D[N] * r * Math.sin(a);
  const q = qr * qr + qi * qi;
  return [(re * qr + im * qi) / q, (im * qr - re * qi) / q];
}
export const zetaHalf = (t) => zeta(0.5, t);

export function drawZeta(canvas, tMax, onFrame) {
  const step = 0.01;
  const pts = [];
  for (let t = 0; t <= tMax; t += step) pts.push(zetaHalf(t));
  const zeros = [];
  const mag = pts.map(([x, y]) => Math.hypot(x, y));
  for (let i = 1; i < pts.length - 1; i++) {
    if (mag[i] < 0.03 && mag[i] <= mag[i - 1] && mag[i] <= mag[i + 1]) zeros.push(i * step);
  }
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const ctx = canvas.getContext("2d");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const start = performance.now();
  const period = 90000; // ms for one pass over the whole range of t

  function frame(now) {
    const css = getComputedStyle(document.documentElement);
    const ink = css.getPropertyValue("--ink").trim();
    const faint = css.getPropertyValue("--rule").trim();
    const mid = css.getPropertyValue("--ink-3").trim();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const size = canvas.clientWidth;
    if (canvas.width !== Math.round(size * dpr)) { canvas.width = canvas.height = Math.round(size * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    const pad = 22;
    const s = Math.min((size - 2 * pad) / (x1 - x0), (size - 2 * pad) / (y1 - y0));
    const ox = pad + (size - 2 * pad - s * (x1 - x0)) / 2 - s * x0;
    const oy = size / 2 + (s * (y0 + y1)) / 2;
    const px = (p) => [ox + s * p[0], oy - s * p[1]];

    ctx.strokeStyle = faint; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, oy); ctx.lineTo(size, oy); ctx.moveTo(ox, 0); ctx.lineTo(ox, size); ctx.stroke();
    ctx.fillStyle = mid; ctx.font = '12px "STIX Two Text", serif';
    ctx.fillText("Re", size - 20, oy - 6); ctx.fillText("Im", ox + 6, 12); ctx.fillText("0", ox - 12, oy + 14);
    for (const tick of [1, 2, 3]) { const [x] = px([tick, 0]); ctx.fillRect(x, oy - 3, 1, 6); ctx.fillText(String(tick), x - 3, oy + 16); }

    const head = reduce ? pts.length - 1 : Math.max(0, Math.floor(((Math.max(0, now - start) % period) / period) * (pts.length - 1)));
    ctx.lineJoin = "round";
    ctx.strokeStyle = mid; ctx.globalAlpha = 0.45; ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (let i = 0; i < pts.length; i += 2) { const [x, y] = px(pts[i]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke();
    ctx.globalAlpha = 1; ctx.strokeStyle = ink; ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i = Math.max(0, head - 500); i <= head; i++) { const [x, y] = px(pts[i]); i > Math.max(0, head - 500) ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke();
    const [hx, hy] = px(pts[head]);
    ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(hx, hy, 3.5, 0, 7); ctx.fill();
    ctx.strokeStyle = ink; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(ox, oy, 6, 0, 7); ctx.stroke();
    onFrame?.(head * step, zeros);
    if (!reduce && canvas.isConnected) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return zeros;
}
