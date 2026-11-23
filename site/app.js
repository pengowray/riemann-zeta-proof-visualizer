// Entry point: the hero, the term chips and search, the previews, and the table of contents.
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";
import { renderLean } from "./speech.js";
import { drawZeta } from "./zeta.js";
import { $, fmt, pct, bytesFmt, plural, esc, meta, N, col, dirs, leafDir, darkQuery, state, names, namesReady, termsReady } from "./data.js";
import { recolour, requestDraw, refreshMini, countMask, maskWhere, setMask, setPreview, renderLegend, chainMask, chainLabel } from "./map.js";
import "./graph.js";

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

const truth = meta.totals.truth;
$("agree-note").textContent = `The field of a module is a keyword estimate, and a rough one. A language model read ${fmt(truth.n)} randomly chosen modules and named each one's field. The keyword estimate gave the same field for ${pct(truth.exact / truth.n)} of them and a field of the same colour family for ${pct(truth.family / truth.n)} (${pct(truth.familyOrSecond / truth.n)} when the model's second choice also counts). The directory labels did worse: ${pct(truth.dirFamily / truth.n)} in the same family. Adjusting the keyword weights on half of the sample did not improve the other half.`;

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


// The chart library is large, so the sections below the map load after the map has painted.
let charts = null;
setTimeout(async () => {
  charts = await import("./charts.js");
  charts.renderCharts();
  await namesReady;
  charts.renderNameTables();
}, 200);
namesReady.then(() => requestDraw());
darkQuery.addEventListener("change", () => { recolour(); renderLegend(); requestDraw(); refreshMini(); charts?.renderCharts(); });
