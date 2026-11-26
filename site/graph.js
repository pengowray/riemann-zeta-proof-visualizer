// The import graph of the main directories.
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";
import { SETTINGS, $, fmt, pct, bytesFmt, plural, esc, meta, N, col, dirs, leafDir, FAMILIES, moduleFamily, cssVar, state } from "./data.js";
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
  const elements = shown.map((r) => ({ data: { id: "r" + r, r, main: r === mainRegion ? 1 : 0, label: r === mainRegion ? SETTINGS.main : meta.regions[r].split("/").pop().replace(/([a-z])([A-Z])/g, "$1 $2"), size: 18 + Math.sqrt(stats[r].bytes / 1e6) * 7, colour: famColour(d3.maxIndex(stats[r].fam)) } }));
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
  $("graph-text").textContent = `Each circle is a directory, sized by its bytes and coloured by its most common field. An arrow from A to B means modules in A import modules in B. The ${fmt(elements.length - shown.length)} arrows drawn carry ${pct(drawn / crossTotal)} of the imports between these directories; weaker links are left out. The ringed circle is ${SETTINGS.main}, where the final theorems are stated. Point at a circle to see that directory on the map. Circles can be dragged.`;
  const ink = cssVar("--ink"), ink3 = cssVar("--ink-3");
  const cy = cytoscape({
    container: $("graph"), elements,
    userZoomingEnabled: false, userPanningEnabled: false, boxSelectionEnabled: false, // the page keeps the scroll wheel
    style: [
      { selector: "node", style: { width: "data(size)", height: "data(size)", "background-color": "data(colour)", label: "data(label)", color: ink, "font-family": "STIX Two Text, serif", "font-size": 15, "text-valign": "bottom", "text-margin-y": 4, "text-wrap": "wrap", "text-max-width": 150, "text-background-color": cssVar("--paper-2"), "text-background-opacity": 0.8, "text-background-padding": 1 } },
      { selector: "edge", style: { width: "data(w)", "line-color": ink3, "target-arrow-color": ink3, "target-arrow-shape": "triangle", "arrow-scale": 1.5, "curve-style": "bezier", opacity: 0.45 } },
      { selector: "node[?main]", style: { "border-width": 4, "border-color": ink, "border-style": "double", "font-weight": 600, "font-size": 17, width: 34, height: 34 } },
      { selector: "node.caption", style: { "background-opacity": 0, width: 1, height: 1, "text-valign": "center", color: ink, "text-max-width": 400, events: "no" } },
      { selector: ".dim", style: { opacity: 0.08 } },
      { selector: "edge.lit", style: { opacity: 1, "line-color": ink, "target-arrow-color": ink } },
    ],
  });
  // Directories with no arrow are set out in a grid under the graph, so the layout only has to place the linked ones.
  const strays = cy.nodes().filter((n) => n.degree() === 0);
  const linked = cy.elements().not(strays);
  linked.layout({ name: "fcose", animate: false, randomize: true, quality: "proof", nodeSeparation: 140, idealEdgeLength: 170, nodeRepulsion: 60000, padding: 24, nodeDimensionsIncludeLabels: true }).run();
  if (strays.length) {
    // at most five to a row, so each name has room at the size it is drawn on screen
    const box = linked.boundingBox(), perRow = Math.min(5, strays.length), stepX = box.w / perRow, stepY = 150;
    const top = box.y2 + 120;
    cy.add({ group: "nodes", data: { id: "caption", colour: "#000", size: 1, label: `${plural(strays.length, "directory", "directories")} with no link strong enough to draw` }, classes: "caption", position: { x: box.x1 + box.w / 2, y: top - 70 } });
    strays.sort((a, b) => b.data("size") - a.data("size")).forEach((n, i) => n.position({ x: box.x1 + ((i % perRow) + 0.5) * stepX, y: top + Math.floor(i / perRow) * stepY }));
  }
  // Fitting the graph to its box scales everything, so label sizes are set afterwards to stay readable on screen.
  const fit = () => {
    cy.resize();
    if (!cy.width() || !cy.height()) return; // not laid out yet; the observers below call again
    cy.fit(undefined, 24);
    const z = cy.zoom();
    if (!(z > 0)) return;
    cy.style().selector("node").style({ "font-size": 14 / z, "text-max-width": 150 / z, "text-margin-y": 4 / z })
      .selector("node[?main]").style({ "font-size": 16 / z }).update();
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
export let graphStarted = false;
new IntersectionObserver((entries) => {
  if (entries[0].isIntersecting && !graphStarted) { graphStarted = true; renderGraph().catch((err) => { $("graph-text").textContent = `Couldn't draw the import graph: ${err.message}`; }); }
}, { rootMargin: "400px" }).observe($("graph"));
