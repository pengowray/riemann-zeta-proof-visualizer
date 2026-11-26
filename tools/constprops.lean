/-
Definitions that are always `True` or always `False`, and the dependency edges needed to see
what uses them. Reads compiled `.olean` files directly; nothing is elaborated or re-checked.
Run through tools/constprops_run.py, which splits the modules into chunks so that no process
holds every compiled file at once.

    lean --run tools/constprops.lean names LIST OUT
        OUT: one line per declaration of the listed modules, `<name>\t<module>`.

    lean --run tools/constprops.lean edges LIST NAMES OUT
        NAMES: every project declaration, one per line (the concatenated `names` output, names only);
        a declaration's id is its line number, from 0.
        OUT.edges: pairs of little-endian UInt32 (declaration id, id of a project declaration it uses).
        OUT.hyps:  the same pairs, for the declarations whose type takes an argument of that type,
                   such as `(Ψ : Sw)`.
        OUT.defs:  `<id>\t<True|False>` for each definition whose value, after any `fun x =>`
                   binders, is the constant `True` or `False`.

LIST has one line per compiled module: `<olean path>\t<module name>`.
-/
import Lean
open Lean

def readParts (olean : System.FilePath) : IO (Array (ModuleData × CompactedRegion)) := do
  let mut files := #[olean]
  for ext in ["server", "private"] do
    let f := olean.addExtension ext
    if ← f.pathExists then files := files.push f
  readModuleDataParts files

def constProp? : Expr → Option Name
  | .lam _ _ b _ => constProp? b
  | .mdata _ b => constProp? b
  | .const n _ => if n == ``True || n == ``False then some n else none
  | _ => none

/-- The head constants of the types of a type's arguments. -/
partial def binderHeads : Expr → Array Name → Array Name
  | .forallE _ t b _, acc => binderHeads b (match t.getAppFn.constName? with
      | some n => acc.push n
      | none => acc)
  | .mdata _ b, acc => binderHeads b acc
  | _, acc => acc

def pushU32 (b : ByteArray) (v : UInt32) : ByteArray :=
  b |>.push v.toUInt8 |>.push (v >>> 8).toUInt8 |>.push (v >>> 16).toUInt8 |>.push (v >>> 24).toUInt8

unsafe def names (list out : String) : IO Unit := do
  let h ← IO.FS.Handle.mk out .write
  for l in (← IO.FS.lines list) do
    let r := l.splitOn "\t"
    if r.length < 2 then continue
    for (data, _) in ← readParts r[0]! do
      for c in data.constants do h.putStrLn s!"{c.name}\t{r[1]!}"
  h.flush

unsafe def edges (list namesFile out : String) : IO Unit := do
  let mut id : Std.HashMap String UInt32 := {}
  let mut k : UInt32 := 0
  for l in (← IO.FS.lines namesFile) do
    id := id.insert l k
    k := k + 1
  let mut e := ByteArray.empty
  let mut hy := ByteArray.empty
  let defs ← IO.FS.Handle.mk (out ++ ".defs") .write
  for l in (← IO.FS.lines list) do
    let r := l.splitOn "\t"
    if r.length < 2 then continue
    for (data, _) in ← readParts r[0]! do
      for c in data.constants do
        let some a := id[c.name.toString]? | continue
        if let .defnInfo d := c then
          if let some v := constProp? d.value then defs.putStrLn s!"{a}\t{v}"
        for n in c.getUsedConstantsAsSet do
          if let some b := id[n.toString]? then
            if a != b then e := pushU32 (pushU32 e a) b
        for n in binderHeads c.type #[] do
          if let some b := id[n.toString]? then hy := pushU32 (pushU32 hy a) b
  defs.flush
  IO.FS.writeBinFile (out ++ ".edges") e
  IO.FS.writeBinFile (out ++ ".hyps") hy

unsafe def main (args : List String) : IO Unit :=
  match args with
  | ["names", list, out] => names list out
  | ["edges", list, namesFile, out] => edges list namesFile out
  | _ => throw <| IO.userError "usage: lean --run constprops.lean names LIST OUT | edges LIST NAMES OUT"
