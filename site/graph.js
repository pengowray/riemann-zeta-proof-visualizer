// The import graph of the main directories.
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";
import { SETTINGS, PARTS, $, fmt, pct, bytesFmt, plural, esc, meta, N, col, dirs, leafDir, FAMILIES, moduleFamily, cssVar, state } from "./data.js";
import { maskWhere, setPreview, famColour } from "./map.js";

// ---------------------------------------------------------------- import graph of regions
export async function renderGraph() {
  const [{ default: cytoscape }, { default: fcose }] = await Promise.all([
    import("https://cdn.jsdelivr.net/npm/cytoscape@3.30.2/+esm"),
    import("https://cdn.jsdelivr.net/npm/cytoscape-fcose@2.2.0/+esm"),
  ]);
  cytoscape.use(fcose);
  const SPLIT = new Set(meta.splitRegions); // top-level directories shown one level further down, as in the region tables
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
  // The top level holds the main file (Main.lean) and the statements; it and Supplements are tiny but are where the proof ends, so they are always shown.
  const mainRegion = regionIdx.get("(top level)"), finalRegion = regionIdx.get("Supplements");
  // the top level, Supplements and a small region the top level imports (in the rewrite, New/Main.lean sits alone
  // in the region "New") are where the proof ends: always shown, with every link they have
  const ends = new Set([mainRegion, finalRegion, ...d3.range(R).filter((r) => mainRegion !== undefined && M[mainRegion][r] > 0 && stats[r].modules < 5)]);
  const shown = d3.range(R).filter((r) => stats[r].modules >= 5 || ends.has(r));
  // circles sized by bytes; a small version's directories are small in bytes, so its circles are sized
  // relative to its largest directory instead
  const roomy = shown.length < 60, maxBytes = d3.max(shown, (r) => stats[r].bytes);
  const circleSize = (bytes) => (roomy ? 22 + Math.sqrt(bytes / maxBytes) * 46 : 18 + Math.sqrt(bytes / 1e6) * 7);
  // With separate parts (the rewrite's New and Lib), each part's directories sit inside a box for that part.
  const partOfRegion = (r) => PARTS.findIndex((d) => meta.regions[r].split("/")[0] === d.name);
  const parents = PARTS.length > 1 ? PARTS.map((d, k) => ({ data: { id: "part" + k, label: d.name, size: 1, colour: "#000" }, classes: "part" })) : [];
  const elements = [...parents, ...shown.map((r) => ({ data: { id: "r" + r, r, ...(parents.length && partOfRegion(r) >= 0 ? { parent: "part" + partOfRegion(r) } : {}), main: r === mainRegion ? 1 : 0, label: r === mainRegion ? SETTINGS.main : meta.regions[r].split("/").pop().replace(/([a-z])([A-Z])/g, "$1 $2"), size: circleSize(stats[r].bytes), colour: famColour(d3.maxIndex(stats[r].fam)) } }))];
  // an edge needs at least 20 imports in the original; the rewrite has about 1% as many imports, so fewer will do
  const minEdge = Math.max(3, Math.min(20, Math.round(meta.totals.importEdges / 2000)));
  let drawn = 0, crossTotal = 0;
  for (const a of shown) {
    const out = d3.sum(shown, (b) => (b === a ? 0 : M[a][b]));
    for (const b of shown) {
      if (a === b) continue;
      crossTotal += M[a][b];
      // keep an edge when it carries at least 4% of the importing directory's outside imports
      if ((M[a][b] >= minEdge && M[a][b] >= 0.04 * out) || (M[a][b] > 0 && ends.has(a))) { elements.push({ data: { id: `e${a}_${b}`, source: "r" + a, target: "r" + b, n: M[a][b], w: 0.6 + Math.log10(M[a][b]) * 1.1 } }); drawn += M[a][b]; }
    }
  }
  // the key: each mark drawn the way the graph draws it, then what it stands for
  const icon = (inner) => `<svg viewBox="0 0 36 20" width="36" height="20" aria-hidden="true">${inner}</svg>`;
  $("graph-key").innerHTML = [
    [icon(`<circle cx="9" cy="10" r="4" fill="var(--ink-3)"/><circle cx="25" cy="10" r="8" fill="var(--ink-3)"/>`), "Directory", "sized by bytes, coloured by its most common field"],
    [icon(`<path d="M2 10H28" stroke="var(--ink-3)" stroke-width="2"/><path d="M34 10l-8-5v10z" fill="var(--ink-3)"/>`), "Arrow from A to B", "modules in A import modules in B"],
    [icon(`<circle cx="18" cy="10" r="8" fill="none" stroke="var(--ink)" stroke-width="1.2"/><circle cx="18" cy="10" r="5.5" fill="var(--ink-3)" stroke="var(--ink)" stroke-width="1.2"/>`), esc(SETTINGS.main), "where the final theorems are stated"],
    parents.length && [icon(`<rect x="3" y="2" width="30" height="16" rx="3" fill="var(--paper-3)" stroke="var(--ink-3)"/>`), `Box: ${PARTS.map((d) => esc(d.name)).join(", ")}`, "the directories of that part"],
  ].filter(Boolean).map(([mark, name, what]) => `<li>${mark}<b>${name}</b><span>${what}</span></li>`).join("");
  $("graph-text").textContent = `An arrow is drawn where the imports from A to B are at least 4% of A's imports from other directories. ${pct(drawn / crossTotal)} of the imports between these directories are along the ${fmt(elements.length - shown.length - parents.length)} arrows drawn.`;
  const ink = cssVar("--ink"), ink3 = cssVar("--ink-3");
  const cy = cytoscape({
    container: $("graph"), elements,
    userZoomingEnabled: false, userPanningEnabled: false, boxSelectionEnabled: false, // the page keeps the scroll wheel
    style: [
      { selector: "node", style: { width: "data(size)", height: "data(size)", "background-color": "data(colour)", label: "data(label)", color: ink, "font-family": "STIX Two Text, serif", "font-size": 15, "text-valign": "bottom", "text-margin-y": 4, "text-wrap": "wrap", "text-max-width": 150, "text-background-color": cssVar("--paper-2"), "text-background-opacity": 0.8, "text-background-padding": 1 } },
      { selector: "edge", style: { width: "data(w)", "line-color": ink3, "target-arrow-color": ink3, "target-arrow-shape": "triangle", "arrow-scale": 1.5, "curve-style": "bezier", opacity: 0.45 } },
      { selector: "node[?main]", style: { "border-width": 4, "border-color": ink, "border-style": "double", "font-weight": 600, "font-size": 17, width: 34, height: 34 } },
      { selector: "node.caption", style: { "background-opacity": 0, width: 1, height: 1, "text-valign": "center", color: ink, "text-max-width": 400, events: "no" } },
      { selector: "node.part", style: { shape: "round-rectangle", "background-color": cssVar("--paper-3"), "background-opacity": 0.5, "border-width": 1, "border-color": ink3, "text-valign": "top", "text-halign": "center", "font-weight": 600, padding: 28 } },
      { selector: ".dim", style: { opacity: 0.08 } },
      { selector: "edge.lit", style: { opacity: 1, "line-color": ink, "target-arrow-color": ink } },
    ],
  });
  // label size in graph units for a given zoom, so labels are the same size on screen at any zoom
  const setLabelSize = (z) => cy.style().selector("node").style({ "font-size": 14 / z, "text-max-width": 150 / z, "text-margin-y": 4 / z })
    .selector("node[?main]").style({ "font-size": 16 / z }).update();
  // Directories with no arrow are set out in a grid under the graph, so the layout only has to place the linked ones.
  const strays = cy.nodes().filter((n) => n.degree() === 0 && !n.isParent() && !n.hasClass("part"));
  const linked = cy.elements().not(strays);
  // a small graph (the rewrite) gets more room per circle, so labels and circles do not overlap
  const layoutOptions = { name: "fcose", animate: false, quality: "proof", nodeSeparation: roomy ? 160 : 140, idealEdgeLength: roomy ? 180 : 170, nodeRepulsion: roomy ? 150000 : 60000, padding: 24, nodeDimensionsIncludeLabels: true,
    // inside the New and Lib boxes, a weak pull to the box's centre so its circles spread out
    nestingFactor: 1, gravityCompound: 0.05, gravityRangeCompound: 6 };
  linked.layout({ ...layoutOptions, randomize: true }).run();
  // Labels are drawn at a fixed size on screen, so once the zoom is known they are larger in graph units
  // than the first layout assumed. Set them to that size and lay out again from the same positions, so
  // the layout makes room for the labels as they will be drawn.
  cy.resize();
  if (cy.width() && cy.height()) {
    cy.fit(linked, 24);
    if (cy.zoom() > 0) {
      setLabelSize(cy.zoom());
      linked.layout({ ...layoutOptions, randomize: false }).run();
    }
  }
  if (strays.length) {
    // at most five to a row, so each name has room at the size it is drawn on screen
    const box = linked.boundingBox(), perRow = Math.min(5, strays.length), stepX = box.w / perRow, stepY = 150;
    const top = box.y2 + 120;
    cy.add({ group: "nodes", data: { id: "caption", colour: "#000", size: 1, label: `${plural(strays.length, "directory", "directories")} with no arrow drawn` }, classes: "caption", position: { x: box.x1 + box.w / 2, y: top - 70 } });
    strays.sort((a, b) => b.data("size") - a.data("size")).forEach((n, i) => n.position({ x: box.x1 + ((i % perRow) + 0.5) * stepX, y: top + Math.floor(i / perRow) * stepY }));
  }
  // Fitting the graph to its box scales everything, so label sizes are set afterwards to stay readable on screen.
  const fit = () => {
    cy.resize();
    if (!cy.width() || !cy.height()) return; // not laid out yet; the observers below call again
    cy.fit(undefined, 24);
    const z = cy.zoom();
    if (!(z > 0)) return;
    setLabelSize(z);
  };
  fit();
  $("graph").cy = cy; // lets the graph be inspected from the browser console
  new ResizeObserver(fit).observe($("graph"));
  new IntersectionObserver(fit).observe($("graph"));
  const tipEl = $("graph-tip");
  const showTip = (html, pos) => {
    tipEl.innerHTML = html; tipEl.style.display = "block";
    const box = $("graph").getBoundingClientRect();
    tipEl.style.left = Math.max(0, Math.min(pos.x + 14, box.width - tipEl.offsetWidth)) + "px";
    tipEl.style.top = Math.max(0, Math.min(pos.y + 16, box.height - tipEl.offsetHeight)) + "px";
  };
  cy.on("mouseover", "node[r >= 0]", (e) => {
    const r = e.target.data("r"), st = stats[r];
    cy.elements().addClass("dim"); e.target.closedNeighborhood().removeClass("dim"); e.target.connectedEdges().addClass("lit");
    const top = shown.filter((b) => b !== r && M[r][b]).sort((a, b) => M[r][b] - M[r][a]).slice(0, 3);
    showTip(`<b>${esc(meta.regions[r])}</b><br>${plural(st.modules, "module")} · ${bytesFmt(st.bytes)}<br>${pct(M[r][r] / d3.sum(M[r]))} of its imports are within this directory`
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
export let graphStarted = false;
new IntersectionObserver((entries) => {
  if (entries[0].isIntersecting && !graphStarted) { graphStarted = true; renderGraph().catch((err) => { $("graph-text").textContent = `Couldn't draw the import graph: ${err.message}`; }); }
}, { rootMargin: "400px" }).observe($("graph"));
