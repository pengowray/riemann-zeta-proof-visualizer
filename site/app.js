// Entry point: the hero, the term chips and search, the previews, and the table of contents.
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";
import { renderLean } from "./speech.js";
import { drawZeta } from "./zeta.js";
import { VERSION, SOURCE, REPO, listed, PARTS, partOf, HAS_COMMENTS, ORIGINAL, SETTINGS, hasFeature, versionUrl, dateFmt, moduleFamily, rawUrl, $, fmt, pct, bytesFmt, plural, esc, meta, N, col, dirs, leafDir, darkQuery, state, names, namesReady, termsReady } from "./data.js";
import { recolour, requestDraw, refreshMini, countMask, maskWhere, setMask, setPreview, renderLegend, chainMask, chainLabel } from "./map.js";
import "./graph.js";

// ---------------------------------------------------------------- which version of the proof this is
// text that is true of only some versions carries data-only="<id> <id> …"
document.querySelectorAll("[data-only]").forEach((el) => { if (!el.dataset.only.split(" ").includes(VERSION)) el.remove(); });
// optional sections carry data-feature="<name>" and show when the version's settings list that feature
document.querySelectorAll("[data-feature]").forEach((el) => { if (!hasFeature(el.dataset.feature)) el.remove(); });
const shortSha = SOURCE.sha.slice(0, 7);
const commitLink = `<a href="${REPO}/tree/${SOURCE.sha}"><code>${shortSha}</code></a>`;
const families = () => [...new Set(listed.map((v) => v.family))];
const repoLink = (repo) => `<a href="https://github.com/${repo}">${esc(repo)}</a>`;
// above the title on a phone: the versions grouped by family, as in the sidebar
const versionLink = (v, extra = "") => `<a href="${versionUrl(v.id)}"${v.id === VERSION ? ' aria-current="page"' : ""}>${esc(v.short)}${extra}</a>`;
$("versions").innerHTML = `<span class="control-label">Version of the proof</span>` + families().map((f) => `<span class="family">${esc(f)}</span>`
  + listed.filter((v) => v.family === f).map((v) => versionLink(v, ` <span class="n">${fmt(v.modules)} modules</span>`)).join("")).join("");
// the sidebar's list: the same choice, kept in view while the page scrolls, grouped by family
$("version-pick").innerHTML = `<span class="control-label"><span>Version</span><span>Modules</span></span>` + families().map((f) => `<span class="family">${esc(f)}</span>`
  + listed.filter((v) => v.family === f).map((v) => versionLink(v, `<span class="n">${fmt(v.modules)}</span>`)).join("")).join("");
const sizeNow = `${fmt(N)} modules and ${fmt(meta.totals.lines)} lines`;
const sizeBefore = `${fmt(ORIGINAL.modules)} modules and ${fmt(ORIGINAL.lines)} lines`;
const grhLink = repoLink("lsernau/grh-lean");
// uses of sorry outside the statements file: steps left unproved
const gaps = meta.sorryModules.filter(([p]) => p !== SETTINGS.statements);
const gapCount = gaps.reduce((a, [, n]) => a + n, 0);
const LEDES = {
  cleanup: `This page shows the last version of the Lean community's cleanup of Levent Alpöge's Lean 4 formalization of the Riemann Hypothesis, released on 20 November 2026. The cleanup took place in ${repoLink(SOURCE.repo)} until the community moved the repository's <code>main</code> branch to a shorter rewrite of the proof. The cleanup of the original is kept on the <code>alpoge</code> branch, shown here at commit ${commitLink} of ${dateFmt(SOURCE.date)}: ${sizeNow}, down from ${sizeBefore} in the original release. A module is one <code>.lean</code> file.`,
  main: `Members of the Lean community are cleaning up a shorter rewrite of Levent Alpöge's Lean 4 formalization of the Riemann Hypothesis, in ${repoLink(SOURCE.repo)}. Their <code>main</code> branch started from the readable edition of ${grhLink}, which lsernau made with colleagues at Anthropic and with Claude and published on 25 November 2026. This page shows that branch at commit ${commitLink} of ${dateFmt(SOURCE.date)}: ${sizeNow}, compared with ${sizeBefore} in the original release. A module is one <code>.lean</code> file. The rewrite's README says that no mathematician has read it through.`,
  grh: `${grhLink} is a shorter rewrite of Levent Alpöge's Lean 4 formalization of the Riemann Hypothesis, made by lsernau with colleagues at Anthropic and with Claude, and published on 25 November 2026. It has a readable edition and a compact edition. This page shows the readable edition at commit ${commitLink} of ${dateFmt(SOURCE.date)}: ${sizeNow}, compared with ${sizeBefore} in the original release. A module is one <code>.lean</code> file. The rewrite's README says that no mathematician has read it through.`,
  compact: `${grhLink} is a shorter rewrite of Levent Alpöge's Lean 4 formalization of the Riemann Hypothesis, made by lsernau with colleagues at Anthropic and with Claude, and published on 25 November 2026. It has a readable edition and a compact edition. This page shows the compact edition at commit ${commitLink} of ${dateFmt(SOURCE.date)}: ${sizeNow}, compared with ${sizeBefore} in the original release. A module is one <code>.lean</code> file. The rewrite's README says that no mathematician has read it through.`,
  jamesyc: `${repoLink(SOURCE.repo)} is a new, unfinished Lean 4 formalization of the Riemann Hypothesis: ${plural(gapCount, "step")} of its proof, in ${plural(gaps.length, "module")}, are left unproved. The GitHub user jamesyc wrote it, and its README says it was written using only the AI model GPT-6.2 Sol. The README also says the author does not believe that cleaning up Levent Alpöge's 17-million-line formalization is the best way. This page shows commit ${commitLink} of ${dateFmt(SOURCE.date)}: ${sizeNow}, compared with ${sizeBefore} in the original release. A module is one <code>.lean</code> file.`,
};
if ($("statement-gaps")) $("statement-gaps").innerHTML = `<code>${esc(SETTINGS.statements)}</code> states the five theorems that this version sets out to prove, the same five as in the other versions: the Riemann Hypothesis and statements about the zeros of Dirichlet <i>L</i>-functions. Each theorem in <code>${esc(SETTINGS.statements)}</code> has <code>sorry</code> in place of its proof. That is intended, because this file only gives the statements. <code>${esc(SETTINGS.main)}</code> proves the five theorems by citing theorems from other modules. A proof that depends on a <code>sorry</code> is not complete, and in this snapshot ${plural(gapCount, "<code>sorry</code> placeholder")} remain in ${plural(gaps.length, "module")} that <code>${esc(SETTINGS.main)}</code> imports, directly or through other modules.`;
if (LEDES[VERSION]) $("version-lede").innerHTML = LEDES[VERSION];
if ($("labelled-groups")) $("labelled-groups").textContent = fmt(meta.totals.labelledGroups);
const STORED = "This site stores module names and counts, and loads a module's code from GitHub when you open that module.";
const LINES_NOTE = (readme) => `Line counts include blank lines and comments; the README's figure of about ${readme} lines of code leaves them out.`;
const SOURCE_NOTES = {
  original: `The Lean source is from <a href="https://alpo.ge/remark.pdf">Alpöge's announcement</a>. The page reads it from the <code>original</code> branch of ${repoLink(SOURCE.repo)} at commit ${commitLink}, an unchanged copy of the release. The archive declares no licence, so this site does not store the Lean files; it stores module names and counts, and loads code from GitHub when you open a module.`,
  cleanup: `The Lean source is the <code>alpoge</code> branch of ${repoLink(SOURCE.repo)} at commit ${commitLink} of ${dateFmt(SOURCE.date)}, the last commit of the cleanup of the original. ${STORED}`,
  main: `The Lean source is the <code>main</code> branch of ${repoLink(SOURCE.repo)} at commit ${commitLink} of ${dateFmt(SOURCE.date)}, under the Apache 2.0 licence. This branch began as a copy of the readable edition of ${grhLink} (commit <code>72fead1</code>) and changes often, so the numbers here are a snapshot. ${STORED} ${LINES_NOTE("300,000")}`,
  jamesyc: `The Lean source is the <code>main</code> branch of ${repoLink(SOURCE.repo)} at commit ${commitLink} of ${dateFmt(SOURCE.date)}. The repository declares no licence, so this site stores only module names and counts, and loads a module's code from GitHub when you open that module. Its <code>holes.md</code> lists the steps left unproved and cites sections of ${repoLink("jimjamzola/RH-Alpoge-Reconstruction")}, a written reconstruction of Alpöge's argument. The project uses Lean and Mathlib v4.36.0, newer than the other versions. It was discussed in a <a href="https://news.ycombinator.com/item?id=50648936">Hacker News thread</a>.`,
  grh: `The Lean source is the readable edition of ${grhLink}, in its <code>grh</code> folder, at commit ${commitLink} of ${dateFmt(SOURCE.date)}, under the Apache 2.0 licence. The README says the repository is not maintained. ${STORED} ${LINES_NOTE("300,000")}`,
  compact: `The Lean source is the compact edition of ${grhLink}, in its <code>grh-compact</code> folder, at commit ${commitLink} of ${dateFmt(SOURCE.date)}, under the Apache 2.0 licence. The README says the repository is not maintained. ${STORED} ${LINES_NOTE("76,000")}`,
};
$("source-note").innerHTML = SOURCE_NOTES[VERSION];

// ---------------------------------------------------------------- hero
const declTotal = d3.sum(meta.declKinds, (d) => d[1]);
const declCount = Object.fromEntries(meta.declKinds);
const sorryCount = Object.fromEntries(meta.tactics).sorry || 0;
/** Where the uses of sorry are: the files when there are a few, otherwise counts, with the statements file apart. */
function sorryWhere() {
  const list = meta.sorryModules;
  if (!list.length) return "";
  if (list.length <= 3) return `, all in ${list.map(([p]) => esc(p)).join(", ")}`;
  const inStatements = list.find(([p]) => p === SETTINGS.statements);
  if (!inStatements) return `, in ${plural(list.length, "module")}`;
  const rest = sorryCount - inStatements[1];
  return `: ${fmt(inStatements[1])} in ${esc(SETTINGS.statements)}, and ${fmt(rest)} in ${plural(list.length - 1, "other module")}`;
}
$("facts").innerHTML = [
  ["Modules", `<b>${fmt(N)}</b>`],
  ["Lines of Lean", `<b>${fmt(meta.totals.lines)}</b>${HAS_COMMENTS ? `, of which ${fmt(meta.totals.codeLines)} are code (not blank, not only a comment)` : ""}`],
  ["Source size", `<b>${bytesFmt(meta.totals.bytes)}</b>, or ${bytesFmt(meta.totals.zbytes)} with each file compressed by zlib`],
  ["Declarations", `<b>${fmt(declTotal)}</b> written in the source: ${fmt((declCount.theorem || 0) + (declCount.lemma || 0))} theorems and lemmas, ${fmt((declCount.def || 0) + (declCount.abbrev || 0))} definitions`],
  ["Comments and docstrings", `<b>${meta.totals.commentBytes ? bytesFmt(meta.totals.commentBytes) : "None"}</b>${meta.totals.mergeRecordBytes ? `. ${bytesFmt(meta.totals.mergeRecordBytes)} of that is records written by the cleanup's merge script, which lists the smaller modules each merged module was made from` : ""}`],
  ["Uses of <code>sorry</code>", `<b>${fmt(sorryCount)}</b> (<code>sorry</code> is Lean's placeholder for a step left unproved)${sorryWhere()}`],
  ["Longest import chain", `<b>${fmt(meta.totals.longestChain)}</b> modules`],
].filter(Boolean).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");

const zerosSeen = drawZeta($("zeta"), 60, (t) => { $("zeta-t").textContent = t.toFixed(1).padStart(4, " "); });
$("zeta-zeros").textContent = `The ${zerosSeen.length} zeros up to t = 60 are at t ≈ ${zerosSeen.map((z) => z.toFixed(2)).join(", ")}.`;

for (const [id, path] of [["code-statements", SETTINGS.statements], ["code-main", SETTINGS.main]]) {
  $(id + "-name").textContent = path;
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
  b.innerHTML = `${esc(term.label)}<span class="n">${plural(term.files, "module")}</span>`;
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
// the blueprint names paths of the original release, so the rewrite's pages leave the steps out
if ($("steps")) Promise.all([fetch("data/steps.json").then((r) => r.json()), namesReady]).then(([data]) => {
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
if ($("field-agree") && truth.n) $("field-agree").innerHTML = `In a test on ${fmt(truth.n)} modules, its prediction was the same as a language model's reading for ${pct(truth.exact / truth.n)} of them (<a href="#sources">details under Sources and method</a>).`;
// the other counts of declarations on the page, which are larger than the count from the source text
const otherDeclCounts = [meta.constProps?.method === "compiled" && `${fmt(meta.constProps.declarations)} in Lean's compiled files`, VERSION === "original" && "1,484,729 checked by Lean's kernel in the <code>nanoda</code> runs"].filter(Boolean);
if (otherDeclCounts.length) $("decl-more").innerHTML = ` Lean also generates auxiliary declarations, so counts from other sources are larger: ${otherDeclCounts.join(", and ")}.`;
$("agree-note").textContent = !truth.n ? `The field of a module is a statistical estimate. A naive Bayes classifier learned from ${fmt(truth.trained)} modules of the original release that a language model read and named a field for, using the identifiers and namespaces each module mentions. It was tested on the original release (see that version's page) and is applied here unchanged.` : `The field of a module is a statistical estimate. A language model read ${fmt(truth.trained + truth.n)} sampled modules and named each one's field. A naive Bayes classifier learned from ${fmt(truth.trained)} of them, using the identifiers and namespaces each module mentions, and was then tested on the other ${fmt(truth.n)}. It gave the same field as the model for ${pct(truth.exact / truth.n)} of them and a field in the same group for ${pct(truth.family / truth.n)}, where a group is the fields that share a colour on the map (${pct(truth.familyOrSecond / truth.n)} when the model's second choice also counts). Hand-written keyword rules reached ${pct(truth.keywordFamily / truth.n)} in the same group, and the directory labels ${pct(truth.dirFamily / truth.n)}.`;

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
  const constRow = e.target.closest?.("[data-preview-const]");
  if (constRow) {
    const d = meta.constProps.defs[+constRow.dataset.previewConst], label = `${d.name.split(".").pop()}: used in ${plural(d.modules.length, "other module")}`;
    if (state.previewLabel !== label) { const set = new Set(d.modules); setPreview(maskWhere((i) => set.has(i)), label); }
    return;
  }
  const usedRow = e.target.closest?.("[data-preview-used]");
  if (usedRow) {
    const bit = +usedRow.dataset.previewUsed, label = `Modules that mention declarations of Mathlib.${meta.mathlibUsed.areas[bit][0]}`;
    if (state.previewLabel !== label) setPreview(maskWhere((i) => (col.mathlibUsedAreas[i] >>> bit) & 1), label);
    return;
  }
  const row = e.target.closest?.("[data-preview-field],[data-preview-dir]");
  if (!row) { if (state.preview) setPreview(null); return; }
  if (row.dataset.previewField !== undefined) {
    const fi = +row.dataset.previewField, part = row.dataset.previewPart;
    const label = part === undefined ? meta.fields[fi].name : `${meta.fields[fi].name} in ${PARTS[+part].name}`;
    if (state.previewLabel !== label) setPreview(maskWhere((i) => col.field[i] === fi && (part === undefined || partOf[i] === +part)), label);
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
