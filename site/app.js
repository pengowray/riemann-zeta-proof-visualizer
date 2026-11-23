import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";
import * as Plot from "https://cdn.jsdelivr.net/npm/@observablehq/plot@0.6.16/+esm";
import { renderLean } from "./speech.js";
import { drawZeta } from "./zeta.js";
import { drawBent } from "./bent.js";

const REPO = "https://github.com/1337isnot1337/riemann-hypothesis-solved";
const SHA = "6193bb5ef61846c045c70c51ee05824f910d50cc";
const SRC = "extracted/lean/src/";
const blobUrl = (path) => `${REPO}/blob/${SHA}/${SRC}${encodeURI(path)}`;
const treeUrl = (path) => `${REPO}/tree/${SHA}/${SRC}${encodeURI(path)}`;
const rawUrl = (path) => `https://raw.githubusercontent.com/1337isnot1337/riemann-hypothesis-solved/${SHA}/${SRC}${encodeURI(path)}`;

const $ = (id) => document.getElementById(id);
const fmt = d3.format(",");
const pct = (x) => (x >= 0.1 ? d3.format(".0%")(x) : x >= 0.001 ? d3.format(".1%")(x) : x > 0 ? "<0.1%" : "0%");
const bytesFmt = (b) => (b >= 1e9 ? (b / 1e9).toFixed(2) + " GB" : b >= 1e6 ? (b / 1e6).toFixed(1) + " MB" : b >= 1e3 ? (b / 1e3).toFixed(1) + " kB" : b + " bytes");
const plural = (n, one, many) => `${fmt(n)} ${n === 1 ? one : many || one + "s"}`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// ---------------------------------------------------------------- data
const [meta, colBuf] = await Promise.all([
  fetch("data/meta.json").then((r) => r.json()),
  fetch("data/cols.bin").then((r) => r.arrayBuffer()),
]);
const N = meta.files;
const TYPES = { I: Uint32Array, H: Uint16Array, B: Uint8Array };
const col = {};
for (const c of meta.columns) col[c.name] = new TYPES[c.type](colBuf, c.offset, N);
const ones = new Uint8Array(N).fill(1);

// directories: [name, parent, firstFile, directFileCount, subtreeEnd]
const dirs = meta.dirs.map(([name, parent, start, count, end], i) => ({ i, name, parent, start, count, end, depth: 0, path: "" }));
for (const d of dirs) {
  if (d.parent >= 0) { const p = dirs[d.parent]; d.depth = p.depth + 1; d.path = p.path ? p.path + "/" + d.name : d.name; }
}
const leafDir = new Uint16Array(N);
for (const d of dirs) for (let i = d.start; i < d.start + d.count; i++) leafDir[i] = d.i;

// Fields are folded into eight colour families (a treemap cannot keep 17 hues apart).
const FAMILIES = [
  { name: "Analytic number theory", fields: ["analytic-nt"], light: "#e34948", dark: "#e66767" },
  { name: "Algebraic number theory and cohomology", fields: ["algebraic-nt", "cohomology"], light: "#2a78d6", dark: "#3987e5" },
  { name: "Automorphic forms and representation theory", fields: ["automorphic", "rep-theory"], light: "#6250d6", dark: "#9085e9" },
  { name: "Theta series and theta correspondence", fields: ["theta"], light: "#e87ba4", dark: "#d55181" },
  { name: "Arithmetic and algebraic geometry", fields: ["arith-geom", "padic-hodge", "alg-geom"], light: "#008300", dark: "#0ca30c" },
  { name: "Algebra and combinatorics", fields: ["algebra", "combinatorics", "computation"], light: "#eda100", dark: "#c98500" },
  { name: "Lattices and geometry of numbers", fields: ["lattices"], light: "#1baf7a", dark: "#199e70" },
  { name: "Analysis and measure theory", fields: ["harmonic", "analysis", "measure"], light: "#eb6834", dark: "#d95926" },
  { name: "Not classified", fields: ["glue", "unknown"], light: "#a8a294", dark: "#6b665b" },
];
const fieldFamily = meta.fields.map((f) => FAMILIES.findIndex((fam) => fam.fields.includes(f.id)));
const moduleFamily = (i) => fieldFamily[col.field[i]]; // from the identifiers the module uses
const dirFamily = (i) => fieldFamily[meta.groups[col.group[i]].field]; // from its directory's label
const KIND_NAMES = ["States and proves mathematics", "Restates one theorem proved in another module", "Only imports other modules", "Only sets options or notation"];
const KIND_COLOURS = [["#2a78d6", "#3987e5"], ["#eb6834", "#d95926"], ["#1baf7a", "#199e70"], ["#a8a294", "#6b665b"]];
const SEQ = ["#cde2fb", "#b7d3f6", "#9ec5f4", "#86b6ef", "#6da7ec", "#5598e7", "#3987e5", "#2a78d6", "#256abf", "#1c5cab", "#184f95", "#104281", "#0d366b"];

const darkQuery = matchMedia("(prefers-color-scheme: dark)");
const isDark = () => darkQuery.matches;
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

const SIZE_MODES = [
  { id: "bytes", label: "Bytes", values: col.bytes, unit: "of the bytes" },
  { id: "lines", label: "Lines", values: col.lines, unit: "of the lines" },
  { id: "zbytes", label: "Compressed bytes", values: col.zbytes, unit: "of the compressed bytes" },
  { id: "modules", label: "Modules", values: ones, unit: "of the modules" },
  { id: "decls", label: "Declarations", values: col.decls, unit: "of the declarations" },
];
const COLOUR_MODES = [
  { id: "field", label: "Field of each module", kind: "cat" },
  { id: "dirfield", label: "Field of its directory", kind: "cat" },
  { id: "kind", label: "Kind of module", kind: "cat" },
  { id: "height", label: "Import depth", kind: "seq", values: col.height, scale: "linear", low: "imports no other module", high: `${meta.totals.longestChain} modules deep`, noun: "import depth" },
  { id: "dependents", label: "Dependents", kind: "seq", values: col.dependents, scale: "log", low: "no module depends on it", high: `${fmt(d3.max(col.dependents))} modules depend on it`, noun: "dependents" },
  { id: "repeat", label: "Repeats its neighbour", kind: "seq", values: col.repeat, scale: "linear", max: 100, missing: 255, low: "0% repeated", high: "100% repeated", noun: "repeated" },
  { id: "digits", label: "Digits", kind: "seq", values: col.digits, scale: "sqrt", low: "0% digits", high: `${d3.max(col.digits)}% digits`, noun: "digits" },
];
const state = { size: SIZE_MODES[0], colour: COLOUR_MODES[0], mask: null, maskLabel: "", maskKey: "", preview: null, previewLabel: "", chain: false, previewChain: false, marker: -1, hover: -1, pinned: -1 };

let names = null; // loaded after first paint
const namesReady = fetch("data/names.txt").then((r) => r.text()).then((t) => { names = t.split("\n"); return names; });
const pathOf = (i) => { const d = dirs[leafDir[i]]; return (d.path ? d.path + "/" : "") + (names ? names[i] : "…") + ".lean"; };
let termBits = null;
const termsReady = () => (termBits ||= fetch("data/terms.bin").then((r) => r.arrayBuffer()).then((b) => new Uint8Array(b)));

// prefix sums give any directory's total in constant time (a subtree is a contiguous range of files)
const prefix = {};
for (const [key, arr] of [["bytes", col.bytes], ["lines", col.lines], ["zbytes", col.zbytes], ["decls", col.decls]]) {
  const p = new Float64Array(N + 1);
  for (let i = 0; i < N; i++) p[i + 1] = p[i] + arr[i];
  prefix[key] = p;
}
const dirSum = (d, key) => prefix[key][d.end] - prefix[key][d.start];

// ---------------------------------------------------------------- treemap layout
const canvas = $("treemap");
const ctx = canvas.getContext("2d");
const HEADER = [0, 18, 13]; // height in px at zoom 1 of a directory's name strip, by depth
const GAP = [4, 2, 1];
let W = 0, H = 0, root = null;
const LX0 = new Float32Array(N), LY0 = new Float32Array(N), LX1 = new Float32Array(N), LY1 = new Float32Array(N);

function buildHierarchy() {
  const nodes = dirs.map((d) => ({ dir: d, children: [] }));
  for (const d of dirs) {
    const node = nodes[d.i];
    for (let i = d.start; i < d.start + d.count; i++) node.children.push({ leaf: i });
    if (d.parent >= 0) nodes[d.parent].children.push(node);
  }
  root = d3.hierarchy(nodes[0]);
  root.each((n) => { if (n.data.dir) n.data.dir.node = n; });
}

function layout() {
  const values = state.size.values;
  root.sum((d) => (d.leaf === undefined ? 0 : values[d.leaf]));
  d3.treemap().size([W, H]).round(false)
    .paddingTop((n) => HEADER[n.depth] || 0)
    .paddingInner((n) => GAP[n.depth] || 0)(root);
  for (const n of root.leaves()) {
    const i = n.data.leaf;
    if (i === undefined) continue;
    LX0[i] = n.x0; LY0[i] = n.y0; LX1[i] = n.x1; LY1[i] = n.y1;
  }
}

// ---------------------------------------------------------------- colours
const cidx = new Uint8Array(N);
let palette = [], paletteInk = [];
function luminance(hex) {
  const c = d3.rgb(hex);
  return (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
}
function seqColours() {
  // 9 steps from "near the surface" to "far from it": light to dark on paper, dark to light on a dark page
  const ramp = d3.quantize(d3.interpolateRgbBasis(isDark() ? ["#0d366b", "#1c5cab", "#3987e5", "#86b6ef", "#cde2fb"] : ["#cde2fb", "#86b6ef", "#3987e5", "#1c5cab", "#0d366b"]), 9);
  return ramp.map((c) => d3.rgb(c).formatHex());
}
function seqStep(mode) {
  const max = mode.max ?? d3.max(mode.values);
  const f = mode.scale === "log" ? (v) => Math.log1p(v) / Math.log1p(max) : mode.scale === "sqrt" ? (v) => Math.sqrt(v / max) : (v) => v / max;
  return (v) => (v === mode.missing ? 9 : Math.min(8, Math.floor(f(v) * 9)));
}
function recolour() {
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
let transform = d3.zoomIdentity;
let drawQueued = false;
function requestDraw() { if (!drawQueued) { drawQueued = true; requestAnimationFrame(() => { drawQueued = false; draw(); }); } }
const activeMask = () => state.preview || state.mask;

function draw() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const { k, x: tx, y: ty } = transform;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const paper2 = cssVar("--paper-2"), paper = cssVar("--paper"), paper3 = cssVar("--paper-3"), ink = cssVar("--ink"), ink2 = cssVar("--ink-2");
  ctx.fillStyle = paper2; ctx.fillRect(0, 0, W, H);
  const vx0 = -tx / k, vy0 = -ty / k, vx1 = (W - tx) / k, vy1 = (H - ty) / k;

  // directory backgrounds (they show through as the name strips and the gaps)
  for (const d of dirs) {
    if (d.depth === 0 || d.depth > 2) continue;
    const n = d.node;
    if (n.x1 < vx0 || n.x0 > vx1 || n.y1 < vy0 || n.y0 > vy1) continue;
    ctx.fillStyle = d.depth % 2 ? paper : paper3;
    ctx.fillRect(n.x0 * k + tx, n.y0 * k + ty, (n.x1 - n.x0) * k, (n.y1 - n.y0) * k);
  }

  const mask = activeMask();
  const bg = d3.rgb(paper2);
  for (let pass = 0; pass < (mask ? 2 : 1); pass++) {
    for (let c = 0; c < palette.length; c++) {
      let fill = palette[c];
      if (mask && pass === 0) { const f = d3.rgb(fill); fill = d3.rgb(bg.r + (f.r - bg.r) * 0.16, bg.g + (f.g - bg.g) * 0.16, bg.b + (f.b - bg.b) * 0.16).formatHex(); }
      ctx.fillStyle = fill;
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

  // directory names: the two outer levels have a name strip; deeper directories get a
  // name plate in their top-left corner once they are large on screen and the plate
  // would not cover a plate already drawn
  ctx.textBaseline = "middle";
  const plates = [];
  for (const d of dirs) {
    if (d.depth === 0 || d.depth > 8) continue;
    const n = d.node;
    if (n.x1 < vx0 || n.x0 > vx1 || n.y1 < vy0 || n.y0 > vy1) continue;
    const w = (n.x1 - n.x0) * k, h = (n.y1 - n.y0) * k;
    const strip = (HEADER[d.depth] || 0) * k;
    const plate = !strip;
    if (plate ? w < 150 || h < 60 : strip < 11 || w < 34 || h < strip) continue;
    const size = plate ? 11 : Math.min(14, Math.max(10.5, strip * 0.7));
    ctx.font = `${d.depth === 1 ? 600 : 400} ${size}px "STIX Two Text", serif`;
    const x = Math.max(n.x0 * k + tx, 0) + 4;
    const room = Math.min(n.x1 * k + tx - x - 4, plate ? 260 : 1e9);
    let text = d.name.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
    if (ctx.measureText(text).width > room) {
      while (text.length > 3 && ctx.measureText(text + "…").width > room) text = text.slice(0, -1);
      if (text.length <= 3) continue;
      text += "…";
    }
    const y = Math.max(n.y0 * k + ty, plate ? 0 : -1e9);
    if (plate) {
      const pw = ctx.measureText(text).width + 8, ph = 15;
      if (plates.some((p) => x - 4 < p[0] + p[2] && p[0] < x - 4 + pw && y < p[1] + p[3] && p[1] < y + ph)) continue;
      plates.push([x - 4, y, pw, ph]);
      ctx.fillStyle = paper; ctx.fillRect(x - 4, y, pw, ph);
      ctx.fillStyle = ink2; ctx.fillText(text, x, y + ph / 2 + 0.5);
    } else {
      plates.push([x - 4, y, ctx.measureText(text).width + 8, Math.min(strip, 20)]);
      ctx.fillStyle = d.depth === 1 ? ink : ink2;
      ctx.fillText(text, x, y + Math.min(strip, 20) / 2 + 0.5);
    }
  }

  // module names, once the rectangles are large enough to hold them
  if (names && k > 6) {
    ctx.font = '10.5px "JuliaMono", monospace';
    ctx.textBaseline = "top";
    for (let i = 0; i < N; i++) {
      const x0 = LX0[i], x1 = LX1[i], y0 = LY0[i], y1 = LY1[i];
      if (x1 < vx0 || x0 > vx1 || y1 < vy0 || y0 > vy1) continue;
      const w = (x1 - x0) * k, h = (y1 - y0) * k;
      if (w < 60 || h < 15) continue;
      if (mask && !mask[i]) continue;
      ctx.save();
      ctx.beginPath(); ctx.rect(x0 * k + tx, y0 * k + ty, w - 2, h); ctx.clip();
      ctx.fillStyle = paletteInk[cidx[i]];
      ctx.fillText(names[i], x0 * k + tx + 3, y0 * k + ty + 3);
      ctx.restore();
    }
  }

  if (state.chain || state.previewChain) {
    // faint lines hint at the order; the dots carry the positions
    ctx.strokeStyle = ink; ctx.globalAlpha = 0.3; ctx.lineWidth = 0.7; ctx.lineJoin = "round"; ctx.beginPath();
    meta.chain.forEach((i, j) => {
      const x = ((LX0[i] + LX1[i]) / 2) * k + tx, y = ((LY0[i] + LY1[i]) / 2) * k + ty;
      j ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.stroke(); ctx.globalAlpha = 1;
    ctx.fillStyle = ink;
    for (const i of meta.chain) { ctx.beginPath(); ctx.arc(((LX0[i] + LX1[i]) / 2) * k + tx, ((LY0[i] + LY1[i]) / 2) * k + ty, 3, 0, 7); ctx.fill(); }
  }

  for (const [i, width] of [[state.pinned, 2.5], [state.hover, 1.5]]) {
    if (i < 0) continue;
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
    ctx.arc(((LX0[i] + LX1[i]) / 2) * k + tx, ((LY0[i] + LY1[i]) / 2) * k + ty, 9, 0, 7); ctx.stroke();
  }
  $("reset-zoom").hidden = k < 1.02;
  drawMinimapOverlay();
}

// ---------------------------------------------------------------- minimap (the signpost in the left rail)
const mini = $("minimap");
const miniCtx = mini.getContext("2d");
const miniBase = document.createElement("canvas");
function drawMinimapBase() {
  if (!mini.offsetParent) return;
  const dpr = Math.min(devicePixelRatio || 1, 2), mw = 200, mh = 125;
  miniBase.width = mw * dpr; miniBase.height = mh * dpr;
  const c = miniBase.getContext("2d");
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const bg = d3.rgb(cssVar("--paper-2"));
  c.fillStyle = bg.formatHex(); c.fillRect(0, 0, mw, mh);
  const sx = mw / W, sy = mh / H, mask = activeMask();
  for (let pass = 0; pass < (mask ? 2 : 1); pass++) {
    for (let p = 0; p < palette.length; p++) {
      let fill = palette[p];
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
function drawMinimapOverlay() {
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
  }
  if (transform.k > 1.02) {
    const sx = (200 / W) * dpr, sy = (125 / H) * dpr, { k, x, y } = transform;
    miniCtx.strokeStyle = cssVar("--ink"); miniCtx.lineWidth = 1.5 * dpr;
    miniCtx.strokeRect((-x / k) * sx, (-y / k) * sy, (W / k) * sx, (H / k) * sy);
  }
}
let miniTimer = 0;
const refreshMini = () => { clearTimeout(miniTimer); miniTimer = setTimeout(() => { drawMinimapBase(); refreshBent(); }, 30); };

// ---------------------------------------------------------------- the map bent by ζ
const bent = $("bent"), bentTip = $("bent-tip");
let bentVisible = false, bentStale = true, bentPick = null;
function refreshBent() {
  bentStale = true;
  if (!bentVisible || !W) return;
  bentStale = false;
  bentPick = drawBent(bent, { W, H, LX0, LY0, LX1, LY1, cidx, palette, mask: activeMask(), background: d3.rgb(cssVar("--paper")).formatHex(), n: N });
}
new IntersectionObserver((entries) => { bentVisible = entries[0].isIntersecting; if (bentVisible && bentStale) refreshBent(); }, { rootMargin: "300px" }).observe(bent);
const bentLeaf = (e) => { const r = bent.getBoundingClientRect(); return bentPick ? bentPick(e.clientX - r.left, e.clientY - r.top) : -1; };
bent.addEventListener("pointermove", (e) => {
  const i = bentLeaf(e);
  if (i < 0) { bentTip.style.display = "none"; return; }
  const r = bent.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
  bentTip.innerHTML = tipHtml({ leaf: i, dir: dirs[leafDir[i]] });
  bentTip.style.display = "block";
  bentTip.style.left = Math.max(0, Math.min(px + 14, r.width - bentTip.offsetWidth)) + "px";
  bentTip.style.top = (py + 18 + bentTip.offsetHeight > r.height ? Math.max(0, py - bentTip.offsetHeight - 10) : py + 18) + "px";
});
bent.addEventListener("pointerleave", () => { bentTip.style.display = "none"; });
bent.addEventListener("click", (e) => { const i = bentLeaf(e); if (i >= 0) openModule(i); });

// ---------------------------------------------------------------- highlight masks
function countMask(mask) { let n = 0; for (let i = 0; i < N; i++) n += mask[i]; return n; }
function maskWhere(test) { const m = new Uint8Array(N); for (let i = 0; i < N; i++) if (test(i)) m[i] = 1; return m; }
function setMask(key, mask, label, chain = false) {
  if (!mask || state.maskKey === key) { state.mask = null; state.maskLabel = ""; state.maskKey = ""; state.chain = false; }
  else { state.mask = mask; state.maskKey = key; state.chain = chain; state.maskLabel = `Highlighted: ${label}`; }
  $("highlight-bar").hidden = !state.mask;
  $("highlight-text").textContent = state.maskLabel;
  document.querySelectorAll("[data-mask-key]").forEach((el) => el.setAttribute("aria-pressed", String(el.dataset.maskKey === state.maskKey)));
  requestDraw(); refreshMini();
}
function setPreview(mask, label, { chain = false, marker = -1 } = {}) {
  const maskChanged = mask !== state.preview;
  state.preview = mask; state.previewLabel = mask ? label : ""; state.previewChain = chain; state.marker = marker;
  requestDraw();
  if (maskChanged) refreshMini(); else { drawMinimapOverlay(); $("rail-note").textContent = state.previewLabel || state.maskLabel || $("rail-note").textContent; }
}
$("highlight-clear").onclick = () => setMask("", null);

// ---------------------------------------------------------------- controls and legend
function segmented(el, modes, current, onPick) {
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

function sharesBy(groupOf, groups) {
  const totals = new Float64Array(groups), v = state.size.values;
  let all = 0;
  for (let i = 0; i < N; i++) { totals[groupOf(i)] += v[i]; all += v[i]; }
  return [...totals].map((t) => t / all);
}
function renderLegend() {
  const el = $("legend"), mode = state.colour;
  el.innerHTML = "";
  if (mode.kind === "cat") {
    const isField = mode.id !== "kind";
    const labels = isField ? FAMILIES.map((f) => f.name) : KIND_NAMES;
    const groupOf = mode.id === "field" ? moduleFamily : mode.id === "dirfield" ? dirFamily : (i) => col.kind[i];
    const shares = sharesBy(groupOf, labels.length);
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
      + (mode.scale !== "linear" ? `<span class="share">(${mode.scale === "log" ? "logarithmic" : "square-root"} scale)</span>` : "");
  }
}

// ---------------------------------------------------------------- zoom, hover, click
// A wheel gesture belongs to whatever was under the cursor when it began, so a page scroll
// that carries the map under the cursor keeps scrolling the page.
let wheelOwner = null, lastWheel = 0;
addEventListener("wheel", (e) => {
  if (e.timeStamp - lastWheel > 350) wheelOwner = e.target === canvas ? "map" : "page";
  lastWheel = e.timeStamp;
}, { capture: true, passive: true });
const zoom = d3.zoom().scaleExtent([1, 4000])
  .filter((e) => {
    if (e.type === "wheel") return wheelOwner === "map" && !(e.deltaY > 0 && transform.k <= 1.0001);
    if (e.type.startsWith("touch")) return e.touches.length > 1; // one finger scrolls the page
    return !e.button;
  })
  .on("zoom", (e) => { transform = e.transform; hideTip(); requestDraw(); });
const sel = d3.select(canvas).call(zoom).on("dblclick.zoom", null);
$("reset-zoom").onclick = () => sel.transition().duration(350).call(zoom.transform, d3.zoomIdentity);

function leafAt(px, py) {
  const wx = (px - transform.x) / transform.k, wy = (py - transform.y) / transform.k;
  let node = root;
  while (node.children) {
    let next = null;
    for (const c of node.children) if (wx >= c.x0 && wx < c.x1 && wy >= c.y0 && wy < c.y1) { next = c; break; }
    if (!next) return { dir: node.data.dir, leaf: -1 };
    node = next;
  }
  return { dir: node.parent.data.dir, leaf: node.data.leaf };
}
const group = (i) => meta.groups[col.group[i]];
const groupSize = new Uint32Array(meta.groups.length);
for (let i = 0; i < N; i++) groupSize[col.group[i]]++;
// One label cannot describe thousands of modules, so large groups show their directory name instead.
const hasLabel = (i) => groupSize[col.group[i]] <= 3000;
const spaced = (name) => name.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
const labelOf = (i) => (hasLabel(i) ? group(i).label : spaced(dirs[leafDir[i]].name));
const kindNote = ["", "Restates one theorem that is proved in another module", "Only imports other modules", "Only sets options or notation"];

function moduleFacts(i) {
  const d = col.decls[i];
  return `${bytesFmt(col.bytes[i])} · ${plural(col.lines[i], "line")} · ${plural(d, "declaration")}`;
}
function tipHtml(hit) {
  if (hit.leaf < 0) {
    const d = hit.dir;
    return `<b>${esc(d.name)}</b><span class="path">${esc(d.path)}/</span>${plural(d.end - d.start, "module")} · ${fmt(dirSum(d, "lines"))} lines · ${bytesFmt(dirSum(d, "bytes"))}`;
  }
  const i = hit.leaf, g = group(i), mode = state.colour;
  let extra = "";
  if (mode.id === "height") extra = `<br>Import depth ${col.height[i]} of ${meta.totals.longestChain}`;
  else if (mode.id === "dependents") extra = `<br>${plural(col.dependents[i], "module depends", "modules depend")} on it (${fmt(col.indeg[i])} import it directly)`;
  else if (mode.id === "repeat") extra = col.repeat[i] === 255 ? "<br>First module in its directory" : `<br>${col.repeat[i]}% repeats the module before it`;
  else if (mode.id === "digits") extra = `<br>${col.digits[i]}% of its characters are digits`;
  return `<b>${esc(labelOf(i))}</b><span class="path">${esc(pathOf(i))}</span>${moduleFacts(i)}<br>${esc(meta.fields[col.field[i]].name)}`
    + (col.kind[i] ? `<br>${kindNote[col.kind[i]]}` : "") + extra;
}
const tip = $("tip");
function hideTip() { tip.style.display = "none"; if (state.hover >= 0) { state.hover = -1; requestDraw(); } }
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
  if (state.hover !== hit.leaf) { state.hover = hit.leaf; requestDraw(); }
});
canvas.addEventListener("pointerleave", hideTip);
let downAt = null;
canvas.addEventListener("pointerdown", (e) => { downAt = [e.clientX, e.clientY]; });
canvas.addEventListener("click", (e) => {
  if (downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return; // it was a drag
  const r = canvas.getBoundingClientRect();
  const hit = leafAt(e.clientX - r.left, e.clientY - r.top);
  if (hit.leaf >= 0) openModule(hit.leaf); else if (hit.dir) openDirectory(hit.dir);
});

// ---------------------------------------------------------------- details drawer
const drawer = $("drawer"), drawerBody = $("drawer-body");
function closeDrawer() { drawer.hidden = true; state.pinned = -1; requestDraw(); }
$("drawer-close").onclick = closeDrawer;
addEventListener("keydown", (e) => { if (e.key === "Escape" && !drawer.hidden) closeDrawer(); });
addEventListener("pointerdown", (e) => { if (!drawer.hidden && !drawer.contains(e.target) && e.target !== canvas && e.target !== bent && !e.target.closest("#graph") && !e.target.closest("button.link")) closeDrawer(); });

function groupBlock(g) {
  return `<p><b>${esc(g.label)}.</b> ${esc(g.gloss)}</p>` + (g.objects.length ? `<p class="note">Named in this directory's label: ${g.objects.map(esc).join(", ")}.</p>` : "");
}
async function openModule(i) {
  await namesReady;
  state.pinned = i; requestDraw();
  const path = pathOf(i), g = group(i);
  drawer.hidden = false; drawer.scrollTop = 0;
  drawerBody.innerHTML = `<h2>${esc(names[i])}.lean</h2>
    <a class="path" href="${blobUrl(path)}" target="_blank" rel="noopener">${esc(path)}</a>
    <dl>
      <dt>Size</dt><dd>${moduleFacts(i)}</dd>
      <dt>Field</dt><dd>${esc(meta.fields[col.field[i]].name)} (keyword estimate)</dd>
      ${col.kind[i] ? `<dt>Kind</dt><dd>${kindNote[col.kind[i]]}</dd>` : ""}
      <dt>Imported by</dt><dd>${plural(col.indeg[i], "module")} directly, ${fmt(col.dependents[i])} in total</dd>
      <dt>Import depth</dt><dd>${col.height[i]} of ${meta.totals.longestChain}</dd>
      ${col.repeat[i] !== 255 ? `<dt>Repetition</dt><dd>${col.repeat[i]}% repeats the module before it in this directory</dd>` : ""}
    </dl>
    ${hasLabel(i) ? groupBlock(g) : ""}
    <div id="drawer-outline"></div>
    <h3>Source</h3>
    <pre class="lean" id="drawer-code">Loading the module from GitHub…</pre>
    <p class="spoken" id="drawer-spoken">Point at a line to read it aloud in words.</p>`;
  try {
    const res = await fetch(rawUrl(path));
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    let text = await res.text();
    if (state.pinned !== i) return;
    $("drawer-outline").innerHTML = outlineHtml(text);
    const limit = 60000;
    const cut = text.length > limit;
    if (cut) text = text.slice(0, text.lastIndexOf("\n", limit));
    $("drawer-code").innerHTML = renderLean(text);
    if (cut) $("drawer-code").insertAdjacentHTML("afterend", `<p class="note">Showing the first ${fmt(text.split("\n").length)} of ${fmt(col.lines[i])} lines. <a href="${blobUrl(path)}" target="_blank" rel="noopener">Open the whole module on GitHub</a></p>`);
  } catch (err) {
    if (state.pinned === i) $("drawer-code").textContent = `Couldn't load the module: ${err.message}. Open it on GitHub with the link above.`;
  }
}
// Module name such as "Formalism.VW.CritLine" -> file index, built on first use.
let moduleIndex = null;
function moduleLookup(name) {
  if (!moduleIndex) {
    moduleIndex = new Map();
    const prefix = dirs.map((d) => (d.path ? d.path.replaceAll("/", ".") + "." : ""));
    for (let i = 0; i < N; i++) moduleIndex.set(prefix[leafDir[i]] + names[i], i);
  }
  return moduleIndex.get(name);
}
const DECL_RE = /^[ \t]*(?:@\[[^\]\n]*\]\s*)*(?:(?:private|protected|noncomputable|nonrec|scoped|local)\s+)*(theorem|lemma|def|abbrev|instance|structure|class|inductive)\s+([^\s:({\[]*)/gm;
const SHOWN = 12; // rows shown before "Show all"
function foldedList(items, noun) {
  if (items.length <= SHOWN) return items.join("");
  return items.slice(0, SHOWN).join("") + `<div class="more" hidden>${items.slice(SHOWN).join("")}</div><button type="button" class="link show-all">Show all ${fmt(items.length)} ${noun}</button>`;
}
/** Declarations and imports of a module, read from its source text. */
function outlineHtml(text) {
  const decls = [];
  let m;
  DECL_RE.lastIndex = 0;
  while ((m = DECL_RE.exec(text))) {
    const rest = text.slice(m.index, m.index + 1500);
    const end = rest.search(/:=|\bwhere\b|\n\s*\|/);
    const statement = (end > 0 ? rest.slice(0, end) : rest.slice(0, 400)).trim();
    decls.push(`<div class="decl"><span class="decl-kind">${m[1]}</span> <b>${esc(m[2] || "(unnamed)")}</b><pre class="lean">${renderLean(statement.length > 900 ? statement.slice(0, 900) + " …" : statement)}</pre></div>`);
  }
  const imports = [...text.matchAll(/^import[ \t]+(\S+)/gm)].map((x) => x[1]);
  const importRows = imports.map((name) => {
    const i = moduleLookup(name);
    return i === undefined ? `<div class="mono">${esc(name)}</div>` : `<div><button class="link" data-open="${i}">${esc(name)}</button></div>`;
  });
  return `<h3>${plural(decls.length, "declaration")} in this module</h3>${decls.length ? foldedList(decls, "declarations") : '<p class="note">This module declares nothing of its own.</p>'}
    <h3>Imports ${plural(imports.length, "module")}</h3><div class="import-list">${foldedList(importRows, "imports")}</div>`;
}
document.addEventListener("click", (e) => {
  const b = e.target.closest(".show-all");
  if (b) { b.previousElementSibling.hidden = false; b.remove(); }
});

async function openDirectory(d) {
  await namesReady;
  state.pinned = -1;
  const idx = d3.range(d.start, d.end).sort((a, b) => col.bytes[b] - col.bytes[a]).slice(0, 12);
  const g = d.end > d.start ? group(d.start) : null;
  const sameGroup = g && d.path.startsWith(g.id);
  drawer.hidden = false; drawer.scrollTop = 0;
  drawerBody.innerHTML = `<h2>${esc(d.name)}</h2>
    <a class="path" href="${treeUrl(d.path)}" target="_blank" rel="noopener">${esc(d.path)}/</a>
    <dl><dt>Modules</dt><dd>${fmt(d.end - d.start)}</dd><dt>Lines</dt><dd>${fmt(dirSum(d, "lines"))}</dd>
    <dt>Size</dt><dd>${bytesFmt(dirSum(d, "bytes"))}</dd><dt>Declarations</dt><dd>${fmt(dirSum(d, "decls"))}</dd></dl>
    ${sameGroup && hasLabel(d.start) ? groupBlock(g) : ""}
    <h3>Largest modules</h3>
    <table class="data">${idx.map((i) => `<tr><td><button class="link" data-open="${i}">${esc(pathOf(i).slice(d.path.length + 1))}</button></td><td class="num">${bytesFmt(col.bytes[i])}</td></tr>`).join("")}</table>`;
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-open]");
  if (b) openModule(+b.dataset.open);
});

// hover text for Lean code, shared by every code block
const codetip = $("codetip");
document.addEventListener("pointermove", (e) => {
  const tk = e.target.closest?.(".tk[data-tip]"), ln = e.target.closest?.("pre.lean .ln");
  if (ln && ln.closest("#drawer")) $("drawer-spoken").textContent = ln.dataset.say ? `Read aloud: ${ln.dataset.say}` : "";
  const cell = e.target.closest?.("[data-chain]");
  if (!cell && !tk && !(ln && !ln.closest("#drawer") && ln.dataset.say)) { codetip.hidden = true; return; }
  codetip.innerHTML = cell ? chainTip(+cell.dataset.chain) : (tk ? esc(tk.dataset.tip) : "") + (ln && !ln.closest("#drawer") && ln.dataset.say ? `<span class="say">Read aloud: ${esc(ln.dataset.say)}</span>` : "");
  codetip.hidden = false;
  codetip.style.left = Math.min(e.clientX + 14, innerWidth - codetip.offsetWidth - 8) + "px";
  codetip.style.top = (e.clientY + 20 + codetip.offsetHeight > innerHeight ? e.clientY - codetip.offsetHeight - 10 : e.clientY + 20) + "px";
});

// ---------------------------------------------------------------- sizing and first paint
function resize() {
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
new ResizeObserver(() => refreshBent()).observe(bent);
darkQuery.addEventListener("change", () => { recolour(); renderLegend(); requestDraw(); refreshMini(); renderCharts(); });
namesReady.then(() => { requestDraw(); renderNameTables(); });

// ---------------------------------------------------------------- hero
const declTotal = d3.sum(meta.declKinds, (d) => d[1]);
const declCount = Object.fromEntries(meta.declKinds);
const sorryCount = Object.fromEntries(meta.tactics).sorry || 0;
$("facts").innerHTML = [
  ["Modules", `<b>${fmt(N)}</b>`],
  ["Lines of Lean", `<b>${fmt(meta.totals.lines)}</b>`],
  ["Source size", `<b>${bytesFmt(meta.totals.bytes)}</b>, or ${bytesFmt(meta.totals.zbytes)} with each file compressed by zlib`],
  ["Declarations", `<b>${fmt(declTotal)}</b>: ${fmt((declCount.theorem || 0) + (declCount.lemma || 0))} theorems and lemmas, ${fmt((declCount.def || 0) + (declCount.abbrev || 0))} definitions`],
  ["Comments", `<b>${fmt(meta.totals.commentBytes)}</b> bytes. The source has no comments or docstrings`],
  ["Uses of <code>sorry</code>", `<b>${fmt(sorryCount)}</b>`],
  ["Longest import chain", `<b>${fmt(meta.totals.longestChain)}</b> modules`],
].map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");

const zerosSeen = drawZeta($("zeta"), 60, (t) => { $("zeta-t").textContent = t.toFixed(1).padStart(4, " "); });
$("zeta-zeros").textContent = `The ${zerosSeen.length} zeros up to t = 60 are at t ≈ ${zerosSeen.map((z) => z.toFixed(2)).join(", ")}.`;

for (const [id, path] of [["code-statements", "Statements.lean"], ["code-main", "Main.lean"]]) {
  fetch(`data/${path}`).then((r) => r.text()).then((t) => { $(id).innerHTML = renderLean(t.trimEnd()); });
}

// ---------------------------------------------------------------- terms and search
const termsEl = $("terms");
meta.terms.forEach((term, t) => {
  const b = document.createElement("button");
  const key = `term:${t}`;
  b.type = "button"; b.dataset.maskKey = key; b.setAttribute("aria-pressed", "false");
  b.innerHTML = `${esc(term.label)}<span class="n">${fmt(term.files)}</span>`;
  const bytesPer = (N + 7) >> 3;
  const load = async () => { const bits = (await termsReady()).subarray(t * bytesPer, (t + 1) * bytesPer); return maskWhere((i) => (bits[i >> 3] >> (i & 7)) & 1); };
  b.onclick = async () => setMask(key, await load(), `${fmt(term.files)} modules that mention “${term.label}”`);
  termsEl.append(b);
});
let findTimer = 0;
$("find").addEventListener("input", (e) => {
  clearTimeout(findTimer);
  findTimer = setTimeout(async () => {
    const q = e.target.value.trim().toLowerCase();
    if (q.length < 2) { $("find-count").textContent = ""; if (state.maskKey.startsWith("find:")) setMask("", null); return; }
    await namesReady;
    const dirHit = dirs.map((d) => d.path.toLowerCase().includes(q));
    const mask = maskWhere((i) => dirHit[leafDir[i]] || names[i].toLowerCase().includes(q));
    const n = countMask(mask);
    $("find-count").textContent = `${plural(n, "module")} with “${e.target.value.trim()}” in the name or directory`;
    state.maskKey = ""; setMask(`find:${q}`, mask, `${plural(n, "module")} with “${e.target.value.trim()}” in the name or directory`);
  }, 200);
});

// ---------------------------------------------------------------- sections below the map
const famOf = (i) => fieldFamily[col.field[i]];
const famColour = (g) => (isDark() ? FAMILIES[g].dark : FAMILIES[g].light);
const plotStyle = () => ({ background: "transparent", color: cssVar("--ink"), fontFamily: cssVar("--serif"), fontSize: "13px", overflow: "visible" });
function mount(id, plot) { const el = $(id); el.innerHTML = ""; el.append(plot); }

function renderCharts() {
  // --- what takes up the space: share of each family under five measures
  const measures = [["Modules", ones], ["Lines", col.lines], ["Bytes", col.bytes], ["Compressed bytes", col.zbytes], ["Declarations", col.decls]];
  const rows = [];
  for (const [label, v] of measures) {
    const t = new Float64Array(FAMILIES.length);
    let all = 0;
    for (let i = 0; i < N; i++) { t[famOf(i)] += v[i]; all += v[i]; }
    FAMILIES.forEach((f, g) => { if (t[g]) rows.push({ measure: label, family: f.name, g, share: t[g] / all, total: t[g] }); });
  }
  const byBytes = rows.filter((r) => r.measure === "Bytes").sort((a, b) => b.share - a.share);
  $("space-text").textContent = `Fields are estimated from the identifiers each module uses. By that estimate no single area dominates. By bytes, the largest is ${byBytes[0].family.toLowerCase()} with ${pct(byBytes[0].share)}, followed by ${byBytes[1].family.toLowerCase()} (${pct(byBytes[1].share)}) and ${byBytes[2].family.toLowerCase()} (${pct(byBytes[2].share)}). Analytic number theory, where the theorem is stated, is ${pct(rows.find((r) => r.measure === "Bytes" && r.g === 0)?.share || 0)}. The shares are similar under every measure.`;
  const order = byBytes.map((r) => r.family);
  mount("space-chart", Plot.plot({
    style: plotStyle(), width: 1000, height: 270, marginLeft: 130, marginRight: 20, marginBottom: 44,
    x: { percent: true, label: "Share of total (%)", labelAnchor: "center", labelArrow: "none", grid: true }, y: { label: null, domain: measures.map((m) => m[0]) },
    color: { domain: FAMILIES.map((f) => f.name), range: FAMILIES.map((_, g) => famColour(g)) },
    marks: [
      Plot.barX(rows, Plot.stackX({ x: "share", y: "measure", fill: "family", order, insetLeft: 1, insetRight: 1, tip: { format: { x: false, y: false, fill: false }, fill: cssVar("--paper"), stroke: cssVar("--ink-3") }, title: (d) => `${d.family}\n${pct(d.share)} of ${d.measure.toLowerCase()} (${d.measure.includes("ytes") ? bytesFmt(d.total) : fmt(d.total)})` })),
      Plot.textX(rows.filter((r) => r.share > 0.06), Plot.stackX({ x: "share", y: "measure", order, z: "family", text: (d) => pct(d.share), fill: (d) => (luminance(famColour(d.g)) > 0.45 ? "#14130f" : "#fff") })),
    ],
  }));

  // --- top-level libraries
  const libs = dirs.filter((d) => d.depth === 1).map((d) => ({ d, modules: d.end - d.start, lines: dirSum(d, "lines"), bytes: dirSum(d, "bytes"), decls: dirSum(d, "decls") })).sort((a, b) => b.bytes - a.bytes);
  const maxB = libs[0].bytes;
  $("lib-table").innerHTML = `<tr><th>Library</th><th class="num">Modules</th><th class="num">Lines</th><th class="num">Declarations</th><th>Size</th></tr>`
    + libs.map((l) => `<tr class="hoverable" data-preview-dir="${l.d.i}"><td>${esc(l.d.name)}</td><td class="num">${fmt(l.modules)}</td><td class="num">${fmt(l.lines)}</td><td class="num">${fmt(l.decls)}</td><td><span class="bar" style="width:${(260 * l.bytes) / maxB}px;background:${cssVar("--ink-3")}"></span>${bytesFmt(l.bytes)} (${pct(l.bytes / meta.totals.bytes)})</td></tr>`).join("");

  // --- why so many modules
  const kindCount = [0, 0, 0, 0], one = [0, 0];
  const sortedLines = Float64Array.from(col.lines).sort();
  for (let i = 0; i < N; i++) { kindCount[col.kind[i]]++; if (col.decls[i] === 1) one[col.kind[i] ? 1 : 0]++; }
  const shapeDup = d3.sum(col.shape, (s) => (s >= 10 ? 1 : 0));
  $("modules-text").textContent = `The median module is ${sortedLines[N >> 1]} lines long, and ${fmt(one[0] + one[1])} modules (${pct((one[0] + one[1]) / N)}) contain exactly one declaration: the source is split to roughly one result per file. ${fmt(kindCount[1])} modules (${pct(kindCount[1] / N)}) do no mathematics of their own. Each of them restates one theorem and proves it by citing the same theorem from another module. They account for ${pct(d3.sum(col.bytes, (b, i) => (col.kind[i] === 1 ? b : 0)) / meta.totals.bytes)} of the bytes. Each module imports ${(meta.totals.importEdges / N).toFixed(1)} other modules of the project on average, and ${fmt(meta.totals.wholeMathlibImports)} modules import all of Mathlib.`;
  const edges = [1, 4, 10, 32, 100, 316, 1000, 1e9];
  const binLabel = (b) => (b === edges.length - 2 ? `${fmt(edges[b])}+` : `${fmt(edges[b])}–${fmt(edges[b + 1] - 1)}`);
  const lengthRows = d3.rollups(d3.range(N), (v) => v.length, (i) => d3.bisectRight(edges, Math.max(col.lines[i], 1)) - 1, (i) => (col.kind[i] === 1 ? 1 : 0))
    .flatMap(([b, ks]) => ks.map(([kind, n]) => ({ bin: binLabel(b), b, kind: kind ? "Restates a theorem" : "Other modules", n })));
  const kindScale = { domain: ["Other modules", "Restates a theorem"], range: [KIND_COLOURS[0][isDark() ? 1 : 0], KIND_COLOURS[1][isDark() ? 1 : 0]], legend: true };
  const tipOpts = { fill: cssVar("--paper"), stroke: cssVar("--ink-3") };
  mount("length-chart", Plot.plot({
    style: plotStyle(), width: 520, height: 300, marginLeft: 60, marginBottom: 46,
    x: { label: "Lines in the module", labelAnchor: "center", labelArrow: "none", domain: d3.range(edges.length - 1).map(binLabel) }, y: { label: "Modules", grid: true, tickFormat: "~s" }, color: kindScale,
    marks: [Plot.barY(lengthRows, { x: "bin", y: "n", fill: "kind", order: kindScale.domain, insetLeft: 1, insetRight: 1, tip: tipOpts, title: (d) => `${fmt(d.n)} modules with ${d.bin} lines\n${d.kind}` }), Plot.ruleY([0])],
  }));
  const repRows = d3.rollups(d3.range(N).filter((i) => col.repeat[i] !== 255), (v) => v.length, (i) => Math.min(9, Math.floor(col.repeat[i] / 10)), (i) => (col.kind[i] === 1 ? 1 : 0))
    .flatMap(([b, ks]) => ks.map(([kind, n]) => ({ bin: `${b * 10}–${b * 10 + 10}`, b, kind: kind ? "Restates a theorem" : "Other modules", n })));
  mount("repeat-chart", Plot.plot({
    style: plotStyle(), width: 520, height: 300, marginLeft: 60, marginBottom: 46,
    x: { label: "Share of the module that repeats its neighbour (%)", labelAnchor: "center", labelArrow: "none", domain: d3.range(10).map((b) => `${b * 10}–${b * 10 + 10}`) }, y: { label: "Modules", grid: true, tickFormat: "~s" }, color: kindScale,
    marks: [Plot.barY(repRows, { x: "bin", y: "n", fill: "kind", order: kindScale.domain, insetLeft: 1, insetRight: 1, tip: tipOpts, title: (d) => `${fmt(d.n)} modules\n${d.bin}% repeated\n${d.kind}` }), Plot.ruleY([0])],
  }));
  const medianRep = (kind) => d3.median(d3.range(N).filter((i) => col.repeat[i] !== 255 && (col.kind[i] === 1) === kind), (i) => col.repeat[i]);
  $("repeat-text").textContent = `Repetition is measured by compressing each module after the compressor has read the module before it in the same directory. For a typical module that states and proves mathematics, ${medianRep(false)}% of the text is repeated from its neighbour. For a typical restating module it is ${medianRep(true)}%. Apart from the restating modules, exact copies are rare: ${fmt(shapeDup)} modules belong to a group of ten or more that are identical once names and numbers are ignored.`;

  // --- areas of mathematics
  const fieldTotals = meta.fields.map(() => ({ modules: 0, lines: 0, bytes: 0 }));
  for (let i = 0; i < N; i++) { const t = fieldTotals[col.field[i]]; t.modules++; t.lines += col.lines[i]; t.bytes += col.bytes[i]; }
  const objects = meta.fields.map(() => new Map());
  meta.groups.forEach((g, gi) => { for (const o of g.objects) objects[g.field].set(o, (objects[g.field].get(o) || 0) + 1); });
  const maxLines = d3.max(fieldTotals, (t) => t.lines);
  $("field-table").innerHTML = `<tr><th>Field</th><th class="num">Modules</th><th class="num" title="Share of ${fmt(meta.totals.truth.n)} randomly chosen modules that a language model assigned to this field after reading them">In a sample of ${fmt(meta.totals.truth.n)}</th><th>Lines</th><th>Objects and theorems named in directory labels</th></tr>`
    + meta.fields.map((f, fi) => ({ f, fi, t: fieldTotals[fi] })).filter((r) => r.t.modules).sort((a, b) => b.t.lines - a.t.lines).map(({ f, fi, t }) =>
      `<tr class="hoverable" data-preview-field="${fi}"><td style="white-space:nowrap"><span class="sw" style="background:${famColour(fieldFamily[fi])}"></span>${esc(f.name)}</td><td class="num">${pct(t.modules / N)}</td><td class="num">${pct(meta.totals.truthCounts[fi] / meta.totals.truth.n)}</td>
       <td style="white-space:nowrap"><span class="bar" style="width:${(150 * t.lines) / maxLines}px;background:${famColour(fieldFamily[fi])}"></span>${fmt(t.lines)}</td>
       <td class="objects">${[...objects[fi]].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([o]) => esc(o)).join(" · ")}</td></tr>`).join("");

  // --- imports between fields
  const used = meta.fields.map((f, fi) => fi).filter((fi) => fieldTotals[fi].modules > 100);
  const cells = [];
  let same = 0, total = 0;
  meta.fieldMatrix.forEach((row, a) => row.forEach((n, b) => { total += n; if (a === b) same += n; }));
  for (const a of used) {
    const rowTotal = d3.sum(used, (b) => meta.fieldMatrix[a][b]);
    for (const b of used) cells.push({ from: meta.fields[a].name, to: meta.fields[b].name, n: meta.fieldMatrix[a][b], share: meta.fieldMatrix[a][b] / rowTotal });
  }
  $("imports-text").textContent = `The project has ${fmt(meta.totals.importEdges)} imports between its own modules. ${pct(same / total)} of them stay inside one field and ${pct(1 - same / total)} cross from one field to another. Every module is imported: all ${fmt(N)} are reachable from Main.lean by following imports.`;
  const fieldOrder = used.slice().sort((a, b) => fieldFamily[a] - fieldFamily[b]).map((fi) => meta.fields[fi].name);
  mount("matrix-chart", Plot.plot({
    style: plotStyle(), width: 900, height: 520, marginLeft: 240, marginBottom: 150, padding: 0.06,
    x: { label: "Imported field", domain: fieldOrder, tickRotate: -40 }, y: { label: "Importing field", domain: fieldOrder },
    color: { type: "sqrt", range: isDark() ? ["#1f1d18", "#9ec5f4"] : ["#efe9db", "#104281"], label: "Share of the row's imports", legend: true, percent: true },
    marks: [Plot.cell(cells, { x: "to", y: "from", fill: "share", tip: tipOpts, title: (d) => `${pct(d.share)} of imports made by ${d.from}\ngo to ${d.to}\n(${fmt(d.n)} imports)` })],
  }));

  // --- longest chain
  const chainRows = meta.chain.map((i, j) => ({ j: j + 1, i, family: FAMILIES[famOf(i)].name }));
  $("chain-text").innerHTML = `The longest chain of imports is ${meta.chain.length} modules: each module in it imports the one before. It ends at Main.lean. Each cell below is one module in the chain, coloured by field. Point at a cell to see where that module is on the map, and click it to read it. <button type="button" class="link" id="chain-show" data-mask-key="chain" aria-pressed="false">Draw the chain on the map</button>`;
  $("chain-show").onclick = () => { const m = new Uint8Array(N); for (const i of meta.chain) m[i] = 1; setMask("chain", m, `the longest import chain, ${meta.chain.length} modules`, true); $("map").scrollIntoView(); };
  $("chain-strip").innerHTML = `<div class="chain-cells">${chainRows.map((d) => `<button type="button" class="chain-cell" data-chain="${d.j}" data-open="${d.i}" style="background:${famColour(famOf(d.i))}" aria-label="Module ${d.j} of ${chainRows.length} in the chain"></button>`).join("")}</div>
    <div class="chain-axis"><span>1: imports no project module</span><span>${chainRows.length}: Main.lean</span></div>`;

  // --- numbers and tactics
  const tactics = meta.tactics.filter((t) => t[0] !== "sorry").slice(0, 24).map(([name, n]) => ({ name, n }));
  const tc = Object.fromEntries(meta.tactics);
  const longDigits = d3.sum(col.digits, (d) => (d >= 20 ? 1 : 0));
  $("numbers-text").textContent = `The source is proof text, not data. Only ${fmt(longDigits)} of the ${fmt(N)} modules are 20% digits or more. The proof never uses native_decide, and it uses decide ${fmt(tc.decide || 0)} times. The module with the most digits, Primes.lean, holds primality certificates checked with decide. The most common steps are have (state an intermediate fact, ${fmt(tc.have)} times), rw (rewrite with an equation, ${fmt(tc.rw)}) and exact (give the proof term, ${fmt(tc.exact)}).`;
  mount("tactic-chart", Plot.plot({
    style: plotStyle(), width: 760, height: 520, marginLeft: 130,
    x: { label: "Uses in the whole source", grid: true, tickFormat: "~s" }, y: { label: null, domain: tactics.map((t) => t.name) },
    marks: [Plot.barX(tactics, { x: "n", y: "name", fill: KIND_COLOURS[0][isDark() ? 1 : 0], tip: tipOpts, title: (d) => `${d.name}: ${fmt(d.n)} uses` }), Plot.ruleX([0])],
  }));
  document.querySelectorAll("#tactic-chart [aria-label='y-axis tick label'] text").forEach((t) => { t.style.fontFamily = cssVar("--mono"); });
}

// ---------------------------------------------------------------- import graph of regions
async function renderGraph() {
  const [{ default: cytoscape }, { default: fcose }] = await Promise.all([
    import("https://cdn.jsdelivr.net/npm/cytoscape@3.30.2/+esm"),
    import("https://cdn.jsdelivr.net/npm/cytoscape-fcose@2.2.0/+esm"),
  ]);
  cytoscape.use(fcose);
  const SPLIT = new Set(["Development", "GroundTheory", "CompanionTheory"]);
  const regionIdx = new Map(meta.regions.map((r, i) => [r, i]));
  const regionOfDir = dirs.map((d) => {
    const parts = d.path ? d.path.split("/") : [];
    if (!parts.length) return regionIdx.get("(top level)");
    return regionIdx.get(SPLIT.has(parts[0]) && parts.length > 1 ? parts[0] + "/" + parts[1] : parts[0]);
  });
  const R = meta.regions.length;
  const stats = Array.from({ length: R }, () => ({ modules: 0, bytes: 0, fam: new Float64Array(FAMILIES.length), first: N, last: 0 }));
  for (let i = 0; i < N; i++) {
    const st = stats[regionOfDir[leafDir[i]]];
    st.modules++; st.bytes += col.bytes[i]; st.fam[moduleFamily(i)] += col.bytes[i];
    if (i < st.first) st.first = i; if (i > st.last) st.last = i;
  }
  const M = meta.regionMatrix;
  const shown = d3.range(R).filter((r) => stats[r].modules >= 5);
  const elements = shown.map((r) => ({ data: { id: "r" + r, r, label: meta.regions[r].split("/").pop().replace(/([a-z])([A-Z])/g, "$1 $2"), size: 18 + Math.sqrt(stats[r].bytes / 1e6) * 7, colour: famColour(d3.maxIndex(stats[r].fam)) } }));
  let drawn = 0, crossTotal = 0;
  for (const a of shown) {
    const out = d3.sum(shown, (b) => (b === a ? 0 : M[a][b]));
    for (const b of shown) {
      if (a === b) continue;
      crossTotal += M[a][b];
      // keep an edge when it carries at least 4% of the importing directory's outside imports
      if (M[a][b] >= 20 && M[a][b] >= 0.04 * out) { elements.push({ data: { id: `e${a}_${b}`, source: "r" + a, target: "r" + b, n: M[a][b], w: 0.6 + Math.log10(M[a][b]) * 1.1 } }); drawn += M[a][b]; }
    }
  }
  $("graph-text").textContent = `Each circle is a directory, sized by its bytes and coloured by its most common field. An arrow from A to B means modules in A import modules in B. The ${fmt(elements.length - shown.length)} arrows drawn carry ${pct(drawn / crossTotal)} of the imports between these directories; weaker links are left out. Point at a circle to see that directory on the map. Circles can be dragged.`;
  const ink = cssVar("--ink"), ink3 = cssVar("--ink-3");
  const cy = cytoscape({
    container: $("graph"), elements,
    userZoomingEnabled: false, userPanningEnabled: false, boxSelectionEnabled: false, // the page keeps the scroll wheel
    style: [
      { selector: "node", style: { width: "data(size)", height: "data(size)", "background-color": "data(colour)", label: "data(label)", color: ink, "font-family": "STIX Two Text, serif", "font-size": 12, "text-valign": "bottom", "text-margin-y": 3, "text-wrap": "wrap", "text-max-width": 110, "text-background-color": cssVar("--paper-2"), "text-background-opacity": 0.8, "text-background-padding": 1 } },
      { selector: "edge", style: { width: "data(w)", "line-color": ink3, "target-arrow-color": ink3, "target-arrow-shape": "triangle", "arrow-scale": 0.8, "curve-style": "bezier", opacity: 0.45 } },
      { selector: ".dim", style: { opacity: 0.08 } },
      { selector: "edge.lit", style: { opacity: 1, "line-color": ink, "target-arrow-color": ink } },
    ],
    layout: { name: "fcose", animate: false, randomize: true, quality: "proof", nodeSeparation: 110, idealEdgeLength: 130, nodeRepulsion: 30000, padding: 24, nodeDimensionsIncludeLabels: true },
  });
  const tipEl = $("graph-tip");
  const showTip = (html, pos) => {
    tipEl.innerHTML = html; tipEl.style.display = "block";
    const box = $("graph").getBoundingClientRect();
    tipEl.style.left = Math.max(0, Math.min(pos.x + 14, box.width - tipEl.offsetWidth)) + "px";
    tipEl.style.top = Math.max(0, Math.min(pos.y + 16, box.height - tipEl.offsetHeight)) + "px";
  };
  cy.on("mouseover", "node", (e) => {
    const r = e.target.data("r"), st = stats[r];
    cy.elements().addClass("dim"); e.target.closedNeighborhood().removeClass("dim"); e.target.connectedEdges().addClass("lit");
    const top = shown.filter((b) => b !== r && M[r][b]).sort((a, b) => M[r][b] - M[r][a]).slice(0, 3);
    showTip(`<b>${esc(meta.regions[r])}</b><br>${plural(st.modules, "module")} · ${bytesFmt(st.bytes)}<br>${pct(M[r][r] / d3.sum(M[r]))} of its imports stay inside it`
      + (top.length ? `<br>Imports most from: ${top.map((b) => `${esc(meta.regions[b].split("/").pop())} (${fmt(M[r][b])})`).join(", ")}` : ""), e.renderedPosition);
    setPreview(maskWhere((i) => regionOfDir[leafDir[i]] === r), meta.regions[r]);
  });
  cy.on("mouseover", "edge", (e) => {
    const [a, b] = [e.target.source().data("r"), e.target.target().data("r")];
    e.target.addClass("lit");
    showTip(`<b>${esc(meta.regions[a])}</b> imports <b>${esc(meta.regions[b])}</b><br>${fmt(e.target.data("n"))} imports` + (M[b][a] ? `<br>${fmt(M[b][a])} imports in the other direction` : ""), e.renderedPosition);
  });
  cy.on("mouseout", "node, edge", () => { cy.elements().removeClass("dim lit"); tipEl.style.display = "none"; if (state.preview) setPreview(null); });
}
let graphStarted = false;
new IntersectionObserver((entries) => {
  if (entries[0].isIntersecting && !graphStarted) { graphStarted = true; renderGraph().catch((err) => { $("graph-text").textContent = `Couldn't draw the import graph: ${err.message}`; }); }
}, { rootMargin: "400px" }).observe($("graph"));

function renderNameTables() {
  const hubs = d3.range(N).sort((a, b) => col.dependents[b] - col.dependents[a]).slice(0, 12);
  $("hub-table").innerHTML = `<tr><th>Module</th><th>Directory label</th><th class="num">Modules that depend on it</th><th class="num">Import it directly</th></tr>`
    + hubs.map((i) => `<tr><td><button class="link" data-open="${i}">${esc(pathOf(i))}</button></td><td>${esc(labelOf(i))}</td><td class="num">${fmt(col.dependents[i])} (${pct(col.dependents[i] / N)})</td><td class="num">${fmt(col.indeg[i])}</td></tr>`).join("");
  const digitTop = d3.range(N).filter((i) => col.bytes[i] > 2000).sort((a, b) => col.digits[b] - col.digits[a]).slice(0, 10);
  $("digit-table").innerHTML = `<tr><th>Module</th><th>Directory label</th><th class="num">Digits</th><th class="num">Size</th></tr>`
    + digitTop.map((i) => `<tr><td><button class="link" data-open="${i}">${esc(pathOf(i))}</button></td><td>${esc(labelOf(i))}</td><td class="num">${col.digits[i]}%</td><td class="num">${bytesFmt(col.bytes[i])}</td></tr>`).join("");
}
renderCharts();
const truth = meta.totals.truth;
$("agree-note").textContent = `The field of a module is a keyword estimate, and a rough one. A language model read ${fmt(truth.n)} randomly chosen modules and named each one's field. The keyword estimate gave the same field for ${pct(truth.exact / truth.n)} of them and a field of the same colour family for ${pct(truth.family / truth.n)} (${pct(truth.familyOrSecond / truth.n)} when the model's second choice also counts). The directory labels did worse: ${pct(truth.dirFamily / truth.n)} in the same family. Adjusting the keyword weights on half of the sample did not improve the other half.`;

const chainMask = new Uint8Array(N);
for (const i of meta.chain) chainMask[i] = 1;
const chainLabel = `The longest import chain, ${meta.chain.length} modules`;
function chainTip(j) {
  const i = meta.chain[j - 1];
  return `${j} of ${meta.chain.length}\n${esc(pathOf(i))}<span class="say">${esc(labelOf(i))} · ${esc(meta.fields[col.field[i]].name)}</span>`;
}

// rows that preview a highlight on the map while the pointer is over them
document.addEventListener("pointerover", (e) => {
  const cell = e.target.closest?.("[data-chain]");
  if (cell || e.target.closest?.("#chain-show, #chain-strip")) {
    const j = cell ? +cell.dataset.chain : 0;
    setPreview(chainMask, cell ? `Module ${j} of ${meta.chain.length} in the longest import chain` : chainLabel, { chain: true, marker: cell ? meta.chain[j - 1] : -1 });
    return;
  }
  const row = e.target.closest?.("[data-preview-field],[data-preview-dir]");
  if (!row) { if (state.preview) setPreview(null); return; }
  if (row.dataset.previewField !== undefined) {
    const fi = +row.dataset.previewField;
    if (state.previewLabel !== meta.fields[fi].name) setPreview(maskWhere((i) => col.field[i] === fi), meta.fields[fi].name);
  } else {
    const d = dirs[+row.dataset.previewDir];
    if (state.previewLabel !== d.name) setPreview(maskWhere((i) => i >= d.start && i < d.end), d.name);
  }
});

// table of contents: mark the section in view
const tocLinks = [...document.querySelectorAll("#toc a")];
const observer = new IntersectionObserver((entries) => {
  for (const en of entries) if (en.isIntersecting) tocLinks.forEach((a) => a.classList.toggle("current", a.getAttribute("href") === "#" + en.target.id));
}, { rootMargin: "-10% 0px -80% 0px" });
document.querySelectorAll("main section").forEach((s) => observer.observe(s));
