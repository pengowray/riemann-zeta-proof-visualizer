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
- `data/labels/` holds the topic labels for 746 directories. A language model wrote them from
  digests of each directory's identifiers; `data/labels/PROMPT.md` is the instruction it was given.
- `tools/build_data.py` computes the import graph and writes the compact files the page loads.
