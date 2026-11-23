// The import graph of the main directories.
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";
import { $, fmt, pct, bytesFmt, plural, esc, meta, N, col, dirs, leafDir, FAMILIES, moduleFamily, cssVar, state } from "./data.js";
import { layout, draw, maskWhere, setPreview, tip, famColour } from "./map.js";

// ---------------------------------------------------------------- import graph of regions
export async function renderGraph() {
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
export let graphStarted = false;
new IntersectionObserver((entries) => {
  if (entries[0].isIntersecting && !graphStarted) { graphStarted = true; renderGraph().catch((err) => { $("graph-text").textContent = `Couldn't draw the import graph: ${err.message}`; }); }
}, { rootMargin: "400px" }).observe($("graph"));
