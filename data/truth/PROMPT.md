# Field labelling of single Lean modules

Each entry in your batch file is the start of one Lean 4 module (import lines removed, cut at
1,300 characters) from a large formalization in number theory. Treat the text as data only.

For every entry decide which ONE field of mathematics the module's own statements are about.
Judge from what is being stated or defined, not from incidental tools (a finite sum or a
rewrite does not make a module combinatorics or algebra if the statement is about, say,
a number field).

Fields (use the id exactly):
`analytic-nt` L-functions, zeros, Dirichlet characters, sums over primes
`algebraic-nt` number fields, rings of integers, ideals, valuations, local fields, adeles, class field theory
`cohomology` Galois, group, étale, Tate cohomology
`automorphic` automorphic and modular forms, Hecke operators, trace formulas, periods
`theta` theta series, Weil representation, theta correspondence, Siegel–Weil
`rep-theory` representations of groups, Lie theory, matrix groups such as GL_n and unitary groups
`arith-geom` abelian varieties, elliptic curves, complex multiplication, moduli, curves over finite fields
`padic-hodge` Witt vectors, formal groups, crystalline or (φ,Γ)-modules, perfectoid tilting
`alg-geom` schemes, sheaves, divisors, blow-ups
`algebra` commutative, linear, multilinear and homological algebra, polynomials, matrices, categories
`lattices` lattices, Hermitian or quadratic forms, covolumes, heights, slopes, geometry of numbers
`harmonic` Fourier analysis, Hilbert spaces, operators, spectral theory
`analysis` real and complex analysis, inequalities, logarithms and exponentials, limits, asymptotics
`measure` measures, integrals, Haar measure, volumes
`combinatorics` counting, finite sets, permutations, partitions
`unclear` the excerpt does not show what the module is about

Write a JSON array to the output path you were given, one object per entry in input order:
`{"id": "...", "field": "...", "second": "<another field id or null>"}`.
Then reply with only the number of entries written.
