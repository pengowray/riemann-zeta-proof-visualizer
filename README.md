# Riemann Hypothesis Lean proof visualizer

A one-page map of the Lean 4 formalization of the Riemann Hypothesis released by
Levent Alpöge on 20 November 2026 (175,187 modules, 17.4 million lines).

## Run the page

```bash
python3 -m http.server 8737 --directory site
```

Then open http://localhost:8737. The page is static: `site/` can be hosted anywhere.

## Rebuild the data

The page shows these versions of the proof; the hidden ones open only from their link. Each has its own data folder and is picked with `?v=<id>`:

| Version | id | Source | Data |
|---|---|---|---|
| Original release | `original` | `original` branch of [leanprover-community/riemann-hypothesis](https://github.com/leanprover-community/riemann-hypothesis) | `site/data/` |
| Original, community cleanup | `cleanup` | its `alpoge` branch, where the cleanup of the original stopped on 25 November 2026 | `site/data/cleanup/` |
| Shorter rewrite, readable edition | `grh` | `grh/` in [lsernau/grh-lean](https://github.com/lsernau/grh-lean) | `site/data/grh/` |
| Shorter rewrite, compact edition | `compact` | `grh-compact/` in lsernau/grh-lean | `site/data/compact/` |
| New formalization by jamesyc, unfinished (hidden from the version lists) | `jamesyc` | [jamesyc/riemann-hypothesis](https://github.com/jamesyc/riemann-hypothesis), written with GPT-6.2 Sol; `holes.md` lists the steps left unproved | `site/data/jamesyc/` |
| Shorter rewrite, community cleanup (hidden from the version lists) | `main` | `main` branch of leanprover-community/riemann-hypothesis, a copy of the readable edition that the community is cleaning up | `site/data/main/` |

The versions and their settings (file names, optional sections) are listed in `VERSIONS` at the top
of `tools/update.py`, which copies the settings into `site/data/versions.json` for the page. Put the paths of your local
checkouts in `tools/local.json` (see the top of `tools/update.py`), then:

```bash
python3 tools/update.py grh
```

This fetches lsernau/grh-lean, scans the readable edition and rebuilds `site/data/grh/`. It needs the original
release's scan in `data/cache/` (run `python3 tools/update.py original` once), because the field
classifier is trained on modules of the original release. The community's `main` changes many times a day;
run `python3 tools/update.py main` to bring that hidden version up to date, then commit `site/data/`. The other ids
rebuild the other versions, and `all` rebuilds every one.

The shorter rewrite has its own directory names, so its directory labels are in `data/labels-grh/`
(the same as `data/labels-main/`) and `data/labels-compact/`. A language model wrote them from the rewrite's `GUIDE.md`, `CONTENTS.md`
and the head of each module, following `data/labels/PROMPT.md`. `data/labels-jamesyc/` labels that
version's two directories.

The "What the modules use from Mathlib" table comes from Lean's compiled files, which the scan
does not read. It has been measured for the cleanup of the original, at an earlier commit of the
`alpoge` branch when it had 59,806 modules, and for `main` at `388ec43`. To refresh it after an update, install Lean with `elan`, then in the cleanup clone run
`lake exe cache get` (about 80 GB) and:

```bash
python3 tools/usage_run.py /path/to/clone data/cache/cleanup/usage
```

and run `python3 tools/update.py cleanup` again. For another version, use its own cache folder,
such as `data/cache/main/usage`. `usage_run.py` records the commit it measured, and the page says so
when that is not the commit shown. When a clone holds compiled files that match its commit
(`lake build --no-build` succeeds), `update.py` records their size for the printed-pages table.

Definitions that are always `True` or always `False` (such as `def anyGeometry : GeoP := fun _ _ _ => True`)
are listed in their own section. `update.py` estimates them from the text for every version
(`tools/constprops_text.py`). When a clone holds compiled files that match its commit, it also reads
them exactly with `tools/constprops_run.py` (which runs `tools/constprops.lean` on chunks of modules,
each in its own process), at the lowest priority and with memory capped at 10 GB; that also says
whether the five theorems depend on each definition. `--no-compiled-check` skips it. The original
release's compiled files come from a clone of
[homeowmorphism/riemann-hypothesis-original](https://github.com/homeowmorphism/riemann-hypothesis-original)
(the same source plus `Challenge.lean`), set as `original_compiled_clone` in `tools/local.json`;
its `lake exe cache get` needs about 105 GB. `tools/usage.lean` reads which library
declarations each module's declarations mention; it took about six minutes for 59,806 modules.

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
