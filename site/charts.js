// The charts and tables in the sections below the map. Loaded after the map has painted.
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";
import * as Plot from "https://cdn.jsdelivr.net/npm/@observablehq/plot@0.6.16/+esm";
import { REPO, SOURCE, VERSION, SETTINGS, PARTS, partOf, listed, versionUrl, dateFmt, $, fmt, pct, bytesFmt, plural, esc, foldedTable, meta, N, col, ones, dirs, FAMILIES, fieldFamily, KIND_COLOURS, isDark, cssVar, state, names, pathOf, dirSum } from "./data.js";
import { KEYWORDS } from "./speech.js";
import { maskWhere, setPreview, luminance, setMask, labelOf, famOf, famColour, segmented } from "./map.js";

// ---------------------------------------------------------------- sections below the map
export const plotStyle = () => ({ background: "transparent", color: cssVar("--ink"), fontFamily: cssVar("--serif"), fontSize: "13px", overflow: "visible" });
export function mount(id, plot) { const el = $(id); el.innerHTML = ""; el.append(plot); return plot; }
/** While the pointer is over a mark of the chart, highlight on the map the modules that mark stands for.
 * `byX` (for bar charts with a band x scale) maps the x value under the pointer to a datum, so every
 * part of a stacked bar counts, not only the points near Plot's own tip anchor. */
function previewOnHover(plot, describe, byX) {
  const show = (d) => {
    if (!d) { plot.dataset.key = ""; if (state.preview) setPreview(null); return; }
    const { key, test, label, tint } = describe(d);
    if (plot.dataset.key === key && state.preview) return;
    plot.dataset.key = key;
    setPreview(maskWhere(test), label, { tint });
  };
  if (byX) {
    plot.addEventListener("pointermove", (e) => {
      // with a legend, Plot returns a figure whose last svg is the chart (the legend's swatches are svgs too)
      const x = plot.scale("x"), svg = plot.tagName === "svg" ? plot : [...plot.querySelectorAll("svg")].pop();
      const box = svg.getBoundingClientRect(), width = svg.viewBox.baseVal.width || box.width;
      const px = ((e.clientX - box.left) * width) / box.width;
      // the nearest bar, so the gaps between bars count too; nothing beyond half a bar past either end
      const centre = (value) => x.apply(value) + x.bandwidth / 2;
      const step = x.domain.length > 1 ? centre(x.domain[1]) - centre(x.domain[0]) : x.bandwidth;
      const v = x.domain.reduce((best, value) => (Math.abs(centre(value) - px) < Math.abs(centre(best) - px) ? value : best), x.domain[0]);
      show(Math.abs(centre(v) - px) <= step / 2 ? byX(v) : null);
    });
  } else plot.addEventListener("input", () => show(plot.value));
  plot.addEventListener("pointerleave", () => show(null));
}

/** Cleanup page only: the original release beside this version, in total and by directory. */
function renderChanges() {
  const c = meta.compare;
  if (!c || !$("change-table")) return;
  const change = (a, b) => `${b >= a ? "+" : "−"}${pct(Math.abs(b - a) / a)}`;
  const row = (label, a, b, f = fmt, note = "") => `<dt>${label}</dt><dd>${f(a)} → <b>${f(b)}</b> (${change(a, b)})${note}</dd>`;
  $("change-facts").innerHTML = row("Modules", c.before.modules, c.after.modules)
    + row("Lines without imports", c.before.lines, c.after.lines)
    + row("Declarations", c.before.decls, c.after.decls)
    + row("Source size", c.before.bytes, c.after.bytes, bytesFmt, meta.totals.mergeRecordBytes ? `. ${bytesFmt(meta.totals.mergeRecordBytes)} of the new size is records written by the merge script` : "");
  // where the modules went: the rows of each column add up to that version's total
  const none = `<span class="none">–</span>`;
  $("change-modules").innerHTML = `<tr><th>Modules</th><th class="num">Original release</th><th class="num">Cleanup</th></tr>`
    + [["At the same path in both", fmt(c.samePath), fmt(c.samePath)],
      ["Removed, or joined into another module", fmt(c.gone), none],
      ["At a path the original did not have", none, fmt(c.newPaths)],
    ].map(([k, a, b]) => `<tr><td>${k}</td><td class="num">${a}</td><td class="num">${b}</td></tr>`).join("")
    + `<tr class="total"><td>Total</td><td class="num">${fmt(c.before.modules)}</td><td class="num">${fmt(c.after.modules)}</td></tr>`;
  $("change-text").textContent = `Of the ${fmt(c.samePath)} modules at the same path, ${fmt(c.sameShape)} have the same text once names, numbers and import lines are ignored. ${fmt(c.merged)} of the cleanup's modules were made by a script that joins several smaller modules into one.`;
  const max = d3.max(c.regions, (r) => r[2]);
  $("change-table").innerHTML = `<tr><th>Directory</th><th class="num">Modules before</th><th class="num">Modules now</th><th class="num">Change</th><th>Lines before and now</th><th class="num">Change</th></tr>`
    + c.regions.filter((r) => r[1] >= 20).map(([path, m0, l0, m1, l1]) => {
      const d = dirs.find((x) => x.path === path);
      return `<tr class="hoverable"${d ? ` data-preview-dir="${d.i}"` : ""}><td>${esc(path)}</td><td class="num">${fmt(m0)}</td><td class="num">${fmt(m1)}</td><td class="num">${change(m0, m1)}</td>
        <td class="pair"><span class="bar before" style="width:${(60 * l0) / max}px"></span>${fmt(l0)}<br><span class="bar" style="width:${(60 * l1) / max}px;background:${cssVar("--ink")}"></span>${fmt(l1)}</td><td class="num">${change(l0, l1)}</td></tr>`;
    }).join("");
}

/** Page counts for the source under several layouts, with the other version's count for comparison. */
function renderPrinted() {
  const p = meta.printed;
  const stack = (pages) => { const m = (pages / 2) * 0.0001; return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : m >= 10 ? `${Math.round(m)} m` : m >= 1 ? `${m.toFixed(1)} m` : `${(m * 100).toFixed(1)} cm`; };
  const rows = [
    ["A4 listing, each module starting a new page", p.a4NewPage],
    ["A4 listing, modules printed one after another", p.a4],
    ["The same without blank lines and import lines", p.a4Code],
    ["Book pages, without blank lines and import lines", p.book],
    ["Set as continuous text with line breaks removed, 3,000 characters a page", p.text],
    p.xzPages && [`Compressed into one xz archive (${bytesFmt(p.xzBytes)}) and printed as base64 in the A4 listing layout`, p.xzPages],
    p.compiledPages && [`Lean's compiled files for these modules (${bytesFmt(p.compiledBytes)}), printed as base64 in the A4 listing layout`, p.compiledPages],
  ].filter(Boolean);
  const draw = (extra = []) => {
    $("printed-table").innerHTML = `<tr><th>Layout</th><th class="num">Pages</th><th class="num">Stack of paper</th></tr>`
      + [...rows, ...extra].map(([label, pages]) => `<tr><td>${label}</td><td class="num">${fmt(pages)}</td><td class="num">${stack(pages)}</td></tr>`).join("");
  };
  // the other versions in the same layout, for comparison
  draw(listed.filter((v) => v.id !== VERSION && v.printed && v.compare !== false).map((v) =>
    [`<a href="${versionUrl(v.id)}#printed">${esc(v.label)}</a> of ${dateFmt(v.date)}: A4 listing, modules printed one after another`, v.printed.a4]));
}

/** Escaped text with a line-break opportunity after each separator, for long Lean names and paths. */
const breakable = (s, sep) => esc(s).split(sep).join(sep + "<wbr>");

/** Definitions that are always True or always False, from meta.constProps (see tools/constprops_run.py). */
function renderConstProps() {
  const c = meta.constProps;
  if (!$("always-about")) return; // the section was removed
  if (!c) { $("always").remove(); document.querySelector('#toc a[href="#always"]')?.remove(); return; }
  const exact = c.method === "compiled";
  const commit = SOURCE.sha.slice(0, 7);
  const numbers = c.numberFunctions || [];
  // the "assumed" column applies only to always-False definitions; leave it out when there are none
  const anyFalse = c.defs.some((d) => d.value === "False");
  const assumed = exact ? "Assumed by declarations" : "Assumed in modules";
  // the explanation and the method, closed by default so that the tables come first
  $("always-about").innerHTML = `<summary>About these definitions</summary>
    <p>A condition that is always <code>True</code> requires nothing, so a lemma that takes it as a condition is the same lemma without it. An example is <code>anyGeometry</code>, which was criticised in the original release.</p>
    <p>A lemma that assumes an always-<code>False</code> definition can never be applied, because applying it needs a proof of <code>False</code>.${anyFalse ? ` “${assumed}” is the number of ${exact ? "declarations" : "modules"} that assume the definition, and is given for always-<code>False</code> definitions only.` : ""}</p>
    ${VERSION === "jamesyc" ? "<p>Neither kind can change what the five theorems state.</p>" : `<p>Neither kind can change what the five final theorems state, or whether their proofs are correct. The theorems are stated in <code>${esc(SETTINGS.statements)}</code> using only Mathlib's definitions, and Lean's kernel checked every proof.</p>`}
    ${!c.defs.length ? "" : `<p>${exact
      ? `Counts are exact, read from Lean's compiled files at commit ${commit}. The five theorems depend on ${fmt(c.reached)} of the ${fmt(c.declarations)} declarations in the compiled files, directly or through other declarations. The compiled files have more declarations than the source text, because Lean generates auxiliary declarations.`
      : "Counts are estimated from the Lean text. A module is counted as using a definition when its text contains a name that could refer to that definition. The text alone cannot show whether the five theorems depend on a definition."}</p>`}`
    + (c.disguised !== undefined ? `<p>${c.disguised ? `${plural(c.disguised, "proposition or set is", "propositions or sets are")} defined as` : "No proposition or set is defined as"} <code>⊤</code>, <code>⊥</code>, <code>Set.univ</code> or <code>∅</code>, which are other ways to write <code>True</code> or <code>False</code>.</p>` : "")
    + (numbers.length ? "<p>Functions that return the same number for every input, such as a zero map, are ordinary in mathematics.</p>" : "");
  // functions that return the same number for every input, from the text estimate: the first rows, then "Show all"
  const numberRow = (d) => `<tr><td><code>${breakable(d.name, ".")}</code><br><span class="note mono">${breakable(d.file, "/")}</span></td><td data-label="Value"><code>${esc(d.value)}</code></td><td data-label="Type"><code>${breakable(d.type, " ")}</code></td></tr>`;
  $("always-more").innerHTML = numbers.length ? `<h3>${plural(numbers.length, "function that returns", "functions that return")} the same number for every input</h3>
    ${foldedTable('id="always-numbers" class="data"', "<tr><th>Definition</th><th>Value</th><th>Type</th></tr>", numbers.map(numberRow), "functions", 5)}` : "";
  if (!c.defs.length) {
    $("always-none").hidden = false;
    $("always-none").textContent = exact ? `None in this version. Checked in Lean's compiled files at commit ${commit}.` : "None found in this version's Lean text. The compiled files were not checked.";
    $("always-table")?.remove(); $("always-note").hidden = true;
    return;
  }
  $("always-intro").hidden = false;
  $("always-note").textContent = exact ? `Exact counts, from Lean's compiled files at commit ${commit}.` : "Counts estimated from the Lean text.";
  const dash = `<span class="none">–</span>`;
  $("always-table").innerHTML = `<tr><th>Definition</th><th>Value</th><th class="num">Used in other modules</th>${anyFalse ? `<th class="num" title="A lemma that assumes an always-False definition can never be applied">${assumed}</th>` : ""}${exact ? "<th>In the theorems' proofs</th>" : ""}</tr>`
    // data-label names each cell where a phone stacks the cells; "na" cells are hidden there
    + c.defs.map((d, k) => `<tr class="hoverable" data-preview-const="${k}"><td><code>${breakable(d.name, ".")}</code><br><span class="note mono">${breakable(d.file, "/")}</span></td><td data-label="Value"><code${d.value === "False" ? ' class="exception"' : ""}>${d.value}</code></td><td class="num" data-label="Used in other modules">${d.modules.length ? `<button type="button" class="link" data-const-show="${k}" title="Show these modules on the map">${fmt(d.modules.length)}</button>` : "0"}</td>${!anyFalse ? "" : d.value === "False" ? `<td class="num" data-label="${assumed}">${fmt(d.hyp)}</td>` : `<td class="num na" title="Counted for always-False definitions only">${dash}</td>`}${exact ? `<td data-label="In the theorems' proofs">${d.used ? "Yes" : "No"}</td>` : ""}</tr>`).join("");
  $("always-table").onclick = (e) => {
    const b = e.target.closest("[data-const-show]");
    if (!b) return;
    const d = c.defs[+b.dataset.constShow], set = new Set(d.modules);
    setMask(`const:${b.dataset.constShow}`, maskWhere((i) => set.has(i)), `${d.name.split(".").pop()}: used in ${fmt(d.modules.length)} other ${d.modules.length === 1 ? "module" : "modules"}`);
    $("map").scrollIntoView();
  };
}

export function renderCharts() {
  renderChanges();
  renderConstProps();
  renderPrinted();
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
  $("space-text").textContent = "Fields are estimated from the identifiers each module uses. The shares are similar under every measure.";
  // key for the chart below: every area with its colour and its share of the bytes, largest first
  $("space-key").innerHTML = byBytes.map((r) => `<li data-preview-family="${r.g}"><span class="sw" style="background:${famColour(r.g)}"></span><span>${esc(r.family)}</span><span class="num">${pct(r.share)}</span></li>`).join("")
    + `<li class="key-head"><span></span><span></span><span class="num">of bytes</span></li>`;
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
  // with only a few top-level directories (the rewrite has Lib and New), list the directories inside them,
  // under a heading row for each top-level directory unless the reader combines them into one list
  const topLevel = PARTS.length ? [...PARTS, ...dirs.filter((d) => d.depth === 1 && !PARTS.includes(d))] : dirs.filter((d) => d.depth === 1);
  const libDepth = topLevel.length < 4 && dirs.some((d) => d.depth === 2) ? 2 : 1;
  const libs = dirs.filter((d) => d.depth === libDepth).map((d) => ({ d, modules: d.end - d.start, lines: dirSum(d, "lines"), bytes: dirSum(d, "bytes"), decls: dirSum(d, "decls") })).sort((a, b) => b.bytes - a.bytes);
  const maxB = libs[0].bytes;
  const libRow = (l, separate) => `<tr class="hoverable" data-preview-dir="${l.d.i}"><td>${esc(libDepth === 2 && !separate ? l.d.path : l.d.name)}</td><td class="num">${fmt(l.modules)}</td><td class="num">${fmt(l.lines)}</td><td class="num">${fmt(l.decls)}</td><td><span class="bar" style="width:${(260 * l.bytes) / maxB}px;background:${cssVar("--ink-3")}"></span>${bytesFmt(l.bytes)} (${pct(l.bytes / meta.totals.bytes)})</td></tr>`;
  const libHead = `<tr><th>${libDepth === 2 ? "Directory" : "Library"}</th><th class="num">Modules</th><th class="num">Lines</th><th class="num">Declarations</th><th>Size (share of all bytes)</th></tr>`;
  const drawLibs = (separate) => {
    $("lib-table").innerHTML = libHead + (separate
      ? topLevel.map((t) => `<tr class="group-row hoverable" data-preview-dir="${t.i}"><td colspan="5"><b>${esc(t.name)}</b> · ${plural(t.end - t.start, "module")} · ${bytesFmt(dirSum(t, "bytes"))}</td></tr>`
          + libs.filter((l) => l.d.parent === t.i).map((l) => libRow(l, true)).join("")).join("")
      : libs.map((l) => libRow(l, false)).join(""));
  };
  if (libDepth === 2) {
    const names = topLevel.map((d) => esc(d.name)).join(" and ");
    $("lib-heading").innerHTML = `By directory, inside ${names}`;
    let separate = true;
    $("lib-combine").hidden = false;
    const label = () => { $("lib-combine").textContent = separate ? `Combine ${topLevel.map((d) => d.name).join(" and ")} into one list` : `List ${topLevel.map((d) => d.name).join(" and ")} separately`; };
    $("lib-combine").onclick = () => { separate = !separate; label(); drawLibs(separate); };
    label();
    drawLibs(true);
  } else drawLibs(false);

  // --- why so many modules
  const kindCount = [0, 0, 0, 0], one = [0, 0];
  const sortedLines = Float64Array.from(col.lines).sort();
  for (let i = 0; i < N; i++) { kindCount[col.kind[i]]++; if (col.decls[i] === 1) one[col.kind[i] ? 1 : 0]++; }
  const shapeDup = d3.sum(col.shape, (s) => (s >= 10 ? 1 : 0));
  $("modules-facts").innerHTML = [
    ["Median module length", `<b>${fmt(sortedLines[N >> 1])}</b> lines`],
    ["Modules with exactly one declaration", `<b>${fmt(one[0] + one[1])}</b> (${pct((one[0] + one[1]) / N)})`],
    kindCount[1] && ["Modules that only restate a theorem", `<b>${fmt(kindCount[1])}</b> (${pct(kindCount[1] / N)} of modules, ${pct(d3.sum(col.bytes, (b, i) => (col.kind[i] === 1 ? b : 0)) / meta.totals.bytes)} of bytes). Each one restates one theorem and proves it by citing the same theorem from another module.`],
    ["Imports of other project modules", `<b>${(meta.totals.importEdges / N).toFixed(1)}</b> per module on average`],
    ["Modules that import all of Mathlib", `<b>${fmt(meta.totals.wholeMathlibImports)}</b>`],
  ].filter(Boolean).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");
  const edges = [1, 4, 10, 32, 100, 316, 1000, 1e9];
  const binLabel = (b) => (b === edges.length - 2 ? `${fmt(edges[b])}+` : `${fmt(edges[b])}–${fmt(edges[b + 1] - 1)}`);
  const lineBin = (i) => d3.bisectRight(edges, Math.max(col.lines[i], 1)) - 1;
  // Bars are split into modules that restate a theorem and the others; a version with no restating
  // modules but separate parts (the rewrite's New and Lib) splits them by part instead.
  const byPart = !kindCount[1] && PARTS.length > 1;
  const groupOf = byPart ? (i) => (partOf[i] < 0 ? PARTS.length : partOf[i]) : (i) => (col.kind[i] === 1 ? 1 : 0);
  const groupNames = byPart ? [...PARTS.map((d) => d.name), "Top level"] : ["Other modules", "Restates a theorem"];
  // New and Lib in shades of ink, so they are not read as the field colours of the map above
  const groupColours = byPart ? [cssVar("--ink"), cssVar("--ink-3"), cssVar("--rule")] : [KIND_COLOURS[0], KIND_COLOURS[1]].map((c) => c[isDark() ? 1 : 0]);
  const groupCount = groupNames.map((_, g) => d3.sum(d3.range(N), (i) => (groupOf(i) === g ? 1 : 0)));
  const lengthRows = d3.rollups(d3.range(N), (v) => v.length, lineBin, groupOf)
    .flatMap(([b, ks]) => ks.map(([g, n]) => ({ bin: binLabel(b), b, kind: groupNames[g], n })));
  const kindScale = { domain: groupNames.filter((_, g) => groupCount[g]), range: groupColours.filter((_, g) => groupCount[g]), legend: true };
  const tipOpts = { fill: cssVar("--paper"), stroke: cssVar("--ink-3") };
  // hovering a bar shows that bar's modules on the maps, in the bar's colours
  const kindTint = { colours: groupColours, index: Uint8Array.from(d3.range(N), groupOf) };
  const repBin = (i) => (col.repeat[i] === 255 ? -1 : Math.min(9, Math.floor(col.repeat[i] / 10)));
  const binTotal = (rows, b) => d3.sum(rows, (r) => (r.b === b ? r.n : 0));
  previewOnHover(mount("length-chart", Plot.plot({
    style: plotStyle(), width: 520, height: 300, marginLeft: 60, marginBottom: 46,
    x: { label: "Lines in the module", labelAnchor: "center", labelArrow: "none", domain: d3.range(edges.length - 1).map(binLabel) }, y: { label: "Modules", grid: true, tickFormat: "~s" }, color: kindScale,
    marks: [Plot.barY(lengthRows, { x: "bin", y: "n", fill: "kind", order: kindScale.domain, insetLeft: 1, insetRight: 1, tip: tipOpts, title: (d) => `${fmt(d.n)} modules with ${d.bin} lines\n${d.kind}` }), Plot.ruleY([0])],
  })), (d) => ({ key: `lines${d.b}`, label: `${fmt(binTotal(lengthRows, d.b))} modules with ${d.bin} lines`, test: (i) => lineBin(i) === d.b, tint: kindTint }),
  (bin) => lengthRows.find((r) => r.bin === bin));
  const repRows = d3.rollups(d3.range(N).filter((i) => col.repeat[i] !== 255), (v) => v.length, (i) => Math.min(9, Math.floor(col.repeat[i] / 10)), groupOf)
    .flatMap(([b, ks]) => ks.map(([g, n]) => ({ bin: `${b * 10}–${b * 10 + 10}`, b, kind: groupNames[g], n })));
  previewOnHover(mount("repeat-chart", Plot.plot({
    style: plotStyle(), width: 520, height: 300, marginLeft: 60, marginBottom: 46,
    x: { label: "Share of the module that repeats its neighbour (%)", labelAnchor: "center", labelArrow: "none", domain: d3.range(10).map((b) => `${b * 10}–${b * 10 + 10}`) }, y: { label: "Modules", grid: true, tickFormat: "~s" }, color: kindScale,
    marks: [Plot.barY(repRows, { x: "bin", y: "n", fill: "kind", order: kindScale.domain, insetLeft: 1, insetRight: 1, tip: tipOpts, title: (d) => `${fmt(d.n)} modules\n${d.bin}% repeated\n${d.kind}` }), Plot.ruleY([0])],
  })), (d) => ({ key: `repeat${d.b}`, label: `${fmt(binTotal(repRows, d.b))} modules that repeat ${d.bin}% of their neighbour`, test: (i) => repBin(i) === d.b, tint: kindTint }),
  (bin) => repRows.find((r) => r.bin === bin));
  const medianRep = (kind) => d3.median(d3.range(N).filter((i) => col.repeat[i] !== 255 && (col.kind[i] === 1) === kind), (i) => col.repeat[i]);
  $("repeat-text").textContent = `Repetition is measured by compressing each module after the compressor has read the module before it in the same directory. For a typical module that states and proves mathematics, ${medianRep(false)}% of the text is repeated from its neighbour. ${kindCount[1] ? `For a typical restating module it is ${medianRep(true)}%. Apart from the restating modules, exact` : "Exact"} copies are rare: ${shapeDup ? `${fmt(shapeDup)} modules belong to a group of ten or more that are identical once names and numbers are ignored` : "no group of ten or more modules is identical once names and numbers are ignored"}.`;

  // --- areas of mathematics
  const fieldTotals = meta.fields.map(() => ({ modules: 0, lines: 0, bytes: 0 }));
  for (let i = 0; i < N; i++) { const t = fieldTotals[col.field[i]]; t.modules++; t.lines += col.lines[i]; t.bytes += col.bytes[i]; }
  // the table can show one part of the version (the rewrite's New or Lib) or all of it
  const drawFields = (part) => {
    const inPart = (i) => part < 0 || partOf[i] === part;
    const totals = meta.fields.map(() => ({ modules: 0, lines: 0 }));
    let n = 0;
    for (let i = 0; i < N; i++) if (inPart(i)) { const t = totals[col.field[i]]; t.modules++; t.lines += col.lines[i]; n++; }
    const objects = meta.fields.map(() => new Map());
    meta.groups.forEach((g) => {
      if (part >= 0 && g.id.split("/")[0] !== PARTS[part].name) return;
      for (const o of g.objects) objects[g.field].set(o, (objects[g.field].get(o) || 0) + 1);
    });
    const maxLines = d3.max(totals, (t) => t.lines);
    const hasRead = meta.totals.randomN > 0 && part < 0; // the reading model's sample is from the original release
    const partAttr = part >= 0 ? ` data-preview-part="${part}"` : "";
    $("field-table").innerHTML = `<tr><th>Field</th><th class="num">Share of modules</th>${hasRead ? `<th class="num" title="Share of the ${fmt(meta.totals.randomN)} randomly sampled modules that a language model assigned to this field after reading them">Share in ${fmt(meta.totals.randomN)} modules read by a model</th>` : ""}<th>Lines</th></tr>`
      + meta.fields.map((f, fi) => ({ f, fi, t: totals[fi] })).filter((r) => r.t.modules).sort((a, b) => b.t.lines - a.t.lines).map(({ f, fi, t }) =>
        `<tr class="hoverable field-row" data-preview-field="${fi}"${partAttr}><td style="white-space:nowrap"><span class="sw" style="background:${famColour(fieldFamily[fi])}"></span>${esc(f.name)}</td><td class="num">${pct(t.modules / n)}</td>${hasRead ? `<td class="num">${pct(meta.totals.randomCounts[fi] / meta.totals.randomN)}</td>` : ""}
         <td style="white-space:nowrap"><span class="bar" style="width:${(150 * t.lines) / maxLines}px;background:${famColour(fieldFamily[fi])}"></span>${fmt(t.lines)}</td></tr>
         <tr class="hoverable objects-row" data-preview-field="${fi}"${partAttr}><td colspan="${hasRead ? 4 : 3}" class="objects">${[...objects[fi]].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([o]) => esc(o)).join(" · ") || "No objects named"}</td></tr>`).join("");
  };
  const fieldParts = PARTS.length > 1 ? [{ label: PARTS.length === 2 ? "Both" : "All", part: -1 }, ...PARTS.map((d, p) => ({ label: d.name, part: p }))] : [];
  let fieldPart = fieldParts[0];
  if (fieldParts.length) {
    $("field-part").hidden = false;
    segmented($("field-part-seg"), fieldParts, () => fieldPart, (m) => { fieldPart = m; drawFields(m.part); });
  }
  drawFields(-1);

  // --- imports between fields
  // fields with enough modules to show: 100 in the original release, 1% of the modules in a small version
  const used = meta.fields.map((f, fi) => fi).filter((fi) => fieldTotals[fi].modules > Math.min(100, N / 100));
  const cells = [];
  let same = 0, total = 0;
  meta.fieldMatrix.forEach((row, a) => row.forEach((n, b) => { total += n; if (a === b) same += n; }));
  for (const a of used) {
    const rowTotal = d3.sum(used, (b) => meta.fieldMatrix[a][b]);
    for (const b of used) cells.push({ from: meta.fields[a].name, to: meta.fields[b].name, n: meta.fieldMatrix[a][b], share: meta.fieldMatrix[a][b] / rowTotal });
  }
  $("imports-text").innerHTML = `The project has ${fmt(meta.totals.importEdges)} imports between its own modules. ${pct(same / total)} of them are between modules of the same field and ${pct(1 - same / total)} are between modules of different fields. ${meta.totals.notReached ? `Following imports from ${esc(SETTINGS.main)} reaches all but ${fmt(meta.totals.notReached)} of the ${fmt(N)} modules. ${meta.notReached.includes("Challenge.lean") ? "One of them is Challenge.lean, which is not meant to be imported. " : ""}<button type="button" class="link" id="unreached-show" data-mask-key="unreached" aria-pressed="false">Show the ${fmt(meta.totals.notReached)} on the map</button>` : `Every module is imported: all ${fmt(N)} are reachable from ${esc(SETTINGS.main)} by following imports.`}`;
  renderMathlib();
  renderUsed();
  if ($("unreached-show")) $("unreached-show").onclick = () => {
    const paths = new Set(meta.notReached);
    setMask("unreached", maskWhere((i) => paths.has(pathOf(i))), `${fmt(meta.totals.notReached)} modules that ${SETTINGS.main} does not reach through imports`); $("map").scrollIntoView();
  };
  const fieldOrder = used.slice().sort((a, b) => fieldFamily[a] - fieldFamily[b]).map((fi) => meta.fields[fi].name);
  const fieldIndex = new Map(meta.fields.map((f, fi) => [f.name, fi]));
  previewOnHover(mount("matrix-chart", Plot.plot({
    style: plotStyle(), width: 900, height: 520, marginLeft: 240, marginBottom: 150, padding: 0.06,
    x: { label: "Imported field", domain: fieldOrder, tickRotate: -40 }, y: { label: "Importing field", domain: fieldOrder },
    color: { type: "sqrt", range: isDark() ? ["#1f1d18", "#9ec5f4"] : ["#efe9db", "#104281"], label: "Share of the row's imports", legend: true, percent: true },
    marks: [Plot.cell(cells, { x: "to", y: "from", fill: "share", tip: tipOpts, title: (d) => `${pct(d.share)} of imports made by ${d.from}\ngo to ${d.to}\n(${fmt(d.n)} imports)` })],
  })), (d) => {
    const a = fieldIndex.get(d.from), b = fieldIndex.get(d.to);
    return { key: `${a}>${b}`, label: `${d.from} modules that import ${d.to}, and the modules they import`,
      test: (i) => (col.field[i] === a && (col.importsFields[i] >>> b) & 1) || (col.field[i] === b && (col.importedByFields[i] >>> a) & 1) };
  });

  // --- longest chain
  const chainRows = meta.chain.map((i, j) => ({ j: j + 1, i, family: FAMILIES[famOf(i)].name }));
  $("chain-text").innerHTML = `The longest chain of imports is ${meta.chain.length} modules: each module in it imports the one before. The chain ends at <span class="chain-end"></span>. Each cell below is one module in the chain, coloured by field. <button type="button" class="link" id="chain-show" data-mask-key="chain" aria-pressed="false">Draw the chain on the map</button>`;
  $("chain-show").onclick = () => { const m = new Uint8Array(N); for (const i of meta.chain) m[i] = 1; setMask("chain", m, `the longest import chain, ${meta.chain.length} modules`, true); $("map").scrollIntoView(); };
  $("chain-strip").innerHTML = `<div class="chain-cells">${chainRows.map((d) => `<button type="button" class="chain-cell" data-chain="${d.j}" data-open="${d.i}" style="background:${famColour(famOf(d.i))}" aria-label="Module ${d.j} of ${chainRows.length} in the chain"></button>`).join("")}</div>
    <div class="chain-axis"><span>1: imports no project module</span><span>${chainRows.length}: <span class="chain-end"></span></span></div>`;

  fillChainEnd();

  // --- numbers and tactics
  const tactics = meta.tactics.filter((t) => t[0] !== "sorry").slice(0, 24).map(([name, n]) => ({ name, n }));
  const tc = Object.fromEntries(meta.tactics);
  const longDigits = d3.sum(col.digits, (d) => (d >= 20 ? 1 : 0));
  const step = (name, does) => `<code>${name}</code> (${does}) ${fmt(tc[name] || 0)}`;
  $("numbers-facts").innerHTML = [
    ["Numeric literals, such as 2 or 1/2", `<b>${fmt(meta.totals.literals)}</b>, about ${Math.round(meta.totals.literals / N)} per module`],
    ["Literals with seven or more digits", `<b>${fmt(meta.totals.longLiterals)}</b>${meta.totals.longLiterals ? `, in ${plural(meta.totals.modulesWithLongLiterals, "module")}` : ""}`],
    ["Modules where 20% or more of the characters are digits", `<b>${fmt(longDigits)}</b> of ${fmt(N)}`],
    ["Uses of <code>native_decide</code>", `<b>${fmt(tc.native_decide || 0)}</b>`],
    ["Uses of <code>decide</code>", `<b>${fmt(tc.decide || 0)}</b>`],
    ["Most common proof steps", `${step("have", "state an intermediate fact")}, ${step("rw", "rewrite with an equation")}, ${step("exact", "give the proof term")}`],
  ].map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");
  // notation and macros: both sentences end in a button that highlights those modules on the map
  const T = meta.totals;
  if (!T.notations && !T.macros) $("syntax-text").textContent = "The source declares no notations and no macros.";
  else $("syntax-text").innerHTML = `The source declares ${fmt(T.notations)} notations in ${fmt(T.modulesWithNotation)} modules and ${T.macros ? `${fmt(T.macros)} macros in ${fmt(T.modulesWithMacro)} modules` : "no macros"}. A notation is a symbol that stands for an expression, and a macro is a new tactic name that stands for a sequence of existing tactics. ${T.localNotations === T.notations ? "All" : fmt(T.localNotations)} of the notations are marked <code>local</code>, so they apply only inside the file that declares them.${VERSION === "original" ? ` Most are shorthand for a long expression, such as <code>local notation "θ" => fontaineTheta (normInteger K) p</code>.` : ""} ${esc(SETTINGS.statements)} and ${esc(SETTINGS.main)} declare neither. Lean's kernel checks the expanded terms, so a notation cannot change what was proved. Show on the map: <button type="button" class="link" id="notation-show" data-mask-key="notation" aria-pressed="false">modules that declare a notation</button>, <button type="button" class="link" id="macro-show" data-mask-key="macro" aria-pressed="false">modules that declare a macro</button>.`;
  if ($("notation-show")) for (const [id, key, column, n, noun] of [["notation-show", "notation", col.notations, T.modulesWithNotation, "notation"], ["macro-show", "macro", col.macros, T.modulesWithMacro, "macro"]]) {
    $(id).onclick = () => { setMask(key, maskWhere((i) => column[i] > 0), `${fmt(n)} modules that declare a ${noun}`); $("map").scrollIntoView(); };
  }
  const tacticModules = meta.tacticBits.map((_, b) => { let n = 0; for (let i = 0; i < N; i++) n += (col.tactics[i] >>> b) & 1; return n; });
  const tacticInfo = (name) => (KEYWORDS[name] || "").replace(/^tactic: /, "");
  previewOnHover(mount("tactic-chart", Plot.plot({
    style: plotStyle(), width: 760, height: 540, marginLeft: 130, marginBottom: 46,
    x: { label: "Uses in the whole source", labelAnchor: "center", labelArrow: "none", grid: true, tickFormat: "~s" }, y: { label: null, domain: tactics.map((t) => t.name) },
    marks: [Plot.barX(tactics, { x: "n", y: "name", fill: KIND_COLOURS[0][isDark() ? 1 : 0], tip: tipOpts, title: (d) => `${d.name}: ${fmt(d.n)} uses in ${fmt(tacticModules[meta.tacticBits.indexOf(d.name)])} modules${tacticInfo(d.name) ? "\n" + tacticInfo(d.name) : ""}` }), Plot.ruleX([0])],
  })), (d) => {
    const b = meta.tacticBits.indexOf(d.name);
    return { key: d.name, label: `${fmt(tacticModules[b])} modules that use ${d.name}`, test: (i) => (col.tactics[i] >>> b) & 1 };
  });
  document.querySelectorAll("#tactic-chart [aria-label='y-axis tick label'] text").forEach((t) => { t.style.fontFamily = cssVar("--mono"); });
}

/** Which Mathlib declarations the modules' own declarations mention, measured from Lean's compiled files. */
function renderUsed() {
  const u = meta.mathlibUsed;
  if (!u) {
    $("used-text").innerHTML = `Not measured for this version. It was measured for the community cleanup of the original, whose compiled files are published: <a href="?v=cleanup#mathlib-use">see what the cleanup's modules use from Mathlib</a>.`;
    for (const id of ["used-facts", "used-hint", "used-table", "used-top", "used-not"]) $(id)?.remove();
    return;
  }
  $("used-text").textContent = "A program read Lean's compiled file for each module and listed the Mathlib declarations that the module's own declarations mention in their statements and proofs. Nothing was compiled or checked again." + (u.fromSha && u.fromSha !== SOURCE.sha ? ` The compiled files are from commit ${u.fromSha.slice(0, 7)}, when this branch had ${fmt(u.fromModules)} modules.` : "");
  $("used-facts").innerHTML = [
    ["Modules measured", `<b>${fmt(u.measured)}</b> of ${fmt(N)}`],
    ["Modules that mention a Mathlib declaration", `<b>${fmt(u.modulesUsingMathlib)}</b>`],
    ["Mathlib modules mentioned", `<b>${fmt(u.distinct)}</b> of ${fmt(u.mathlibModules)} (${pct(u.distinct / u.mathlibModules)})`],
  ].map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");
  const max = u.areas[0][1];
  $("used-table").innerHTML = `<tr><th>Part of Mathlib</th><th class="num">Mathlib modules mentioned</th><th>Project modules that mention it</th></tr>`
    + u.areas.map(([name, modules, distinct], bit) => `<tr class="hoverable" data-preview-used="${bit}"><td class="mono">Mathlib.${esc(name)}</td><td class="num">${fmt(distinct)}</td><td style="white-space:nowrap"><span class="bar" style="width:${(220 * modules) / max}px;background:${cssVar("--ink-3")}"></span>${fmt(modules)} (${pct(modules / N)})</td></tr>`).join("");
  $("used-top").innerHTML = `Mentioned by the most modules: ${u.top.slice(0, 8).map(([name, n]) => `<code>${esc(name)}</code> (${fmt(n)})`).join(", ")}.`;
  $("used-limits").innerHTML = `<li>Declarations that a mentioned declaration itself depends on.</li><li>Tactics and notation used to write a proof. They are not stored in Lean's compiled files.</li>`;
  $("used-on-map").onclick = () => { [...$("colour-by").children].find((b) => b.textContent === "Mathlib declarations used")?.click(); $("map").scrollIntoView(); };
}

/** Which parts of Mathlib the modules import by name. Only the cleanup names them; the original imports all of Mathlib. */
function renderMathlib() {
  const m = meta.mathlib, whole = meta.totals.wholeMathlibImports;
  const hub = SETTINGS.mathlibHub;
  if (hub && m.modulesNaming < N / 2) {
    // the shorter rewrite: one module imports all of Mathlib and the others reach it through that module
    const k = m.modulesNaming;
    $("mathlib-text").innerHTML = `In the rewrite, the imports do not show which parts of Mathlib each module needs. <code>${esc(SETTINGS.statements)}</code> and <code>${hub}</code> import all of Mathlib, and every other module imports <code>${hub}</code>, directly or through other modules. `
      + (k === 0 ? "No module imports a single Mathlib module by name." : k === 1 ? "Only 1 module imports a single Mathlib module by name." : `Only ${fmt(k)} modules import single Mathlib modules by name.`);
    $("mathlib-facts")?.remove(); $("mathlib-note")?.remove();
    return;
  }
  if (m.modulesNaming < N / 2) {
    $("mathlib-text").innerHTML = `${fmt(whole)} of the ${fmt(N)} modules import all of Mathlib with <code>import Mathlib</code>, so the imports do not show which parts each module needs. The community cleanup replaced that line with imports of single Mathlib modules: <a href="?v=cleanup#imports">see its import counts</a>.`;
    $("mathlib-facts")?.remove(); $("mathlib-note")?.remove();
    return;
  }
  const sharedTactic = m.shared.filter((x) => x.startsWith("Mathlib.Tactic.")).length;
  $("mathlib-text").innerHTML = VERSION === "cleanup" ? `The community cleanup replaced <code>import Mathlib</code> with imports of single Mathlib modules.` : "Most modules import single Mathlib modules by name.";
  $("mathlib-facts").innerHTML = [
    ["Modules that name the Mathlib modules they import", `<b>${fmt(m.modulesNaming)}</b> of ${fmt(N)}`],
    ["Modules that still import all of Mathlib", `<b>${fmt(whole)}</b>`],
    ["Mathlib import lines", `<b>${fmt(m.lines)}</b>, naming ${fmt(m.distinct)} different Mathlib modules`],
    m.sharedImporters && ["Modules that import one shared list", `<b>${fmt(m.sharedImporters)}</b> import the same ${fmt(m.shared.length)} Mathlib modules, ${fmt(sharedTactic)} of them from <code>Mathlib.Tactic</code>`],
    m.widelyImported && ["Other widely imported Mathlib modules", `<b>${fmt(m.widelyImported)}</b> are each imported by 1,000 or more modules`],
  ].filter(Boolean).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");
  $("mathlib-note").textContent = "Modules import more of Mathlib than their proofs use, because many of the imported Mathlib modules themselves import large parts of Mathlib." + (meta.mathlibUsed ? " What the proofs use is counted under “What the modules use from Mathlib” above." : "");
}

/** The module the longest chain ends at: its path is known once the module names have loaded. */
function fillChainEnd() {
  if (names) document.querySelectorAll(".chain-end").forEach((el) => { el.textContent = pathOf(meta.chain[meta.chain.length - 1]); });
}

export function renderNameTables() {
  fillChainEnd();
  const hubs = d3.range(N).sort((a, b) => col.dependents[b] - col.dependents[a]).slice(0, 12);
  $("hub-table").innerHTML = `<tr><th>Module</th><th>Directory label</th><th class="num">Modules that depend on it</th><th class="num">Import it directly</th></tr>`
    + hubs.map((i) => `<tr><td><button class="link" data-open="${i}">${esc(pathOf(i))}</button></td><td>${esc(labelOf(i))}</td><td class="num">${fmt(col.dependents[i])} (${pct(col.dependents[i] / N)})</td><td class="num">${fmt(col.indeg[i])}</td></tr>`).join("");
  const digitTop = d3.range(N).filter((i) => col.bytes[i] > 2000).sort((a, b) => col.digits[b] - col.digits[a]).slice(0, 10);
  $("digit-table").innerHTML = `<tr><th>Module</th><th>Directory label</th><th class="num">Digit characters</th><th class="num">Numeric literals</th><th class="num">Size</th></tr>`
    + digitTop.map((i) => `<tr><td><button class="link" data-open="${i}">${esc(pathOf(i))}</button></td><td>${esc(labelOf(i))}</td><td class="num">${col.digits[i]}%</td><td class="num">${fmt(col.literals[i])}</td><td class="num">${bytesFmt(col.bytes[i])}</td></tr>`).join("");
}
