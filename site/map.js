// The treemap: layout, colours, drawing, the sidebar map, the ζ bend, highlights, zoom and hover.
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";
import { makeBend } from "./bent.js";
import { SETTINGS, PARTS, partOf, $, fmt, pct, bytesFmt, plural, esc, meta, N, col, dirs, leafDir, FAMILIES, fieldFamily, moduleFamily, dirFamily, KIND_NAMES, KIND_COLOURS, isDark, cssVar, SIZE_MODES, COLOUR_MODES, state, names, docs, docsReady, HAS_COMMENTS, pathOf, dirSum } from "./data.js";
import { openModule, openDirectory, closeDrawer } from "./drawer.js";

// ---------------------------------------------------------------- treemap layout
export const canvas = $("treemap");
export const ctx = canvas.getContext("2d");
// Directories are separated by outlines drawn at a fixed width on screen (px, by depth).
// Gaps or name strips built into the layout grow with the zoom and become thick bands
// once you zoom into a small directory.
// With only two or three top-level directories (the rewrite has New and Lib), the line between them is
// drawn much wider and their names larger, so the map reads as separate parts.
const FEW_TOP = dirs.filter((d) => d.depth === 1).length <= 3;
export const OUTLINE = [0, FEW_TOP ? 16 : 3, 2, 1];
export let W = 0, H = 0, root = null;
export const LX0 = new Float32Array(N), LY0 = new Float32Array(N), LX1 = new Float32Array(N), LY1 = new Float32Array(N);

export function buildHierarchy() {
  const nodes = dirs.map((d) => ({ dir: d, children: [] }));
  for (const d of dirs) {
    const node = nodes[d.i];
    for (let i = d.start; i < d.start + d.count; i++) node.children.push({ leaf: i });
    if (d.parent >= 0) nodes[d.parent].children.push(node);
  }
  // the version's settings can put some top-level directories first, which the layout places top left
  const order = SETTINGS.mapOrder || [];
  const rank = (c) => { const k = c.dir ? order.indexOf(c.dir.name) : -1; return k < 0 ? order.length : k; };
  nodes[0].children.sort((a, b) => rank(a) - rank(b));
  root = d3.hierarchy(nodes[0]);
  root.each((n) => { if (n.data.dir) n.data.dir.node = n; });
}

/** A module's size on the map: its value in the size measure, or 0 when the map shows only another part. */
const visibleValue = (i) => (state.showPart < 0 || partOf[i] === state.showPart ? state.size.values[i] : 0);

export function layout() {
  root.sum((d) => (d.leaf === undefined ? 0 : visibleValue(d.leaf)));
  // with a map order (the rewrite's New and Lib), the top level is split left to right in that order
  const tile = SETTINGS.mapOrder
    ? (node, x0, y0, x1, y1) => (node.depth === 0 ? d3.treemapDice : d3.treemapSquarify)(node, x0, y0, x1, y1)
    : d3.treemapSquarify;
  d3.treemap().tile(tile).size([W, H]).round(false)(root);
  for (const n of root.leaves()) {
    const i = n.data.leaf;
    if (i === undefined) continue;
    LX0[i] = n.x0; LY0[i] = n.y0; LX1[i] = n.x1; LY1[i] = n.y1;
  }
  bentCorners = null;
  computeQuads();
}

// ---------------------------------------------------------------- colours
export const cidx = new Uint8Array(N);
export let palette = [], paletteInk = [];
export function luminance(hex) {
  const c = d3.rgb(hex);
  return (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
}
export function seqColours() {
  // 9 steps from "near the surface" to "far from it": light to dark on paper, dark to light on a dark page
  const ramp = d3.quantize(d3.interpolateRgbBasis(isDark() ? ["#0d366b", "#1c5cab", "#3987e5", "#86b6ef", "#cde2fb"] : ["#cde2fb", "#86b6ef", "#3987e5", "#1c5cab", "#0d366b"]), 9);
  return ramp.map((c) => d3.rgb(c).formatHex());
}
export function seqStep(mode) {
  const max = mode.max ?? d3.max(mode.values);
  const f = mode.scale === "log" ? (v) => Math.log1p(v) / Math.log1p(max) : mode.scale === "sqrt" ? (v) => Math.sqrt(v / max) : (v) => v / max;
  return (v) => (v === mode.missing ? 9 : Math.min(8, Math.floor(f(v) * 9)));
}
export function recolour() {
  const mode = state.colour, dark = isDark();
  if (mode.id === "field" || mode.id === "dirfield") {
    palette = FAMILIES.map((f) => (dark ? f.dark : f.light));
    const of = mode.id === "field" ? moduleFamily : dirFamily;
    for (let i = 0; i < N; i++) cidx[i] = of(i);
  } else if (mode.id === "kind") {
    palette = KIND_COLOURS.map((c) => c[dark ? 1 : 0]);
    cidx.set(col.kind);
  } else {
    palette = [...seqColours(), dark ? "#6b665b" : "#a8a294"];
    const step = seqStep(mode), v = mode.values;
    for (let i = 0; i < N; i++) cidx[i] = step(v[i]);
  }
  paletteInk = palette.map((c) => (luminance(c) > 0.45 ? "#14130f" : "#ffffff"));
}

// ---------------------------------------------------------------- drawing
export let transform = d3.zoomIdentity;
export let drawQueued = false;
export function requestDraw() { if (!drawQueued) { drawQueued = true; requestAnimationFrame(() => { drawQueued = false; draw(); }); } }
export const activeMask = () => state.preview || state.mask;
/** Colours and per-module colour index for a drawing pass. Pass 1 draws the highlighted modules, and a preview may give them its own colours. */
const coloursFor = (pass) => (pass === 1 && state.preview && state.previewTint ? [state.previewTint.colours, state.previewTint.index] : [palette, cidx]);

export function draw() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const { k, x: tx, y: ty } = transform;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const paper2 = cssVar("--paper-2"), paper = cssVar("--paper"), paper3 = cssVar("--paper-3"), ink = cssVar("--ink"), ink2 = cssVar("--ink-2");
  ctx.fillStyle = paper2; ctx.fillRect(0, 0, W, H);
  const vx0 = -tx / k, vy0 = -ty / k, vx1 = (W - tx) / k, vy1 = (H - ty) / k;

  // directory backgrounds (they show through as the gaps)
  for (const d of dirs) {
    if (quads || d.depth === 0 || d.depth > 2) continue;
    const n = d.node;
    if (n.x1 < vx0 || n.x0 > vx1 || n.y1 < vy0 || n.y0 > vy1) continue;
    ctx.fillStyle = d.depth % 2 ? paper : paper3;
    ctx.fillRect(n.x0 * k + tx, n.y0 * k + ty, (n.x1 - n.x0) * k, (n.y1 - n.y0) * k);
  }

  const mask = activeMask();
  const bg = d3.rgb(paper2);
  for (let pass = 0; pass < (mask ? 2 : 1); pass++) {
    const [colours, cidx] = coloursFor(pass);
    for (let c = 0; c < colours.length; c++) {
      let fill = colours[c];
      if (mask && pass === 0) { const f = d3.rgb(fill); fill = d3.rgb(bg.r + (f.r - bg.r) * 0.16, bg.g + (f.g - bg.g) * 0.16, bg.b + (f.b - bg.b) * 0.16).formatHex(); }
      ctx.fillStyle = fill;
      if (quads) {
        // Filled in batches: one path holding every shape of a colour takes the browser minutes to fill.
        let inPath = 0;
        ctx.beginPath();
        for (let i = 0; i < N; i++) {
          if (cidx[i] !== c) continue;
          if (mask && (mask[i] ? pass === 0 : pass === 1)) continue;
          const q = i * 8, ax = quads[q] * k + tx, ay = quads[q + 1] * k + ty, bx = quads[q + 4] * k + tx, by = quads[q + 5] * k + ty;
          if ((ax < 0 && bx < 0) || (ax > W && bx > W) || (ay < 0 && by < 0) || (ay > H && by > H)) continue;
          if (Math.abs(bx - ax) + Math.abs(by - ay) < 1.2) { ctx.fillRect(ax, ay, 0.7, 0.7); continue; }
          ctx.moveTo(ax, ay); ctx.lineTo(quads[q + 2] * k + tx, quads[q + 3] * k + ty); ctx.lineTo(bx, by); ctx.lineTo(quads[q + 6] * k + tx, quads[q + 7] * k + ty); ctx.closePath();
          if (++inPath === 64) { ctx.fill(); ctx.beginPath(); inPath = 0; }
        }
        ctx.fill();
        continue;
      }
      for (let i = 0; i < N; i++) {
        if (cidx[i] !== c) continue;
        if (mask && (mask[i] ? pass === 0 : pass === 1)) continue;
        const x0 = LX0[i], x1 = LX1[i], y0 = LY0[i], y1 = LY1[i];
        if (x1 < vx0 || x0 > vx1 || y1 < vy0 || y0 > vy1) continue;
        const w = (x1 - x0) * k, h = (y1 - y0) * k;
        const gx = w > 4 ? 0.5 : 0, gy = h > 4 ? 0.5 : 0;
        ctx.fillRect(x0 * k + tx, y0 * k + ty, Math.max(w - gx, 0.35), Math.max(h - gy, 0.35));
      }
    }
  }

  // directory outlines, deepest first so that the outer ones stay on top
  if (!quads) {
    ctx.strokeStyle = paper2;
    for (let depth = OUTLINE.length - 1; depth >= 1; depth--) {
      ctx.lineWidth = OUTLINE[depth];
      ctx.beginPath();
      for (const d of dirs) {
        if (d.depth !== depth) continue;
        const n = d.node;
        if (n.x1 < vx0 || n.x0 > vx1 || n.y1 < vy0 || n.y0 > vy1) continue;
        const w = (n.x1 - n.x0) * k, h = (n.y1 - n.y0) * k;
        if (w < 12 || h < 12) continue; // outlines would swallow a directory this small
        ctx.rect(n.x0 * k + tx, n.y0 * k + ty, w, h);
      }
      ctx.stroke();
    }
  }

  // directory names: a name plate in the top-left corner, drawn once the directory is large enough
  // on screen and the plate would not cover a plate already drawn
  ctx.textBaseline = "middle";
  const plates = plateHits = [];
  for (const d of dirs) {
    if (quads || d.depth === 0 || d.depth > 8) continue;
    const n = d.node;
    if (n.x1 < vx0 || n.x0 > vx1 || n.y1 < vy0 || n.y0 > vy1) continue;
    const w = (n.x1 - n.x0) * k, h = (n.y1 - n.y0) * k;
    // every directory name is a plate in its top-left corner; the top-level ones are bold and appear first
    const top = d.depth === 1;
    if (top ? w < 60 || h < 24 : d.depth === 2 ? w < 90 || h < 40 : w < 150 || h < 60) continue;
    const size = top ? (FEW_TOP ? 20 : 16) : 14;
    ctx.font = `${d.depth === 1 ? 600 : 400} ${size}px "STIX Two Text", serif`;
    const x = Math.max(n.x0 * k + tx, 0) + 4;
    const room = Math.min(n.x1 * k + tx - x - 4, 260);
    let text = d.name.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
    if (ctx.measureText(text).width > room) {
      while (text.length > 3 && ctx.measureText(text + "…").width > room) text = text.slice(0, -1);
      if (text.length <= 3) continue;
      text += "…";
    }
    const y = Math.max(n.y0 * k + ty, 0);
    const pw = ctx.measureText(text).width + 8, ph = top ? 24 : 20;
    if (plates.some((p) => x - 4 < p[0] + p[2] && p[0] < x - 4 + pw && y < p[1] + p[3] && p[1] < y + ph)) continue;
    plates.push([x - 4, y, pw, ph, d]);
    ctx.fillStyle = paper; ctx.fillRect(x - 4, y, pw, ph);
    ctx.fillStyle = top ? ink : ink2; ctx.fillText(text, x, y + ph / 2 + 0.5);
  }

  // module names, once the rectangles are large enough to hold them: the name wraps at its word
  // boundaries, and the size the map is drawn by goes on the line below when there is room
  if (names && k > 6 && !quads) {
    const LINE = 17, nameFont = '14px "JuliaMono", monospace', sizeFont = '13px "STIX Two Text", serif';
    ctx.textBaseline = "top";
    for (let i = 0; i < N; i++) {
      const x0 = LX0[i], x1 = LX1[i], y0 = LY0[i], y1 = LY1[i];
      if (x1 < vx0 || x0 > vx1 || y1 < vy0 || y0 > vy1) continue;
      const w = (x1 - x0) * k, h = (y1 - y0) * k;
      if (w < 70 || h < 20) continue;
      if (mask && !mask[i]) continue;
      // a module that starts above or left of the view has its name at the view's edge, as directory names do;
      // a directory's name plate sits in the same corner as its first module's name: move the module name below it
      const nx = Math.max(x0 * k + tx, 0) + 3;
      let ny = Math.max(y0 * k + ty, 0) + 3;
      for (const p of plates) if (nx < p[0] + p[2] && nx + 60 > p[0] && ny < p[1] + p[3] && ny + LINE > p[1]) ny = p[1] + p[3] + 2;
      const bottom = y1 * k + ty - 2, rows = Math.floor((bottom - ny) / LINE);
      if (rows < 1) continue;
      const sizeText = sizeLabel(i);
      ctx.font = nameFont;
      const lines = wrapName(names[i], x1 * k + tx - nx - 5, sizeText && rows > 1 ? rows - 1 : rows);
      ctx.save();
      ctx.beginPath(); ctx.rect(x0 * k + tx, y0 * k + ty, w - 2, h); ctx.clip();
      ctx.fillStyle = paletteInk[cidx[i]];
      lines.forEach((line, j) => ctx.fillText(line, nx, ny + j * LINE));
      if (sizeText && lines.length < rows) {
        // the size line drops its words ("lines of code") when only the number fits
        ctx.font = sizeFont; ctx.globalAlpha = 0.9;
        const room = x1 * k + tx - nx - 5, short = sizeText.split(" ")[0];
        const text = ctx.measureText(sizeText).width <= room ? sizeText : ctx.measureText(short).width <= room ? short : "";
        if (text) ctx.fillText(text, nx, ny + lines.length * LINE + 1);
      }
      ctx.restore();
    }
  }

  if (state.chain || state.previewChain) {
    // faint lines hint at the order; the dots carry the positions
    ctx.strokeStyle = ink; ctx.globalAlpha = 0.3; ctx.lineWidth = 0.7; ctx.lineJoin = "round"; ctx.beginPath();
    meta.chain.forEach((i, j) => {
      const x = centreX(i) * k + tx, y = centreY(i) * k + ty;
      j ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.stroke(); ctx.globalAlpha = 1;
    ctx.fillStyle = ink;
    for (const i of meta.chain) { ctx.beginPath(); ctx.arc(centreX(i) * k + tx, centreY(i) * k + ty, 3, 0, 7); ctx.fill(); }
  }

  for (const [i, width] of [[state.pinned, 2.5], [state.hover, 1.5]]) {
    if (i < 0) continue;
    if (quads) {
      const q = i * 8;
      ctx.strokeStyle = ink; ctx.lineWidth = width; ctx.beginPath();
      ctx.moveTo(quads[q] * k + tx, quads[q + 1] * k + ty);
      for (let c = 2; c < 8; c += 2) ctx.lineTo(quads[q + c] * k + tx, quads[q + c + 1] * k + ty);
      ctx.closePath(); ctx.stroke();
      continue;
    }
    const g = dirs[leafDir[i]].node;
    ctx.strokeStyle = ink; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
    ctx.strokeRect(g.x0 * k + tx, g.y0 * k + ty, (g.x1 - g.x0) * k, (g.y1 - g.y0) * k);
    ctx.setLineDash([]); ctx.lineWidth = width;
    const w = Math.max((LX1[i] - LX0[i]) * k, 3), h = Math.max((LY1[i] - LY0[i]) * k, 3);
    ctx.strokeRect(LX0[i] * k + tx, LY0[i] * k + ty, w, h);
  }
  if (state.marker >= 0) {
    const i = state.marker;
    ctx.strokeStyle = ink; ctx.lineWidth = 2.5; ctx.beginPath();
    ctx.arc(centreX(i) * k + tx, centreY(i) * k + ty, 9, 0, 7); ctx.stroke();
  }
  $("reset-zoom").hidden = k < 1.02;
  drawMinimapOverlay();
}

// ---------------------------------------------------------------- minimap (the signpost in the left rail)
export const mini = $("minimap");
export const miniCtx = mini.getContext("2d");
export const miniBase = document.createElement("canvas");
export function drawMinimapBase() {
  if (!mini.offsetParent) return;
  const dpr = Math.min(devicePixelRatio || 1, 2), mw = 200, mh = 125;
  miniBase.width = mw * dpr; miniBase.height = mh * dpr;
  const c = miniBase.getContext("2d");
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const bg = d3.rgb(cssVar("--paper-2"));
  c.fillStyle = bg.formatHex(); c.fillRect(0, 0, mw, mh);
  const sx = mw / W, sy = mh / H, mask = activeMask();
  for (let pass = 0; pass < (mask ? 2 : 1); pass++) {
    const [colours, cidx] = coloursFor(pass);
    for (let p = 0; p < colours.length; p++) {
      let fill = colours[p];
      if (mask && pass === 0) { const f = d3.rgb(fill); fill = d3.rgb(bg.r + (f.r - bg.r) * 0.14, bg.g + (f.g - bg.g) * 0.14, bg.b + (f.b - bg.b) * 0.14).formatHex(); }
      c.fillStyle = fill;
      for (let i = 0; i < N; i++) {
        if (cidx[i] !== p) continue;
        if (mask && (mask[i] ? pass === 0 : pass === 1)) continue;
        // highlighted modules get at least one pixel so that a handful of them stay visible
        const min = mask && pass === 1 ? 1.2 : 0.3;
        c.fillRect(LX0[i] * sx, LY0[i] * sy, Math.max((LX1[i] - LX0[i]) * sx, min), Math.max((LY1[i] - LY0[i]) * sy, min));
      }
    }
  }
  drawMinimapOverlay();
  $("rail-note").textContent = state.previewLabel || state.maskLabel || `Map of all ${fmt(N)} modules, sized by ${state.size.label.toLowerCase()}.`;
}
export function drawMinimapOverlay() {
  if (!miniBase.width || !mini.offsetParent) return;
  const dpr = miniBase.width / 200;
  if (mini.width !== miniBase.width) { mini.width = miniBase.width; mini.height = miniBase.height; }
  miniCtx.setTransform(1, 0, 0, 1, 0, 0);
  miniCtx.drawImage(miniBase, 0, 0);
  const mx = (200 / W) * dpr, my = (125 / H) * dpr, inkNow = cssVar("--ink");
  const centre = (i) => [((LX0[i] + LX1[i]) / 2) * mx, ((LY0[i] + LY1[i]) / 2) * my];
  if (state.chain || state.previewChain) {
    miniCtx.strokeStyle = inkNow; miniCtx.globalAlpha = 0.35; miniCtx.lineWidth = 0.6 * dpr; miniCtx.beginPath();
    meta.chain.forEach((i, j) => { const [x, y] = centre(i); j ? miniCtx.lineTo(x, y) : miniCtx.moveTo(x, y); });
    miniCtx.stroke(); miniCtx.globalAlpha = 1; miniCtx.fillStyle = inkNow;
    for (const i of meta.chain) { const [x, y] = centre(i); miniCtx.beginPath(); miniCtx.arc(x, y, 1.3 * dpr, 0, 7); miniCtx.fill(); }
  }
  if (state.marker >= 0) {
    const [x, y] = centre(state.marker);
    miniCtx.strokeStyle = inkNow; miniCtx.lineWidth = 2 * dpr; miniCtx.beginPath(); miniCtx.arc(x, y, 5 * dpr, 0, 7); miniCtx.stroke();
    miniCtx.fillStyle = inkNow; miniCtx.beginPath(); miniCtx.arc(x, y, 2.2 * dpr, 0, 7); miniCtx.fill();
  }
  if (transform.k > 1.02) {
    const sx = (200 / W) * dpr, sy = (125 / H) * dpr, { k, x, y } = transform;
    miniCtx.strokeStyle = cssVar("--ink"); miniCtx.lineWidth = 1.5 * dpr;
    miniCtx.strokeRect((-x / k) * sx, (-y / k) * sy, (W / k) * sx, (H / k) * sy);
  }
}
export let miniTimer = 0;
export const refreshMini = () => { clearTimeout(miniTimer); miniTimer = setTimeout(drawMinimapBase, 30); };

// ---------------------------------------------------------------- bending the map by ζ
// state.bend runs from 0 (flat) to 1 (every module drawn where ζ sends it). While it is
// above 0 each module is a four-cornered shape, kept in `quads` in flat-map coordinates.
export let quads = null, quadBuckets = null, bentCorners = null;
const BUCKET = 12;
export function computeQuads() {
  quadBuckets = null;
  if (!state.bend || !W) { quads = null; return; }
  quads ||= new Float32Array(N * 8);
  if (!bentCorners) {
    // where each corner ends up when fully bent; computed once per layout, so moving the slider only blends
    bentCorners = new Float32Array(N * 8);
    const bendPoint = makeBend(W, H), out = [0, 0];
    const put = (q, x, y) => { bendPoint(x, y, out); bentCorners[q] = out[0]; bentCorners[q + 1] = out[1]; };
    for (let i = 0; i < N; i++) {
      const q = i * 8;
      put(q, LX0[i], LY0[i]); put(q + 2, LX1[i], LY0[i]); put(q + 4, LX1[i], LY1[i]); put(q + 6, LX0[i], LY1[i]);
    }
  }
  const t = state.bend * state.bend * (3 - 2 * state.bend); // ease in and out
  for (let i = 0; i < N; i++) {
    const q = i * 8, x0 = LX0[i], y0 = LY0[i], x1 = LX1[i], y1 = LY1[i];
    quads[q] = x0 + (bentCorners[q] - x0) * t; quads[q + 1] = y0 + (bentCorners[q + 1] - y0) * t;
    quads[q + 2] = x1 + (bentCorners[q + 2] - x1) * t; quads[q + 3] = y0 + (bentCorners[q + 3] - y0) * t;
    quads[q + 4] = x1 + (bentCorners[q + 4] - x1) * t; quads[q + 5] = y1 + (bentCorners[q + 5] - y1) * t;
    quads[q + 6] = x0 + (bentCorners[q + 6] - x0) * t; quads[q + 7] = y1 + (bentCorners[q + 7] - y1) * t;
  }
}
/** Centre of a module's shape in flat-map coordinates, bent or not. */
export const centreX = (i) => (quads ? (quads[i * 8] + quads[i * 8 + 4]) / 2 : (LX0[i] + LX1[i]) / 2);
export const centreY = (i) => (quads ? (quads[i * 8 + 1] + quads[i * 8 + 5]) / 2 : (LY0[i] + LY1[i]) / 2);
/** The module whose bent shape contains the point (wx, wy), or the nearest one within a few pixels. */
function quadAt(wx, wy) {
  const cols = Math.ceil(W / BUCKET), rowsN = Math.ceil(H / BUCKET);
  if (!quadBuckets) {
    quadBuckets = Array.from({ length: cols * rowsN }, () => []);
    for (let i = 0; i < N; i++) {
      const q = i * 8;
      const bx0 = Math.max(0, Math.floor(Math.min(quads[q], quads[q + 2], quads[q + 4], quads[q + 6]) / BUCKET)), bx1 = Math.min(cols - 1, Math.floor(Math.max(quads[q], quads[q + 2], quads[q + 4], quads[q + 6]) / BUCKET));
      const by0 = Math.max(0, Math.floor(Math.min(quads[q + 1], quads[q + 3], quads[q + 5], quads[q + 7]) / BUCKET)), by1 = Math.min(rowsN - 1, Math.floor(Math.max(quads[q + 1], quads[q + 3], quads[q + 5], quads[q + 7]) / BUCKET));
      for (let by = by0; by <= by1; by++) for (let bx = bx0; bx <= bx1; bx++) quadBuckets[by * cols + bx].push(i);
    }
  }
  const bx = Math.floor(wx / BUCKET), by = Math.floor(wy / BUCKET);
  if (bx < 0 || by < 0 || bx >= cols || by >= rowsN) return -1;
  let best = -1, bestDist = 4;
  for (const i of quadBuckets[by * cols + bx]) {
    const q = i * 8;
    let inside = false;
    for (let a = 0, b = 3; a < 4; b = a++) {
      const xa = quads[q + a * 2], ya = quads[q + a * 2 + 1], xb = quads[q + b * 2], yb = quads[q + b * 2 + 1];
      if (ya > wy !== yb > wy && wx < ((xb - xa) * (wy - ya)) / (yb - ya) + xa) inside = !inside;
    }
    if (inside) return i;
    const d = Math.hypot(centreX(i) - wx, centreY(i) - wy);
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return best;
}
$("bend").addEventListener("input", (e) => { state.bend = +e.target.value; computeQuads(); hideTip(); requestDraw(); });

// ---------------------------------------------------------------- highlight masks
export function countMask(mask) { let n = 0; for (let i = 0; i < N; i++) n += mask[i]; return n; }
export function maskWhere(test) { const m = new Uint8Array(N); for (let i = 0; i < N; i++) if (test(i)) m[i] = 1; return m; }
export function setMask(key, mask, label, chain = false) {
  if (!mask || state.maskKey === key) { state.mask = null; state.maskLabel = ""; state.maskKey = ""; state.chain = false; }
  else { state.mask = mask; state.maskKey = key; state.chain = chain; state.maskLabel = `Highlighted: ${label}`; }
  $("highlight-bar").hidden = !state.mask;
  $("highlight-text").textContent = state.maskLabel;
  document.querySelectorAll("[data-mask-key]").forEach((el) => el.setAttribute("aria-pressed", String(el.dataset.maskKey === state.maskKey)));
  requestDraw(); refreshMini();
}
export function setPreview(mask, label, { chain = false, marker = -1, tint = null } = {}) {
  const maskChanged = mask !== state.preview;
  state.preview = mask; state.previewTint = mask ? tint : null; state.previewLabel = mask ? label : ""; state.previewChain = chain; state.marker = marker;
  requestDraw();
  if (maskChanged) refreshMini(); else { drawMinimapOverlay(); $("rail-note").textContent = state.previewLabel || state.maskLabel || $("rail-note").textContent; }
}
$("highlight-clear").onclick = () => setMask("", null);

// ---------------------------------------------------------------- controls and legend
export function segmented(el, modes, current, onPick) {
  el.innerHTML = "";
  for (const m of modes) {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = m.label; b.setAttribute("role", "radio"); b.setAttribute("aria-checked", String(m === current()));
    b.onclick = () => { onPick(m); [...el.children].forEach((c, j) => c.setAttribute("aria-checked", String(modes[j] === m))); };
    el.append(b);
  }
}
segmented($("size-by"), SIZE_MODES, () => state.size, (m) => { state.size = m; layout(); renderLegend(); requestDraw(); refreshMini(); });
segmented($("colour-by"), COLOUR_MODES, () => state.colour, (m) => { state.colour = m; recolour(); renderLegend(); requestDraw(); refreshMini(); });
// the rewrite's map can show New or Lib alone
if (PARTS.length > 1) {
  const parts = [{ label: PARTS.length === 2 ? "Both" : "All", part: -1 }, ...PARTS.map((d, p) => ({ label: d.name, part: p }))];
  $("show-part").hidden = false;
  segmented($("show-part-seg"), parts, () => parts.find((m) => m.part === state.showPart), (m) => { state.showPart = m.part; layout(); renderLegend(); requestDraw(); refreshMini(); });
}
// Full screen shows the whole map section: controls, key and map. Where the browser refuses full screen
// (inside some embedded browsers), the section fills the browser window instead.
const fullLabel = () => { $("full-screen").textContent = document.fullscreenElement || document.body.classList.contains("map-full") ? "Exit full screen" : "Full screen"; };
// remember the controls' width on the page, so full screen lays them out the same way
const keepControlsWidth = () => $("map").style.setProperty("--map-controls-width", document.querySelector("#map .controls").getBoundingClientRect().width + "px");
const fillWindow = (on) => { if (on) keepControlsWidth(); document.body.classList.toggle("map-full", on); fullLabel(); resize(); };
$("full-screen").onclick = () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else if (document.body.classList.contains("map-full")) fillWindow(false);
  else if ($("map").requestFullscreen) {
    keepControlsWidth();
    $("map").requestFullscreen().catch(() => fillWindow(true));
    // some embedded browsers neither enter full screen nor refuse it
    setTimeout(() => { if (!document.fullscreenElement && !document.body.classList.contains("map-full")) fillWindow(true); }, 500);
  } else fillWindow(true);
};
addEventListener("fullscreenchange", () => { fullLabel(); resize(); });
addEventListener("keydown", (e) => { if (e.key === "Escape" && document.body.classList.contains("map-full")) fillWindow(false); });

export function sharesBy(groupOf, groups) {
  const totals = new Float64Array(groups);
  let all = 0;
  for (let i = 0; i < N; i++) { const v = visibleValue(i); totals[groupOf(i)] += v; all += v; }
  return [...totals].map((t) => t / all);
}
export function renderLegend() {
  const el = $("legend"), mode = state.colour;
  el.innerHTML = "";
  if (mode.kind === "cat") {
    const isField = mode.id !== "kind";
    const labels = isField ? FAMILIES.map((f) => f.name) : KIND_NAMES;
    const groupOf = mode.id === "field" ? moduleFamily : mode.id === "dirfield" ? dirFamily : (i) => col.kind[i];
    const shares = sharesBy(groupOf, labels.length);
    // the percentages are shares of whatever the map is sized by
    el.insertAdjacentHTML("beforeend", `<span class="legend-head">Share ${esc(state.size.unit)}:</span>`);
    labels.map((name, g) => ({ name, g, share: shares[g] })).filter((d) => d.share > 0).sort((a, b) => b.share - a.share).forEach(({ name, g, share }) => {
      const b = document.createElement("button");
      const key = `${mode.id}:${g}`;
      b.type = "button"; b.dataset.maskKey = key; b.setAttribute("aria-pressed", String(state.maskKey === key));
      b.innerHTML = `<span class="sw" style="background:${palette[g]}"></span>${esc(name)} <span class="share">${pct(share)}</span>`;
      b.title = `${pct(share)} ${state.size.unit}. Click to highlight.`;
      b.onclick = () => setMask(key, maskWhere((i) => groupOf(i) === g), mode.id === "dirfield" ? `directories labelled “${name}”` : name);
      el.append(b);
    });
  } else {
    const ramp = palette.slice(0, 9);
    el.innerHTML = `<span>${esc(mode.low)}</span><span class="ramp" style="background:linear-gradient(to right, ${ramp.join(",")})"></span><span>${esc(mode.high)}</span>`
      + (mode.missing !== undefined ? `<span><span class="sw" style="background:${palette[9]}"></span>first module in its directory</span>` : "")
      ;
    if (mode.scale !== "linear") el.querySelector(".ramp").title = `${mode.scale === "log" ? "Logarithmic" : "Square-root"} scale`;
  }
}

// ---------------------------------------------------------------- zoom, hover, click
// A wheel gesture belongs to whatever was under the cursor when it began, so a page scroll
// that carries the map under the cursor keeps scrolling the page.
export let wheelOwner = null, lastWheel = 0;
addEventListener("wheel", (e) => {
  if (e.timeStamp - lastWheel > 350) wheelOwner = e.target === canvas ? "map" : "page";
  lastWheel = e.timeStamp;
}, { capture: true, passive: true });
export const zoom = d3.zoom().scaleExtent([1, 4000])
  .filter((e) => {
    if (e.type === "wheel") return wheelOwner === "map" && !(e.deltaY > 0 && transform.k <= 1.0001);
    if (e.type.startsWith("touch")) return e.touches.length > 1; // one finger scrolls the page
    return !e.button;
  })
  .on("zoom", (e) => { transform = e.transform; hideTip(); requestDraw(); });
export const sel = d3.select(canvas).call(zoom).on("dblclick.zoom", null);
$("reset-zoom").onclick = () => sel.transition().duration(350).call(zoom.transform, d3.zoomIdentity);

/** Name plates drawn by the last draw(): [x, y, width, height, directory] in canvas pixels. */
let plateHits = [];
export function leafAt(px, py) {
  // a directory's name plate is drawn over its first modules; pointing at the plate means the directory
  for (const p of plateHits) if (px >= p[0] && px < p[0] + p[2] && py >= p[1] && py < p[1] + p[3]) return { dir: p[4], leaf: -1, plate: true };
  const wx = (px - transform.x) / transform.k, wy = (py - transform.y) / transform.k;
  if (quads) { const i = quadAt(wx, wy); return i < 0 ? { dir: null, leaf: -1 } : { dir: dirs[leafDir[i]], leaf: i }; }
  let node = root;
  while (node.children) {
    let next = null;
    for (const c of node.children) if (wx >= c.x0 && wx < c.x1 && wy >= c.y0 && wy < c.y1) { next = c; break; }
    if (!next) return { dir: node.data.dir, leaf: -1 };
    node = next;
  }
  return { dir: node.parent.data.dir, leaf: node.data.leaf };
}
export const group = (i) => meta.groups[col.group[i]];
export const groupSize = new Uint32Array(meta.groups.length);
for (let i = 0; i < N; i++) groupSize[col.group[i]]++;
// One label cannot describe thousands of modules, so large groups show their directory name instead.
export const hasLabel = (i) => groupSize[col.group[i]] <= 3000 || group(i).sampled > 0; // labels made from sampled modules describe the directory even when it is large
export const spaced = (name) => name.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
export const labelOf = (i) => (hasLabel(i) ? group(i).label : spaced(dirs[leafDir[i]].name));
export const kindNote = ["", "Restates one theorem that is proved in another module", "Only imports other modules", "Only sets options or notation"];

export const secondsFmt = (s) => (s >= 3600 ? `${(s / 3600).toFixed(1)} hours` : s >= 120 ? `${Math.round(s / 60)} minutes` : `${s >= 10 ? Math.round(s) : s.toFixed(1)} seconds`);
export function moduleFacts(i) {
  const d = col.decls[i];
  return `${bytesFmt(col.bytes[i])} · ${linesText(col.lines[i], HAS_COMMENTS ? col.codeLines[i] : 0)} · ${plural(d, "declaration")}`;
}
/** The module's field with the colour square of its family, and the family's name when it differs from the field's. */
function fieldLine(i) {
  const g = fieldFamily[col.field[i]], field = meta.fields[col.field[i]].name, family = FAMILIES[g].name;
  return `<span class="sw" style="background:${isDark() ? FAMILIES[g].dark : FAMILIES[g].light}"></span>${esc(field)}${family === field ? "" : `<span class="family"> · ${esc(family)}</span>`}`;
}
/** The module's size in the measure the map is drawn by, for the line under its name on the map. */
function sizeLabel(i) {
  switch (state.size.id) {
    case "bytes": return bytesFmt(col.bytes[i]);
    case "zbytes": return `${bytesFmt(col.zbytes[i])} compressed`;
    case "lines": return plural(col.lines[i], "line");
    case "codeLines": return `${plural(col.codeLines[i], "line")} of code`;
    case "decls": return plural(col.decls[i], "declaration");
    case "build": return secondsFmt(col.build[i] / 10);
    default: return "";
  }
}

/** A module name broken at its word boundaries (capitals, digits, underscores) into lines that fit `width`. */
function wrapName(name, width, maxLines) {
  const parts = name.split(/(?<=[a-z0-9'_])(?=[A-Z])|(?<=_)/);
  const lines = [];
  let line = "";
  for (const part of parts) {
    if (line && ctx.measureText(line + part).width > width) { lines.push(line); line = part; } else line += part;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] += "…";
  }
  // a single word wider than the rectangle is cut, with an ellipsis
  return lines.map((l) => {
    if (ctx.measureText(l).width <= width) return l;
    while (l.length > 2 && ctx.measureText(l + "…").width > width) l = l.slice(0, -1);
    return l.endsWith("…") ? l : l + "…";
  });
}

/** Lines in a module or directory: all of them, and those holding code when the version has comments. */
const linesText = (all, code) => `${plural(all, "line")}${HAS_COMMENTS ? ` (${fmt(code)} of code)` : ""}`;

export function tipHtml(hit) {
  if (hit.leaf < 0) {
    const d = hit.dir;
    return `<b>${esc(d.name)}</b><span class="path">${esc(d.path)}/</span>${plural(d.end - d.start, "module")} · ${linesText(dirSum(d, "lines"), dirSum(d, "codeLines"))} · ${bytesFmt(dirSum(d, "bytes"))}${hit.plate ? "<br>Click to list what is in it" : ""}`;
  }
  const i = hit.leaf, g = group(i), mode = state.colour;
  let extra = "";
  if (mode.id === "height") extra = `<br>Import depth ${col.height[i]} of ${meta.totals.longestChain}`;
  else if (mode.id === "dependents") extra = `<br>${plural(col.dependents[i], "module depends", "modules depend")} on it (${fmt(col.indeg[i])} import it directly)`;
  else if (mode.id === "repeat") extra = col.repeat[i] === 255 ? "<br>First module in its directory" : `<br>${col.repeat[i]}% repeats the module before it`;
  else if (mode.id === "build" || state.size.id === "build") extra = `<br>Built in ${secondsFmt(col.build[i] / 10)} in one independent rebuild`;
  else if (mode.id === "literals") extra = `<br>${plural(col.literals[i], "numeric literal")} (${col.literalRate[i]} per 100 lines)`;
  else if (mode.id === "mathlib") extra = `<br>Its declarations mention ${plural(col.mathlibRefs[i], "Mathlib declaration")}`;
  else if (mode.id === "digits") extra = `<br>${col.digits[i]}% of its characters are the digits 0–9`;
  // the title is the first sentence of the module's own comment when it has one; otherwise the label of
  // its directory, which a language model wrote (see the details panel)
  const title = docs && docs[i] ? docs[i] : labelOf(i);
  return `<b>${esc(title)}</b><span class="path">${esc(pathOf(i))}</span>${moduleFacts(i)}<br>${fieldLine(i)}`
    + (col.kind[i] ? `<br>${kindNote[col.kind[i]]}` : "") + extra;
}
export const tip = $("tip");
export function hideTip() { tip.style.display = "none"; if (state.hover >= 0) { state.hover = -1; requestDraw(); } }
canvas.addEventListener("pointermove", (e) => {
  if (e.buttons) return;
  const r = canvas.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
  const hit = leafAt(px, py);
  if (!hit.dir) return hideTip();
  tip.innerHTML = tipHtml(hit);
  tip.style.display = "block";
  const tw = tip.offsetWidth, th = tip.offsetHeight;
  tip.style.left = Math.max(0, Math.min(px + 14, W - tw)) + "px";
  tip.style.top = (py + 18 + th > H ? Math.max(0, py - th - 10) : py + 18) + "px";
  canvas.style.cursor = hit.plate ? "pointer" : "";
  if (state.hover !== hit.leaf) { state.hover = hit.leaf; requestDraw(); }
});
canvas.addEventListener("pointerleave", hideTip);
export let downAt = null;
canvas.addEventListener("pointerdown", (e) => { downAt = [e.clientX, e.clientY]; });
canvas.addEventListener("click", (e) => {
  if (downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return; // it was a drag
  const r = canvas.getBoundingClientRect();
  const hit = leafAt(e.clientX - r.left, e.clientY - r.top);
  // clicking the module or directory whose details are open closes them; clicking another opens that one
  const drawer = $("drawer");
  const showing = !drawer.hidden && (hit.leaf >= 0 ? state.pinned === hit.leaf : hit.dir && drawer.dataset.dir === String(hit.dir.i));
  if (showing) closeDrawer();
  else if (hit.leaf >= 0) openModule(hit.leaf); else if (hit.dir) openDirectory(hit.dir);
});

export const famOf = (i) => fieldFamily[col.field[i]];
export const famColour = (g) => (isDark() ? FAMILIES[g].dark : FAMILIES[g].light);

export const chainMask = new Uint8Array(N);
for (const i of meta.chain) chainMask[i] = 1;
export const chainLabel = `The longest import chain, ${meta.chain.length} modules`;
export function chainTip(j) {
  const i = meta.chain[j - 1];
  return `${j} of ${meta.chain.length}\n${esc(pathOf(i))}<span class="say">${esc(labelOf(i))} · ${esc(meta.fields[col.field[i]].name)}</span>`;
}

// ---------------------------------------------------------------- sizing and first paint
export function resize() {
  const r = canvas.getBoundingClientRect();
  if (!r.width || (Math.round(r.width) === W && Math.round(r.height) === H)) return;
  W = Math.round(r.width); H = Math.round(r.height);
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = W * dpr; canvas.height = H * dpr;
  zoom.extent([[0, 0], [W, H]]).translateExtent([[0, 0], [W, H]]);
  transform = d3.zoomIdentity; sel.call(zoom.transform, d3.zoomIdentity);
  layout(); requestDraw(); refreshMini();
}
buildHierarchy();
recolour();
resize();
renderLegend();
new ResizeObserver(() => resize()).observe(canvas);
