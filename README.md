# Riemann Hypothesis Lean proof visualizer

A one-page map of the Lean 4 formalization of the Riemann Hypothesis released by
Levent Alpöge on 20 November 2026 (175,187 modules, 17.4 million lines).

## Run the page

```bash
python3 -m http.server 8737 --directory site
```

Then open http://localhost:8737. The page is static: `site/` can be hosted anywhere.

## Rebuild the data

The page shows two versions of the proof, both from
[leanprover-community/riemann-hypothesis](https://github.com/leanprover-community/riemann-hypothesis):
the original release (its `original` branch, data in `site/data/`) and the community cleanup
(its `main` branch, data in `site/data/cleanup/`, shown at `?v=cleanup`).

Put the paths of your two local checkouts in `tools/local.json` (see the top of `tools/update.py`), then:

```bash
python3 tools/update.py cleanup
```

This fetches the newest `main`, scans it and rebuilds `site/data/cleanup/`. It needs the original
release's scan in `data/cache/` (run `python3 tools/update.py original` once), because the field
classifier is trained on modules of the original release. The cleanup changes
many times a day, so run it again whenever the numbers should be brought up to date, then commit
`site/data/`. `python3 tools/update.py original` rebuilds the original release's data.

- `tools/scan.py` reads every `.lean` file once and writes one row per file to `data/cache/` (not committed;
  the cleanup's rows go to `data/cache/cleanup/`).
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
loads code from GitHub when a module is opened.
