// Entry point: the hero, the term chips and search, the previews, and the table of contents.
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";
import { renderLean } from "./speech.js";
import { drawZeta } from "./zeta.js";
import { VERSION, SOURCE, REPO, versionsReady, dateFmt, moduleFamily, rawUrl, $, fmt, pct, bytesFmt, plural, esc, meta, N, col, dirs, leafDir, darkQuery, state, names, namesReady, termsReady } from "./data.js";
import { recolour, requestDraw, refreshMini, countMask, maskWhere, setMask, setPreview, renderLegend, chainMask, chainLabel } from "./map.js";
import "./graph.js";

// ---------------------------------------------------------------- which version of the proof this is
// text that is true of only one version carries data-only="original" or data-only="cleanup"
document.querySelectorAll("[data-only]").forEach((el) => { if (el.dataset.only !== VERSION) el.remove(); });
const shortSha = SOURCE.sha.slice(0, 7);
versionsReady.then((versions) => {
  $("versions").innerHTML = `<span class="control-label">Version</span>` + versions.map((v) =>
    `<a href="${v.id === "original" ? "./" : "?v=" + v.id}"${v.id === VERSION ? ' aria-current="page"' : ""}><b>${esc(v.label)}</b> ${dateFmt(v.date)} · ${fmt(v.modules)} modules</a>`).join("");
  const original = versions.find((v) => v.id === "original");
  if (VERSION === "cleanup" && original) {
    $("cleanup-lede").innerHTML = `Members of the Lean community are cleaning up Levent Alpöge's Lean 4 formalization of the Riemann Hypothesis, released on 20 November 2026, in <a href="${REPO}">${esc(SOURCE.repo)}</a>. This page shows their <code>main</code> branch as it was on ${dateFmt(SOURCE.date)} (commit <code>${shortSha}</code>): ${fmt(N)} modules and ${fmt(meta.totals.lines)} lines, down from ${fmt(original.modules)} modules and ${fmt(original.lines)} lines in the original release. A module is one <code>.lean</code> file.`;
  }
});
$("source-note").innerHTML = VERSION === "cleanup"
  ? `The Lean source is the <code>main</code> branch of <a href="${REPO}">${esc(SOURCE.repo)}</a> at commit <a href="${REPO}/tree/${SOURCE.sha}"><code>${shortSha}</code></a> of ${dateFmt(SOURCE.date)}. That branch changes many times a day, so the numbers here are a snapshot. This site stores module names and counts, and loads code from GitHub when you open a module.`
  : `The Lean source is from <a href="https://alpo.ge/remark.pdf">Alpöge's announcement</a>. The page reads it from the <code>original</code> branch of <a href="${REPO}">${esc(SOURCE.repo)}</a> at commit <a href="${REPO}/tree/${SOURCE.sha}"><code>${shortSha}</code></a>, which keeps the release unchanged. The archive declares no licence, so this site does not store the Lean files; it stores module names and counts, and loads code from GitHub when you open a module.`;

// ---------------------------------------------------------------- hero
const declTotal = d3.sum(meta.declKinds, (d) => d[1]);
const declCount = Object.fromEntries(meta.declKinds);
const sorryCount = Object.fromEntries(meta.tactics).sorry || 0;
$("facts").innerHTML = [
  ["Modules", `<b>${fmt(N)}</b>`],
  ["Lines of Lean", `<b>${fmt(meta.totals.lines)}</b>`],
  ["Source size", `<b>${bytesFmt(meta.totals.bytes)}</b>, or ${bytesFmt(meta.totals.zbytes)} with each file compressed by zlib`],
  ["Declarations", `<b>${fmt(declTotal)}</b>: ${fmt((declCount.theorem || 0) + (declCount.lemma || 0))} theorems and lemmas, ${fmt((declCount.def || 0) + (declCount.abbrev || 0))} definitions`],
  ["Comments and docstrings", `<b>${meta.totals.commentBytes ? bytesFmt(meta.totals.commentBytes) : "None"}</b>${meta.totals.mergeRecordBytes ? `. ${bytesFmt(meta.totals.mergeRecordBytes)} of that is records written by the cleanup's merge script, which lists the smaller modules each merged module was made from` : ""}`],
  ["Uses of <code>sorry</code>", `<b>${fmt(sorryCount)}</b> (<code>sorry</code> is Lean's placeholder for a step left unproved)${meta.sorryModules.length ? `, all in ${meta.sorryModules.map(([p]) => esc(p)).join(", ")}` : ""}`],
  ["Longest import chain", `<b>${fmt(meta.totals.longestChain)}</b> modules`],
].filter(Boolean).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");

const zerosSeen = drawZeta($("zeta"), 60, (t) => { $("zeta-t").textContent = t.toFixed(1).padStart(4, " "); });
$("zeta-zeros").textContent = `The ${zerosSeen.length} zeros up to t = 60 are at t ≈ ${zerosSeen.map((z) => z.toFixed(2)).join(", ")}.`;

for (const [id, path] of [["code-statements", "Statements.lean"], ["code-main", "Main.lean"]]) {
  fetch(rawUrl(path)).then((r) => { if (!r.ok) throw new Error(`${r.status} ${r.statusText}`); return r.text(); })
    .then((t) => { $(id).innerHTML = renderLean(t.trimEnd()); })
    .catch((err) => { $(id).textContent = `Couldn't load ${path} from GitHub: ${err.message}`; });
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
// steps of the announcement's timeline, mapped to module paths by the blueprint
if ($("build-note")) $("build-note").innerHTML = `Build times are wall-clock times from one rebuild by <a href="https://github.com/patunz/rh-build-live">Lucio Patone</a> (snapshot of 22 November 2026), ${fmt(Math.round(meta.totals.buildSeconds / 3600))} hours in total over ${fmt(meta.totals.buildMeasured)} modules. Many modules compiled at once on one machine, so a module's time depends on what else was running.`;
const stepMasks = new Map(); // step number -> { mask, label }, for previews while the pointer is over a step
const DOTS = { clear: "●", partial: "◐", weak: "○" };
const CONFIDENCE = { clear: "the blueprint found the object clearly", partial: "names and position fit, proofs not read", weak: "weak evidence" };
Promise.all([fetch("data/steps.json").then((r) => r.json()), namesReady]).then(([data]) => {
  const paths = dirs.map((d) => d.path + "/");
  for (const step of data.steps) {
    // a pattern matches a directory path, a module name, or (when it ends in .lean) one exact file
    const files = step.match.filter((m) => m.endsWith(".lean")).map((m) => m.slice(0, -5));
    const plain = step.match.filter((m) => !m.endsWith(".lean"));
    const inName = plain.filter((m) => !m.includes("/"));
    const dirHit = paths.map((p) => plain.some((m) => p.includes(m)));
    const fileDir = paths.map((p) => files.filter((f) => p.endsWith(f.slice(0, f.lastIndexOf("/") + 1))).map((f) => f.slice(f.lastIndexOf("/") + 1)));
    const mask = maskWhere((i) => dirHit[leafDir[i]] || inName.some((m) => names[i].includes(m)) || fileDir[leafDir[i]].includes(names[i]));
    const count = countMask(mask);
    const key = `step:${step.n}`, label = `${plural(count, "module")} for step ${step.n}, “${step.title}”`;
    stepMasks.set(step.n, { mask, label });
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button"; b.dataset.maskKey = key; b.dataset.step = step.n; b.setAttribute("aria-pressed", "false"); b.disabled = !count;
    b.title = count ? `Evidence: ${CONFIDENCE[step.confidence]}. Click to keep the highlight.` : "No module or directory name matches";
    b.innerHTML = `<span class="dot">${DOTS[step.confidence]}</span><span class="num">${step.n}.</span><span>${esc(step.title)}</span><span class="n">${count ? fmt(count) : "none"}</span>`;
    b.onclick = () => setMask(key, mask, label);
    li.append(b);
    $("steps").append(li);
  }
});

// table of independent checks; the cells hold trusted HTML written for this page
if ($("checks-table")) fetch("data/checks.json").then((r) => r.json()).then((data) => {
  $("checks-table").innerHTML = `<tr><th>Who</th><th>What was run</th><th>Reported result</th></tr>`
    + data.checks.map((c) => `<tr><td data-label="Who"><a href="${c.url}">${c.who}</a>${c.detail ? (c.detail.startsWith("(") ? " " : ", ") + c.detail : ""}</td><td data-label="What was run">${c.ran}</td><td data-label="Reported result">${c.result}</td></tr>`).join("");
});

// Numbers section: switch the map to the digit colouring
for (const [id, label] of [["digits-on-map", "Digit characters 0–9"], ["literals-on-map", "Numeric literals"]]) {
  $(id).onclick = () => {
    [...$("colour-by").children].find((b) => b.textContent === label)?.click();
    $("map").scrollIntoView();
  };
}

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
$("agree-note").textContent = !truth.n ? `The field of a module is a statistical estimate. A naive Bayes classifier learned from ${fmt(truth.trained)} modules of the original release that a language model read and named a field for, using the identifiers and namespaces each module mentions. It was tested on the original release (see that version's page) and is applied here unchanged.` : `The field of a module is a statistical estimate. A language model read ${fmt(truth.trained + truth.n)} sampled modules and named each one's field. A naive Bayes classifier learned from ${fmt(truth.trained)} of them, using the identifiers and namespaces each module mentions, and was then tested on the other ${fmt(truth.n)}. It gave the same field as the model for ${pct(truth.exact / truth.n)} of them and a field of the same colour family for ${pct(truth.family / truth.n)} (${pct(truth.familyOrSecond / truth.n)} when the model's second choice also counts). Hand-written keyword rules reached ${pct(truth.keywordFamily / truth.n)} in the same family, and the directory labels ${pct(truth.dirFamily / truth.n)}.`;

// rows that preview a highlight on the map while the pointer is over them
document.addEventListener("pointerover", (e) => {
  const cell = e.target.closest?.("[data-chain]");
  if (cell || e.target.closest?.("#chain-show, #chain-strip")) {
    const j = cell ? +cell.dataset.chain : 0;
    setPreview(chainMask, cell ? `Module ${j} of ${meta.chain.length} in the longest import chain` : chainLabel, { chain: true, marker: cell ? meta.chain[j - 1] : -1 });
    return;
  }
  const stepEl = e.target.closest?.("[data-step]");
  if (stepEl && stepMasks.has(+stepEl.dataset.step)) {
    const { mask, label } = stepMasks.get(+stepEl.dataset.step);
    if (state.previewLabel !== label) setPreview(mask, label);
    return;
  }
  const opener = e.target.closest?.("table.data [data-open]");
  if (opener) {
    const i = +opener.dataset.open;
    if (state.marker !== i) { state.marker = i; requestDraw(); refreshMini(); }
    return;
  }
  if (state.marker >= 0 && !state.preview) { state.marker = -1; requestDraw(); refreshMini(); }
  const famEl = e.target.closest?.("[data-preview-family]");
  if (famEl) {
    const g = +famEl.dataset.previewFamily, label = famEl.children[1].textContent;
    if (state.previewLabel !== label) setPreview(maskWhere((i) => moduleFamily(i) === g), label);
    return;
  }
  const lib = e.target.closest?.("[data-preview-mathlib]");
  if (lib) {
    const bit = +lib.dataset.previewMathlib, label = `Modules that import from Mathlib.${meta.mathlib.areas[bit][0]}`;
    if (state.previewLabel !== label) setPreview(maskWhere((i) => (col.mathlibAreas[i] >>> bit) & 1), label);
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
