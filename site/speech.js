// Reading Lean aloud: names for symbols, Greek letters and common types, and a
// renderer that wraps each token of a Lean source text in a span carrying its reading.

// symbol: [how to say it, what it means in Lean/Mathlib (optional)]
export const SYMBOLS = {
  "∀": ["for all"], "∃": ["there exists"], "→": ["implies", "also the type of functions: A → B is a function from A to B"],
  "↔": ["if and only if"], "∧": ["and"], "∨": ["or"], "¬": ["not"], "≠": ["is not equal to"],
  "≤": ["is at most"], "≥": ["is at least"], "<": ["is less than"], ">": ["is greater than"],
  "=": ["equals"], ":=": ["is defined as"], "=>": ["maps to"], "↦": ["maps to"],
  "∈": ["in"], "∉": ["not in"], "⊆": ["is a subset of"], "∩": ["intersect"], "∪": ["union"], "∅": ["the empty set"],
  "⋃": ["union over"], "⋂": ["intersection over"],
  "ℕ": ["the natural numbers", "0, 1, 2, …"], "ℤ": ["the integers"], "ℚ": ["the rational numbers"],
  "ℝ": ["the real numbers"], "ℂ": ["the complex numbers"], "ℍ": ["H", "the upper half-plane"],
  "𝔸": ["A", "the adele ring"], "𝓞": ["O", "the ring of integers of a number field"], "𝒪": ["O", "a structure sheaf or ring of integers"],
  "𝕜": ["k", "a field, usually ℝ or ℂ"], "𝔹": ["B"], "𝕎": ["W", "the ring of Witt vectors"],
  "𝔭": ["fraktur p", "a prime ideal"], "𝔮": ["fraktur q", "a prime ideal"], "𝔪": ["fraktur m", "a maximal ideal"],
  "𝔞": ["fraktur a", "an ideal"], "𝔟": ["fraktur b", "an ideal"], "𝔤": ["fraktur g", "a Lie algebra"],
  "𝓝": ["neighbourhoods of", "the neighbourhood filter of a point"], "𝓕": ["Fourier transform of"],
  "𝓢": ["Schwartz space"], "𝟙": ["identity", "the identity morphism"],
  "∑": ["the sum over"], "∏": ["the product over"], "∫": ["the integral of"], "∂": ["with respect to", "the measure in an integral, or a partial derivative"],
  "√": ["the square root of"], "∞": ["infinity"], "π": ["pi"],
  "×": ["times", "the product of two types: A × B is the type of pairs"], "·": ["dot", "a placeholder for an argument, or a bullet starting a sub-proof"],
  "•": ["scalar-multiplied with"], "∘": ["composed with"], "⊗": ["tensor"], "⊕": ["direct sum"],
  "⁻": ["inverse"], "¹": ["one"], "⁻¹": ["inverse"], "ˣ": ["units", "the group of invertible elements"],
  "‖": ["norm"], "∣": ["divides"], "⌊": ["floor of"], "⌋": [""], "⌈": ["ceiling of"], "⌉": [""],
  "⟨": ["the tuple"], "⟩": [""], "⟪": ["the inner product of"], "⟫": [""],
  "←": ["right to left", "in rw: rewrite using the equation from right to left; in do-notation: bind"],
  "↑": ["cast", "coercion: view this value in a larger type"], "⇑": ["as a function"], "↥": ["as a type"],
  "⊤": ["top", "the largest element: the whole space, or true"], "⊥": ["bottom", "the smallest element: the zero subspace, or false"],
  "⊓": ["meet", "greatest lower bound; for subspaces, the intersection"], "⊔": ["join", "least upper bound; for subspaces, the sum"],
  "⨆": ["supremum over"], "⨅": ["infimum over"],
  "≃": ["is equivalent to", "a bijection, or an isomorphism when decorated"], "≫": ["then", "composition of morphisms, left to right"],
  "⟶": ["to", "a morphism in a category"], "⧸": ["modulo", "quotient"], "▸": ["rewritten along"], "⊢": ["the goal"],
  "ᵀ": ["transpose"], "ᴴ": ["conjugate transpose"], "ᶜ": ["complement"], "ᗮ": ["orthogonal complement"],
  "⋆": ["star", "the star operation, such as complex conjugation"], "♭": ["flat"], "ᶠ": ["eventually", "used in ∀ᶠ: for all sufficiently large or close values"],
  "⬝": ["dot product"], "ᵥ": ["vector"], "ₗ": ["linear"], "ₐ": ["algebra"], "ₜ": ["term"],
  "‹": [""], "›": [""], "⟦": ["the class of"], "⟧": [""], "⟯": [""], "⁰": ["zero"],
};

const GREEK = {
  α: "alpha", β: "beta", γ: "gamma", δ: "delta", ε: "epsilon", ζ: "zeta", η: "eta", θ: "theta",
  ι: "iota", κ: "kappa", λ: "lambda", μ: "mu", ν: "nu", ξ: "xi", ο: "omicron", π: "pi", ρ: "rho",
  σ: "sigma", τ: "tau", υ: "upsilon", φ: "phi", χ: "chi", ψ: "psi", ω: "omega", ϖ: "varpi", ℓ: "ell",
  Γ: "capital gamma", Δ: "capital delta", Θ: "capital theta", Λ: "capital lambda", Ξ: "capital xi",
  Π: "capital pi", Σ: "capital sigma", Φ: "capital phi", Ψ: "capital psi", Ω: "capital omega",
};
const SUBSCRIPT = { "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4", "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9", "₊": "plus", "ₑ": "e", "ₛ": "s", "ᵢ": "i", "ᵣ": "r", "ᵐ": "m", "ᵁ": "U", "ˢ": "s" };

export const KEYWORDS = {
  theorem: "a statement together with its proof", lemma: "a theorem used as a step towards others",
  def: "a definition", abbrev: "a definition that Lean always unfolds", instance: "registers a structure on a type so Lean finds it automatically",
  structure: "a record type: a bundle of named fields", class: "a structure that Lean fills in automatically", inductive: "a type defined by listing its constructors",
  import: "makes another module's declarations available", open: "lets the names in a namespace be written without their prefix",
  namespace: "prefixes the following names", section: "limits the scope of variables", variable: "declares arguments shared by the following declarations",
  noncomputable: "the definition uses the axiom of choice or real numbers, so it cannot be run as a program",
  by: "starts a tactic proof: a list of proof steps", fun: "an anonymous function", Prop: "the type of statements that can be true or false",
  Type: "the type of types", set_option: "changes a Lean setting", maxHeartbeats: "the amount of work Lean may spend on one declaration before giving up",
  exact: "tactic: finishes the goal with this term", simp: "tactic: simplifies using rewrite rules", rw: "tactic: rewrites the goal using an equation",
  have: "states and proves an intermediate fact", obtain: "tactic: takes an existence statement or pair apart", refine: "tactic: gives the proof with holes (?_) left as new goals",
  intro: "tactic: assume the hypothesis, or fix an arbitrary element", apply: "tactic: reduce the goal to the hypotheses of this lemma",
  omega: "tactic: decides linear arithmetic over ℕ and ℤ", linarith: "tactic: proves linear inequalities", nlinarith: "tactic: proves some non-linear inequalities",
  norm_num: "tactic: evaluates numerical expressions", ring: "tactic: proves identities in commutative rings", positivity: "tactic: proves that an expression is positive or non-negative",
  decide: "tactic: proves the statement by computing its truth value", rfl: "true by unfolding definitions", calc: "a chain of equalities or inequalities",
  induction: "tactic: proof by induction", rcases: "tactic: takes a hypothesis apart", unfold: "tactic: replaces a name by its definition",
  show: "restates the goal in an equivalent form", classical: "allows case distinctions on undecidable statements", first: "tries each alternative in turn and uses the first that works",
  field_simp: "tactic: clears denominators", gcongr: "tactic: proves an inequality by comparing matching parts", funext: "tactic: two functions are equal if they agree at every argument",
  ext: "tactic: two objects are equal if their components agree", by_cases: "tactic: split into the case where a statement holds and the case where it fails",
  by_contra: "tactic: proof by contradiction", constructor: "tactic: split a goal such as A ∧ B into its parts", simpa: "tactic: simplify, then close the goal with the given term",
  push_cast: "tactic: moves casts such as ℕ → ℝ towards the leaves", exact_mod_cast: "tactic: exact, after normalising casts", congr: "tactic: reduce an equality f a = f b to a = b",
  cases: "tactic: split into one case per way the value could have been built", trivial: "tactic: closes goals that are true by definition or already assumed",
  convert: "tactic: use a term whose statement nearly matches the goal, leaving the differences as new goals", infer_instance: "tactic: let Lean find the required structure automatically",
  fun_prop: "tactic: proves that a function is continuous, differentiable or measurable from its parts", ring_nf: "tactic: rewrites both sides into a normal form for commutative rings",
  norm_cast: "tactic: simplifies casts between number types", tauto: "tactic: proves statements that hold by propositional logic alone", use: "tactic: supplies the witness for a there-exists goal",
  aesop: "tactic: general proof search using registered rules", grind: "tactic: automated reasoning that combines rewriting, case splits and arithmetic",
  continuity: "tactic: proves that a function is continuous", measurability: "tactic: proves that a function or set is measurable",
};

const TYPE_GLOSSES = [
  [/^ℂ$/, "a complex number"], [/^ℝ$/, "a real number"], [/^ℕ$/, "a natural number"], [/^ℤ$/, "an integer"], [/^ℚ$/, "a rational number"],
  [/^Type\b/, "a type (think: a set)"], [/^Prop$/, "a statement"],
  [/^DirichletCharacter\s+(\S+)\s+(\S+)/, (m) => `a Dirichlet character modulo ${m[2]} with values in ${m[1]}`],
  [/^Matrix\s+\(Fin (\S+)\)\s+\(Fin (\S+)\)\s+(\S+)/, (m) => `a ${m[1]} × ${m[2]} matrix with entries in ${m[3]}`],
  [/^Matrix\b/, "a matrix"], [/^Fin\s+(.+)/, (m) => `a natural number less than ${m[1]}`],
  [/^Finset\s+(.+)/, (m) => `a finite set of elements of ${m[1]}`], [/^Set\s+(.+)/, (m) => `a set of elements of ${m[1]}`],
  [/^Ideal\s+(.+)/, (m) => `an ideal of ${m[1]}`], [/^Submodule\b/, "a submodule (a linear subspace)"], [/^Subgroup\s+(.+)/, (m) => `a subgroup of ${m[1]}`],
  [/^(Polynomial|MvPolynomial)\b/, "a polynomial"], [/^Measure\b|MeasureTheory\.Measure\b/, "a measure"],
  [/^Fact\s+(.+)/, (m) => `the standing assumption that ${m[1]}`], [/^NeZero\s+(.+)/, (m) => `the assumption that ${m[1]} is not zero`],
  [/^(Comm)?Ring\s+(.+)/, (m) => `${m[2]} is a ${m[1] ? "commutative " : ""}ring`], [/^Field\s+(.+)/, (m) => `${m[1]} is a field`],
  [/^NumberField\s+(.+)/, (m) => `${m[1]} is a number field: a finite extension of ℚ`], [/^Fintype\s+(.+)/, (m) => `${m[1]} has finitely many elements`],
  [/^Module\s+(\S+)\s+(.+)/, (m) => `${m[2]} is a module over ${m[1]} (a vector space when ${m[1]} is a field)`],
  [/^Algebra\s+(\S+)\s+(.+)/, (m) => `${m[2]} is an algebra over ${m[1]}`],
  [/→/, "a function"],
];

function glossType(type) {
  const t = type.trim();
  for (const [re, gloss] of TYPE_GLOSSES) {
    const m = t.match(re);
    if (m) return typeof gloss === "function" ? gloss(m) : gloss;
  }
  return "";
}

/** How to pronounce one identifier: Greek letters and subscripts are spelled out. */
export function sayIdent(word) {
  let out = "";
  for (const ch of word) {
    if (GREEK[ch]) out += ` ${GREEK[ch]} `;
    else if (SUBSCRIPT[ch]) out += ` sub ${SUBSCRIPT[ch]} `;
    else if (ch === "'") out += " prime ";
    else if (ch === "." || ch === "_") out += " ";
    else out += ch;
  }
  return out.replace(/\s+/g, " ").trim();
}

const TOKEN_RE = /(--.*$)|(:=|=>|⁻¹|[A-Za-z_Ͱ-Ͽἀ-῿𝔸𝓞𝒪𝕜𝔹𝕎𝔭𝔮𝔪𝔞𝔟𝔤ℓϖ][\w'!?.Ͱ-Ͽ₀-₉ₐ-ₜᵢᵣ]*|\d+(?:\.\d+)?|\s+|[^\sA-Za-z0-9_])/gmu;
const BINDER_RES = [
  /[({\[⦃]\s*((?:[^\s:(){}\[\]⦃⦄,]+\s+)*[^\s:(){}\[\]⦃⦄,]+)\s*:\s*([^(){}\[\]⦃⦄]*(?:\([^()]*\)[^(){}\[\]⦃⦄]*)*)[)}\]⦄]/gu,
  /[∀∃λ]\s*((?:[^\s:(){}\[\],]+\s+)*?[^\s:(){}\[\],]+)\s*:\s*([^,]+?),/gu,
  /\bfun\s+((?:[^\s:(){}\[\],]+\s+)*?[^\s:(){}\[\],]+)\s*:\s*([^=]+?)=>/gu,
];

/** Find binders such as `(s : ℂ)` and `∀ x : ℝ,` and return [{name, type, pos}]. */
function findBinders(text) {
  const found = [];
  for (const re of BINDER_RES) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      const type = m[2].trim().replace(/\s+/g, " ");
      if (!type || type.length > 160) continue;
      for (const name of m[1].trim().split(/\s+/)) found.push({ name, type, pos: m.index });
    }
  }
  return found.sort((a, b) => a.pos - b.pos);
}

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

/**
 * Render Lean source as HTML. Each line is a <span class="ln" data-say="…"> holding the
 * line read aloud; tokens with a known reading are <span class="tk" data-tip="…">.
 */
export function renderLean(text) {
  const binders = findBinders(text);
  let offset = 0;
  const lines = text.split("\n");
  const html = [];
  for (const line of lines) {
    let out = "";
    const said = [];
    TOKEN_RE.lastIndex = 0;
    let m;
    while ((m = TOKEN_RE.exec(line))) {
      const tok = m[0];
      const pos = offset + m.index;
      if (/^\s+$/.test(tok)) { out += tok; continue; }
      let tip = "", say = tok, cls = "";
      if (m[1]) { cls = "cm"; say = ""; }
      else if (SYMBOLS[tok]) {
        const [name, meaning] = SYMBOLS[tok];
        say = name; cls = "sym";
        tip = name ? `${tok}  “${name}”${meaning ? ". " + meaning : ""}` : "";
      } else if (KEYWORDS[tok]) { cls = "kw"; tip = `${tok}: ${KEYWORDS[tok]}`; }
      else if (/^[\p{L}_𝔸𝓞𝒪𝕜𝔹𝕎𝔭𝔮𝔪𝔞𝔟𝔤]/u.test(tok)) {
        say = sayIdent(tok);
        let binder = null;
        for (const b of binders) {
          if (b.pos > pos) break;
          if (b.name === tok) binder = b;
        }
        const parts = [];
        if (say !== tok) parts.push(`${tok}  “${say}”`);
        if (binder) {
          const gloss = glossType(binder.type);
          parts.push(`${tok} : ${binder.type}${gloss ? "  (" + gloss + ")" : ""}`);
          cls = "var";
        } else if (tok.length === 1 && GREEK[tok]) cls = "var";
        if (SYMBOLS[tok]?.[1]) parts.push(SYMBOLS[tok][1]);
        tip = parts.join("\n");
      } else if (tok === "(" || tok === ")" || tok === "," || tok === "[" || tok === "]" || tok === "{" || tok === "}") say = tok === "," ? "," : "";
      else if (tok === ":") say = "of type";
      else if (tok === "/") say = "over";
      else if (tok === "*") say = "times";
      else if (tok === "+") say = "plus";
      else if (tok === "-") say = "minus";
      else if (tok === "^") say = "to the power";
      else if (tok === "|") say = "or else";
      if (say) said.push(say);
      const esc = escapeHtml(tok);
      out += tip || cls ? `<span class="tk ${cls}"${tip ? ` data-tip="${escapeHtml(tip)}"` : ""}>${esc}</span>` : esc;
    }
    const spoken = said.join(" ").replace(/\s+,/g, ",").replace(/\s+/g, " ").trim();
    html.push(`<span class="ln" data-say="${escapeHtml(spoken)}">${out || " "}</span>`);
    offset += line.length + 1;
  }
  return html.join("");
}
