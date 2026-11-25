// Loads the data files and defines the names, colours and shared state every other module uses.
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";

// The page shows one version of the proof at a time: the original release, or the community cleanup (?v=cleanup).
export const VERSION = new URLSearchParams(location.search).get("v") === "cleanup" ? "cleanup" : "original";
export const DATA = VERSION === "cleanup" ? "data/cleanup/" : "data/";

export const $ = (id) => document.getElementById(id);
export const fmt = d3.format(",");
export const pct = (x) => (x >= 0.1 ? d3.format(".0%")(x) : x >= 0.001 ? d3.format(".1%")(x) : x > 0 ? "<0.1%" : "0%");
export const bytesFmt = (b) => (b >= 1e9 ? (b / 1e9).toFixed(2) + " GB" : b >= 1e6 ? (b / 1e6).toFixed(1) + " MB" : b >= 1e3 ? (b / 1e3).toFixed(1) + " kB" : b + " bytes");
export const plural = (n, one, many) => `${fmt(n)} ${n === 1 ? one : many || one + "s"}`;
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// ---------------------------------------------------------------- data
export const [meta, colBuf] = await Promise.all([
  fetch(DATA + "meta.json").then((r) => r.json()),
  fetch(DATA + "cols.bin").then((r) => r.arrayBuffer()),
]);
export const N = meta.files;
// where the code of this version is published: every link and every fetched module uses this commit
export const SOURCE = meta.source;
export const REPO = `https://github.com/${SOURCE.repo}`;
export const blobUrl = (path) => `${REPO}/blob/${SOURCE.sha}/${SOURCE.prefix}${encodeURI(path)}`;
export const treeUrl = (path) => `${REPO}/tree/${SOURCE.sha}/${SOURCE.prefix}${encodeURI(path)}`;
export const rawUrl = (path) => `https://raw.githubusercontent.com/${SOURCE.repo}/${SOURCE.sha}/${SOURCE.prefix}${encodeURI(path)}`;
export const versionsReady = fetch("data/versions.json").then((r) => r.json());
export const dateFmt = (iso) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
export const TYPES = { I: Uint32Array, H: Uint16Array, B: Uint8Array };
export const col = {};
for (const c of meta.columns) col[c.name] = new TYPES[c.type](colBuf, c.offset, N);
export const ones = new Uint8Array(N).fill(1);

// directories: [name, parent, firstFile, directFileCount, subtreeEnd]
export const dirs = meta.dirs.map(([name, parent, start, count, end], i) => ({ i, name, parent, start, count, end, depth: 0, path: "" }));
for (const d of dirs) {
  if (d.parent >= 0) { const p = dirs[d.parent]; d.depth = p.depth + 1; d.path = p.path ? p.path + "/" + d.name : d.name; }
}
export const leafDir = new Uint16Array(N);
for (const d of dirs) for (let i = d.start; i < d.start + d.count; i++) leafDir[i] = d.i;

// Fields are folded into eight colour families (a treemap cannot keep 17 hues apart).
export const FAMILIES = [
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
export const fieldFamily = meta.fields.map((f) => FAMILIES.findIndex((fam) => fam.fields.includes(f.id)));
export const moduleFamily = (i) => fieldFamily[col.field[i]]; // from the identifiers the module uses
export const dirFamily = (i) => fieldFamily[meta.groups[col.group[i]].field]; // from its directory's label
export const KIND_NAMES = ["States and proves mathematics", "Restates one theorem proved in another module", "Only imports other modules", "Only sets options or notation"];
export const KIND_COLOURS = [["#2a78d6", "#3987e5"], ["#eb6834", "#d95926"], ["#1baf7a", "#199e70"], ["#a8a294", "#6b665b"]];
export const SEQ = ["#cde2fb", "#b7d3f6", "#9ec5f4", "#86b6ef", "#6da7ec", "#5598e7", "#3987e5", "#2a78d6", "#256abf", "#1c5cab", "#184f95", "#104281", "#0d366b"];

export const darkQuery = matchMedia("(prefers-color-scheme: dark)");
export const isDark = () => darkQuery.matches;
export const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export const SIZE_MODES = [
  { id: "bytes", label: "Bytes", values: col.bytes, unit: "of the bytes" },
  { id: "lines", label: "Lines", values: col.lines, unit: "of the lines" },
  { id: "zbytes", label: "Compressed bytes", values: col.zbytes, unit: "of the compressed bytes" },
  { id: "modules", label: "Modules", values: ones, unit: "of the modules" },
  { id: "decls", label: "Declarations", values: col.decls, unit: "of the declarations" },
  { id: "build", label: "Build time", values: col.build, unit: "of the build time" },
].filter((m) => m.id !== "build" || meta.totals.buildMeasured); // build times exist only for the original release
export const COLOUR_MODES = [
  { id: "field", label: "Field of each module", kind: "cat" },
  { id: "dirfield", label: "Field of its directory", kind: "cat" },
  { id: "kind", label: "Kind of module", kind: "cat" },
  { id: "height", label: "Import depth", kind: "seq", values: col.height, scale: "linear", low: "imports no other module", high: `${meta.totals.longestChain} modules deep`, noun: "import depth" },
  { id: "dependents", label: "Dependents", kind: "seq", values: col.dependents, scale: "log", low: "no module depends on it", high: `${fmt(d3.max(col.dependents))} modules depend on it`, noun: "dependents" },
  { id: "repeat", label: "Similarity to previous module", kind: "seq", values: col.repeat, scale: "linear", max: 100, missing: 255, low: "0% repeats the previous module", high: "100%", noun: "repeated" },
  { id: "build", label: "Build time", kind: "seq", values: col.build, scale: "log", low: "under a second", high: `${fmt(Math.round(d3.max(col.build) / 10))} seconds`, noun: "build time" },
  { id: "literals", label: "Numeric literals", kind: "seq", values: col.literalRate, scale: "sqrt", max: 125, low: "no numeric literals", high: "125 or more per 100 lines", noun: "numeric literals" },
  { id: "digits", label: "Digit characters 0–9", kind: "seq", values: col.digits, scale: "sqrt", max: 12, low: "0% of characters are digits", high: "12% or more", noun: "digits" }, // almost every module is under 12%, so the scale stops there
].filter((m) => m.id !== "build" || meta.totals.buildMeasured); // build times exist only for the original release
export const state = { size: SIZE_MODES[0], colour: COLOUR_MODES[0], mask: null, maskLabel: "", maskKey: "", preview: null, previewLabel: "", previewTint: null, chain: false, previewChain: false, marker: -1, bend: 0, hover: -1, pinned: -1 };

export let names = null; // loaded after first paint
export const namesReady = fetch(DATA + "names.txt").then((r) => r.text()).then((t) => { names = t.split("\n"); return names; });
export const pathOf = (i) => { const d = dirs[leafDir[i]]; return (d.path ? d.path + "/" : "") + (names ? names[i] : "…") + ".lean"; };
export let termBits = null;
export const termsReady = () => (termBits ||= fetch(DATA + "terms.bin").then((r) => r.arrayBuffer()).then((b) => new Uint8Array(b)));

// prefix sums give any directory's total in constant time (a subtree is a contiguous range of files)
export const prefix = {};
for (const [key, arr] of [["bytes", col.bytes], ["lines", col.lines], ["zbytes", col.zbytes], ["decls", col.decls]]) {
  const p = new Float64Array(N + 1);
  for (let i = 0; i < N; i++) p[i + 1] = p[i] + arr[i];
  prefix[key] = p;
}
export const dirSum = (d, key) => prefix[key][d.end] - prefix[key][d.start];
