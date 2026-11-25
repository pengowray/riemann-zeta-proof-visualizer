// The charts and tables in the sections below the map. Loaded after the map has painted.
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";
import * as Plot from "https://cdn.jsdelivr.net/npm/@observablehq/plot@0.6.16/+esm";
import { $, fmt, pct, bytesFmt, esc, meta, N, col, ones, dirs, FAMILIES, fieldFamily, KIND_COLOURS, isDark, cssVar, state, names, pathOf, dirSum } from "./data.js";
import { KEYWORDS } from "./speech.js";
import { maskWhere, setPreview, luminance, setMask, labelOf, famOf, famColour } from "./map.js";

// ---------------------------------------------------------------- sections below the map
export const plotStyle = () => ({ background: "transparent", color: cssVar("--ink"), fontFamily: cssVar("--serif"), fontSize: "13px", overflow: "visible" });
export function mount(id, plot) { const el = $(id); el.innerHTML = ""; el.append(plot); return plot; }
/** While the pointer is over a mark of the chart, highlight on the map the modules that mark stands for. */
function previewOnHover(plot, describe) {
  plot.addEventListener("input", () => {
    const d = plot.value;
    if (!d) { if (state.preview) setPreview(null); return; }
    const { key, test, label, tint } = describe(d);
    if (plot.dataset.key === key && state.preview) return;
    plot.dataset.key = key;
    setPreview(maskWhere(test), label, { tint });
  });
  plot.addEventListener("pointerleave", () => { plot.dataset.key = ""; if (state.preview) setPreview(null); });
}

export function renderCharts() {
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
  const lineBin = (i) => d3.bisectRight(edges, Math.max(col.lines[i], 1)) - 1;
  const lengthRows = d3.rollups(d3.range(N), (v) => v.length, lineBin, (i) => (col.kind[i] === 1 ? 1 : 0))
    .flatMap(([b, ks]) => ks.map(([kind, n]) => ({ bin: binLabel(b), b, kind: kind ? "Restates a theorem" : "Other modules", n })));
  const kindScale = { domain: ["Other modules", "Restates a theorem"], range: [KIND_COLOURS[0][isDark() ? 1 : 0], KIND_COLOURS[1][isDark() ? 1 : 0]], legend: true };
  const tipOpts = { fill: cssVar("--paper"), stroke: cssVar("--ink-3") };
  // hovering a bar shows that bar's modules on the maps, in the bar's two colours
  const kindTint = { colours: kindScale.range, index: Uint8Array.from(col.kind, (k) => (k === 1 ? 1 : 0)) };
  const repBin = (i) => (col.repeat[i] === 255 ? -1 : Math.min(9, Math.floor(col.repeat[i] / 10)));
  const binTotal = (rows, b) => d3.sum(rows, (r) => (r.b === b ? r.n : 0));
  previewOnHover(mount("length-chart", Plot.plot({
    style: plotStyle(), width: 520, height: 300, marginLeft: 60, marginBottom: 46,
    x: { label: "Lines in the module", labelAnchor: "center", labelArrow: "none", domain: d3.range(edges.length - 1).map(binLabel) }, y: { label: "Modules", grid: true, tickFormat: "~s" }, color: kindScale,
    marks: [Plot.barY(lengthRows, { x: "bin", y: "n", fill: "kind", order: kindScale.domain, insetLeft: 1, insetRight: 1, tip: tipOpts, title: (d) => `${fmt(d.n)} modules with ${d.bin} lines\n${d.kind}` }), Plot.ruleY([0])],
  })), (d) => ({ key: `lines${d.b}`, label: `${fmt(binTotal(lengthRows, d.b))} modules with ${d.bin} lines`, test: (i) => lineBin(i) === d.b, tint: kindTint }));
  const repRows = d3.rollups(d3.range(N).filter((i) => col.repeat[i] !== 255), (v) => v.length, (i) => Math.min(9, Math.floor(col.repeat[i] / 10)), (i) => (col.kind[i] === 1 ? 1 : 0))
    .flatMap(([b, ks]) => ks.map(([kind, n]) => ({ bin: `${b * 10}–${b * 10 + 10}`, b, kind: kind ? "Restates a theorem" : "Other modules", n })));
  previewOnHover(mount("repeat-chart", Plot.plot({
    style: plotStyle(), width: 520, height: 300, marginLeft: 60, marginBottom: 46,
    x: { label: "Share of the module that repeats its neighbour (%)", labelAnchor: "center", labelArrow: "none", domain: d3.range(10).map((b) => `${b * 10}–${b * 10 + 10}`) }, y: { label: "Modules", grid: true, tickFormat: "~s" }, color: kindScale,
    marks: [Plot.barY(repRows, { x: "bin", y: "n", fill: "kind", order: kindScale.domain, insetLeft: 1, insetRight: 1, tip: tipOpts, title: (d) => `${fmt(d.n)} modules\n${d.bin}% repeated\n${d.kind}` }), Plot.ruleY([0])],
  })), (d) => ({ key: `repeat${d.b}`, label: `${fmt(binTotal(repRows, d.b))} modules that repeat ${d.bin}% of their neighbour`, test: (i) => repBin(i) === d.b, tint: kindTint }));
  const medianRep = (kind) => d3.median(d3.range(N).filter((i) => col.repeat[i] !== 255 && (col.kind[i] === 1) === kind), (i) => col.repeat[i]);
  $("repeat-text").textContent = `Repetition is measured by compressing each module after the compressor has read the module before it in the same directory. For a typical module that states and proves mathematics, ${medianRep(false)}% of the text is repeated from its neighbour. For a typical restating module it is ${medianRep(true)}%. Apart from the restating modules, exact copies are rare: ${fmt(shapeDup)} modules belong to a group of ten or more that are identical once names and numbers are ignored.`;

  // --- areas of mathematics
  const fieldTotals = meta.fields.map(() => ({ modules: 0, lines: 0, bytes: 0 }));
  for (let i = 0; i < N; i++) { const t = fieldTotals[col.field[i]]; t.modules++; t.lines += col.lines[i]; t.bytes += col.bytes[i]; }
  const objects = meta.fields.map(() => new Map());
  meta.groups.forEach((g, gi) => { for (const o of g.objects) objects[g.field].set(o, (objects[g.field].get(o) || 0) + 1); });
  const maxLines = d3.max(fieldTotals, (t) => t.lines);
  $("field-table").innerHTML = `<tr><th>Field</th><th class="num">Share of modules</th><th class="num" title="Share of the ${fmt(meta.totals.randomN)} randomly sampled modules that a language model assigned to this field after reading them">Share in ${fmt(meta.totals.randomN)} modules read by a model</th><th>Lines</th></tr>`
    + meta.fields.map((f, fi) => ({ f, fi, t: fieldTotals[fi] })).filter((r) => r.t.modules).sort((a, b) => b.t.lines - a.t.lines).map(({ f, fi, t }) =>
      `<tr class="hoverable field-row" data-preview-field="${fi}"><td style="white-space:nowrap"><span class="sw" style="background:${famColour(fieldFamily[fi])}"></span>${esc(f.name)}</td><td class="num">${pct(t.modules / N)}</td><td class="num">${pct(meta.totals.randomCounts[fi] / meta.totals.randomN)}</td>
       <td style="white-space:nowrap"><span class="bar" style="width:${(150 * t.lines) / maxLines}px;background:${famColour(fieldFamily[fi])}"></span>${fmt(t.lines)}</td></tr>
       <tr class="hoverable objects-row" data-preview-field="${fi}"><td colspan="4" class="objects">${[...objects[fi]].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([o]) => esc(o)).join(" · ") || "No objects named"}</td></tr>`).join("");

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
  $("chain-text").innerHTML = `The longest chain of imports is ${meta.chain.length} modules: each module in it imports the one before. It ends at Main.lean. Each cell below is one module in the chain, coloured by field. Point at a cell to see where that module is on the map, and click it to read it. <button type="button" class="link" id="chain-show" data-mask-key="chain" aria-pressed="false">Draw the chain on the map</button>`;
  $("chain-show").onclick = () => { const m = new Uint8Array(N); for (const i of meta.chain) m[i] = 1; setMask("chain", m, `the longest import chain, ${meta.chain.length} modules`, true); $("map").scrollIntoView(); };
  $("chain-strip").innerHTML = `<div class="chain-cells">${chainRows.map((d) => `<button type="button" class="chain-cell" data-chain="${d.j}" data-open="${d.i}" style="background:${famColour(famOf(d.i))}" aria-label="Module ${d.j} of ${chainRows.length} in the chain"></button>`).join("")}</div>
    <div class="chain-axis"><span>1: imports no project module</span><span>${chainRows.length}: Main.lean</span></div>`;

  // --- numbers and tactics
  const tactics = meta.tactics.filter((t) => t[0] !== "sorry").slice(0, 24).map(([name, n]) => ({ name, n }));
  const tc = Object.fromEntries(meta.tactics);
  const longDigits = d3.sum(col.digits, (d) => (d >= 20 ? 1 : 0));
  $("numbers-text").textContent = `The source is proof text, not data. It contains ${fmt(meta.totals.literals)} numeric literals such as 2 or 1/2, about ${Math.round(meta.totals.literals / N)} per module, but only ${fmt(meta.totals.longLiterals)} of them have seven or more digits, and those sit in ${fmt(meta.totals.modulesWithLongLiterals)} modules. Counting characters instead, ${fmt(longDigits)} of the ${fmt(N)} modules are 20% digits or more. Numbers in set_option lines are settings and are not counted. The proof never uses native_decide, and it uses decide ${fmt(tc.decide || 0)} times. The most common proof steps are have (state an intermediate fact, ${fmt(tc.have)} times), rw (rewrite with an equation, ${fmt(tc.rw)}) and exact (give the proof term, ${fmt(tc.exact)}).`;
  // notation and macros: both sentences end in a button that highlights those modules on the map
  const T = meta.totals;
  $("syntax-text").innerHTML = `A notation gives a symbol a meaning, and a macro gives a name to a sequence of tactics. The source declares ${fmt(T.notations)} notations in ${fmt(T.modulesWithNotation)} modules. ${fmt(T.localNotations)} of them are marked <code>local</code>, so they apply only inside the file that declares them. Most are shorthand for a long expression, such as <code>local notation "θ" => fontaineTheta (normInteger K) p</code>. It declares ${fmt(T.macros)} macros in ${fmt(T.modulesWithMacro)} modules. Statements.lean and Main.lean declare neither. Lean's kernel checks the expanded terms, so a notation cannot change what was proved. Show on the map: <button type="button" class="link" id="notation-show" data-mask-key="notation" aria-pressed="false">modules that declare a notation</button>, <button type="button" class="link" id="macro-show" data-mask-key="macro" aria-pressed="false">modules that declare a macro</button>.`;
  for (const [id, key, column, n, noun] of [["notation-show", "notation", col.notations, T.modulesWithNotation, "notation"], ["macro-show", "macro", col.macros, T.modulesWithMacro, "macro"]]) {
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

export function renderNameTables() {
  const hubs = d3.range(N).sort((a, b) => col.dependents[b] - col.dependents[a]).slice(0, 12);
  $("hub-table").innerHTML = `<tr><th>Module</th><th>Directory label</th><th class="num">Modules that depend on it</th><th class="num">Import it directly</th></tr>`
    + hubs.map((i) => `<tr><td><button class="link" data-open="${i}">${esc(pathOf(i))}</button></td><td>${esc(labelOf(i))}</td><td class="num">${fmt(col.dependents[i])} (${pct(col.dependents[i] / N)})</td><td class="num">${fmt(col.indeg[i])}</td></tr>`).join("");
  const digitTop = d3.range(N).filter((i) => col.bytes[i] > 2000).sort((a, b) => col.digits[b] - col.digits[a]).slice(0, 10);
  $("digit-table").innerHTML = `<tr><th>Module</th><th>Directory label</th><th class="num">Digit characters</th><th class="num">Numeric literals</th><th class="num">Size</th></tr>`
    + digitTop.map((i) => `<tr><td><button class="link" data-open="${i}">${esc(pathOf(i))}</button></td><td>${esc(labelOf(i))}</td><td class="num">${col.digits[i]}%</td><td class="num">${fmt(col.literals[i])}</td><td class="num">${bytesFmt(col.bytes[i])}</td></tr>`).join("");
}
