// The details drawer for a module or directory, and the hover text for Lean code.
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";
import { renderLean } from "./speech.js";
import { blobUrl, treeUrl, rawUrl, $, fmt, bytesFmt, plural, esc, meta, N, col, dirs, leafDir, state, names, namesReady, pathOf, prefix, dirSum } from "./data.js";
import { secondsFmt, canvas, requestDraw, group, hasLabel, kindNote, moduleFacts, tip, chainTip } from "./map.js";

// ---------------------------------------------------------------- details drawer
export const drawer = $("drawer"), drawerBody = $("drawer-body");
export function closeDrawer() { drawer.hidden = true; state.pinned = -1; requestDraw(); }
$("drawer-close").onclick = closeDrawer;
addEventListener("keydown", (e) => { if (e.key === "Escape" && !drawer.hidden) closeDrawer(); });
addEventListener("pointerdown", (e) => { if (!drawer.hidden && !drawer.contains(e.target) && e.target !== canvas && !e.target.closest("#graph") && !e.target.closest("button.link")) closeDrawer(); });

export function groupBlock(g) {
  return `<p><b>${esc(g.label)}.</b> ${esc(g.gloss)}</p>` + (g.objects.length ? `<p class="note">Named in this directory's label: ${g.objects.map(esc).join(", ")}.</p>` : "");
}
export async function openModule(i) {
  await namesReady;
  state.pinned = i; requestDraw();
  const path = pathOf(i), g = group(i);
  drawer.hidden = false; drawer.scrollTop = 0;
  drawerBody.innerHTML = `<h2>${esc(names[i])}.lean</h2>
    <a class="path" href="${blobUrl(path)}" target="_blank" rel="noopener">${esc(path)}</a>
    <dl>
      <dt>Size</dt><dd>${moduleFacts(i)}</dd>
      <dt>Field</dt><dd>${esc(meta.fields[col.field[i]].name)} (estimate)</dd>
      ${col.kind[i] ? `<dt>Kind</dt><dd>${kindNote[col.kind[i]]}</dd>` : ""}
      <dt>Imported by</dt><dd>${plural(col.indeg[i], "module")} directly, ${fmt(col.dependents[i])} in total</dd>
      ${col.build[i] ? `<dt>Build time</dt><dd>${secondsFmt(col.build[i] / 10)} in one independent rebuild</dd>` : ""}
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
export let moduleIndex = null;
export function moduleLookup(name) {
  if (!moduleIndex) {
    moduleIndex = new Map();
    const prefix = dirs.map((d) => (d.path ? d.path.replaceAll("/", ".") + "." : ""));
    for (let i = 0; i < N; i++) moduleIndex.set(prefix[leafDir[i]] + names[i], i);
  }
  return moduleIndex.get(name);
}
export const DECL_RE = /^[ \t]*(?:@\[[^\]\n]*\]\s*)*(?:(?:private|protected|noncomputable|nonrec|unsafe|partial|scoped|local)\s+)*(theorem|lemma|def|abbrev|instance|structure|class|inductive|example|opaque|axiom)\b[ \t]*([^\s:({\[]*)/gm;
export const SHOWN = 12; // rows shown before "Show all"
export function foldedList(items, noun) {
  if (items.length <= SHOWN) return items.join("");
  return items.slice(0, SHOWN).join("") + `<div class="more" hidden>${items.slice(SHOWN).join("")}</div><button type="button" class="link show-all">Show all ${fmt(items.length)} ${noun}</button>`;
}
/** Declarations and imports of a module, read from its source text. */
export function outlineHtml(text) {
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

export async function openDirectory(d) {
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
export const codetip = $("codetip");
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
