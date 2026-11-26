/-
Which definitions of a project are always `True` or always `False`, and what uses them?

Reads compiled `.olean` files directly; nothing is elaborated or re-checked.

    lean --run tools/constprops.lean LIST OUT ROOT...

LIST has one line per compiled project module: `<olean path>\t<module name>` (library modules are not
needed). ROOT names the declarations the proof ends at, such as `riemannHypothesis`.

A definition counts when its value, after any `fun x =>` binders, is the constant `True` or `False`
(for example `def anyGeometry : GeoP := fun _ _ _ => True`). OUT gets one line per such definition:

    D  <name>  <module>  <True|False>  <declarations that mention it>  <modules that mention it>
       <declarations with a hypothesis of that type>  <1 if a ROOT depends on it, else 0>

A declaration "with a hypothesis of that type" takes an argument whose type is the definition, such as
`(Ψ : Sw)`. When the definition is `False`, such a declaration can never be applied.
-/
import Lean
open Lean

def readParts (olean : System.FilePath) : IO (Array (ModuleData × CompactedRegion)) := do
  let mut files := #[olean]
  for ext in ["server", "private"] do
    let f := olean.addExtension ext
    if ← f.pathExists then files := files.push f
  readModuleDataParts files

/-- `True` or `False` when the value is that constant after stripping `fun` binders. -/
def constProp? (e : Expr) : Option Name :=
  match e with
  | .lam _ _ b _ => constProp? b
  | .mdata _ b => constProp? b
  | .const n _ => if n == ``True || n == ``False then some n else none
  | _ => none

/-- Does some argument of this type have one of the given definitions as its type? -/
partial def hasHypothesisOf (targets : Std.HashSet Name) : Expr → Bool
  | .forallE _ t b _ => (match t.getAppFn.constName? with
      | some n => targets.contains n
      | none => false) || hasHypothesisOf targets b
  | .mdata _ b => hasHypothesisOf targets b
  | _ => false

unsafe def run (list out : String) (roots : List Name) : IO Unit := do
  let rows := ((← IO.FS.lines list).filter (· ≠ "")).map (·.splitOn "\t")
  let mut info : Std.HashMap Name ConstantInfo := {}
  let mut moduleOf : Std.HashMap Name String := {}
  let mut found : Array (Name × String × Name) := #[]
  for r in rows do
    for (data, _) in ← readParts r[0]! do
      for c in data.constants do
        info := info.insert c.name c
        moduleOf := moduleOf.insert c.name r[1]!
        if let .defnInfo d := c then
          if let some v := constProp? d.value then found := found.push (c.name, r[1]!, v)
  IO.eprintln s!"{info.size} declarations, {found.size} always True or False"
  -- who mentions each one
  let mut decls : Std.HashMap Name Nat := {}
  let mut modules : Std.HashMap Name (Std.HashSet String) := {}
  let mut hyps : Std.HashMap Name Nat := {}
  for (name, c) in info do
    let used := c.getUsedConstantsAsSet
    for t in found do
      let n := t.1
      if name != n && used.contains n then
        decls := decls.insert n (decls.getD n 0 + 1)
        modules := modules.insert n ((modules.getD n {}).insert (moduleOf.getD name ""))
        if hasHypothesisOf (({} : Std.HashSet Name).insert n) c.type then
          hyps := hyps.insert n (hyps.getD n 0 + 1)
  -- everything the roots depend on, through project declarations
  let mut seen : Std.HashSet Name := {}
  let mut stack := roots.toArray
  while h : stack.size > 0 do
    let n := stack.back
    stack := stack.pop
    if seen.contains n then continue
    seen := seen.insert n
    if let some c := info[n]? then
      for m in c.getUsedConstantsAsSet do
        if info.contains m && !seen.contains m then stack := stack.push m
  IO.eprintln s!"the roots depend on {seen.size} project declarations"
  let h ← IO.FS.Handle.mk out .write
  for (n, m, v) in found do
    h.putStrLn s!"D\t{n}\t{m}\t{v}\t{decls.getD n 0}\t{(modules.getD n {}).size}\t{hyps.getD n 0}\t{if seen.contains n then 1 else 0}"
  h.flush

unsafe def main (args : List String) : IO Unit :=
  match args with
  | list :: out :: roots => run list out (roots.map String.toName)
  | _ => throw <| IO.userError "usage: lean --run constprops.lean LIST OUT ROOT..."
