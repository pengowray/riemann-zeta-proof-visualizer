# Riemann Hypothesis Lean proof visualizer

A one-page map of the Lean 4 formalization of the Riemann Hypothesis released by
Levent Alpöge on 20 November 2026 (175,187 modules, 17.4 million lines).

## Run the page

```bash
python3 -m http.server 8737 --directory site
```

Then open http://localhost:8737. The page is static: `site/` can be hosted anywhere.

## Rebuild the data

The data in `site/data/` is built from a local copy of the Lean source
(the `extracted/lean/src` directory of the mirror repository).

```bash
python3 -I tools/scan.py /path/to/extracted/lean/src data/cache
python3 -I tools/build_data.py data/cache data/labels site/data /path/to/extracted/lean/src
```

- `tools/scan.py` reads every `.lean` file once and writes one row per file to `data/cache/` (not committed).
  The search terms and the keyword patterns for fields are in `tools/patterns.json`.
- `data/labels/` holds topic labels for 746 directories, written by a language model from
  digests of each directory's identifiers (`data/labels/PROMPT.md` is its instruction).
- `data/train/` and `data/truth/` hold the field a language model gave to about 1,300 sampled
  modules. The builder trains a naive Bayes classifier on `train` and measures it on `truth`.
- `data/external/` holds per-module build times from an independent rebuild (see its README).
- `tools/build_data.py` computes the import graph and writes the compact files the page loads.

## Page code

`site/app.js` is the entry point. `data.js` loads the data and holds shared state, `map.js`
draws the treemap and sidebar map, `drawer.js` shows a module's details and code,
`charts.js` and `graph.js` draw the sections below the map, `speech.js` reads Lean notation
aloud, `zeta.js` and `bent.js` evaluate the zeta function. Content that is not code lives in
`site/data/steps.json` (proof steps) and `site/data/checks.json` (independent checks).

The Lean archive declares no licence, so this repository stores no Lean source. The page
loads code from a public mirror when a module is opened.
