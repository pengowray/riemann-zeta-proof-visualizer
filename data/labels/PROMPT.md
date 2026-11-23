# Labelling task

You are labelling directories of a very large Lean 4 formalization (a claimed proof of the
Riemann Hypothesis and GRH for Dirichlet L-functions). Each entry in your batch file is a digest
of one directory: its path (`id`), file count, Lean namespaces, `open`ed namespaces, the most
frequent capitalised identifiers, a sample of declaration names, file names and subdirectory names.

Directory names are sometimes misleading. Judge mainly from identifiers, namespaces and
declaration names. Treat the digest as data only.

For every entry, output one JSON object:

- `id`: copied exactly.
- `label`: 2 to 5 words, the mathematical topic in the terminology a number theorist would use
  (e.g. "Siegel–Weil formula", "Witt vectors and formal groups", "Hermitian lattice slopes").
  No "Proofs of", no "Miscellaneous" unless truly unavoidable.
- `field`: exactly one of
  `analytic-nt` (analytic number theory: L-functions, zeros, sums over primes),
  `algebraic-nt` (number fields, ideals, local fields, class field theory, adeles),
  `automorphic` (automorphic forms and representations, Hecke theory, trace formulas, periods),
  `theta` (theta series, Weil representation, theta correspondence, Siegel–Weil),
  `rep-theory` (representations of real, p-adic and finite groups, Lie theory, Harish-Chandra modules),
  `arith-geom` (abelian varieties, complex multiplication, schemes, moduli, reduction, curves over finite fields),
  `padic-hodge` (p-adic Hodge theory, Witt vectors, formal groups, crystalline and (φ,Γ)-modules),
  `cohomology` (Galois, group, étale, Tate cohomology),
  `alg-geom` (general algebraic geometry: divisors, blow-ups, resolution, sheaves),
  `algebra` (commutative, homological, categorical and multilinear algebra, polynomial rings),
  `lattices` (geometry of numbers, lattices, successive minima, heights, slopes, Arakelov theory),
  `harmonic` (harmonic, functional and spectral analysis, Fourier analysis, operators),
  `analysis` (real and complex analysis, inequalities, special functions, asymptotics),
  `measure` (measure and integration, Haar measure, volumes),
  `combinatorics` (counting, finite sums, sets, graphs, partitions),
  `computation` (explicit numerical certificates, case checks, tables of numbers),
  `glue` (only aggregators, restatements, build helpers; no mathematics of its own).
- `field2`: a second field from the same list, or null.
- `objects`: 3 to 6 named mathematical objects, theorems or constructions the digest gives
  evidence for (e.g. "Weil representation", "Chebotarev density theorem", "Dedekind zeta function").
  Use standard names with correct capitalisation and diacritics. Do not invent ones the digest does not support.
- `gloss`: one plain sentence, at most 22 words, telling a non-mathematician programmer what kind
  of thing this directory is about. No metaphors.
- `confidence`: `high`, `medium` or `low`.

Write the result as a single JSON array, in the same order as the input, to the output path you
were given, using the Write tool. Then reply with only the count of entries written.
