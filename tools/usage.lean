/-
Which library modules do the declarations of each project module refer to?

Reads compiled `.olean` files directly; nothing is elaborated or re-checked.

    lean --run tools/usage.lean LIST OUT

LIST has one line per compiled module: `<olean path>\t<module name>\t<1 for a project module, 0 for a library module>`.
OUT gets one line per library module (`L\t<index>\t<name>`), then one line per project module:
`P\t<name>\t<declarations>\t<index>:<count> ...`, where count is how many different declarations
of that library module the project module's declarations mention in their types and values.
-/
import Lean
open Lean

/-- Every part of a compiled module: the exported part, and for files of the module system also
the `.server` and `.private` parts, which hold proofs that other modules cannot see. -/
def readParts (olean : System.FilePath) : IO (Array (ModuleData × CompactedRegion)) := do
  let mut files := #[olean]
  for ext in ["server", "private"] do
    let f := olean.addExtension ext
    if ← f.pathExists then files := files.push f
  readModuleDataParts files

unsafe def run (list out : String) : IO Unit := do
  let lines := (← IO.FS.lines list).filter (· ≠ "")
  let rows := lines.map fun l => (l.splitOn "\t")
  -- pass 1: which library module declares each name
  let mut owner : Std.HashMap Name Nat := {}
  let mut libNames : Array String := #[]
  for r in rows do
    if r[2]! == "0" then
      let idx := libNames.size
      libNames := libNames.push r[1]!
      -- the regions stay mapped: the names in `owner` point into them
      for (data, _) in ← readParts r[0]! do
        for n in data.constNames do owner := owner.insert n idx
        for n in data.extraConstNames do owner := owner.insert n idx
  let h ← IO.FS.Handle.mk out .write
  for name in libNames, i in [0:libNames.size] do
    h.putStrLn s!"L\t{i}\t{name}"
  -- pass 2: what each project module mentions
  let mut done := 0
  for r in rows do
    if r[2]! == "1" then
      let parts ← readParts r[0]!
      let mut used : Std.HashMap Nat (Std.HashSet Name) := {}
      let mut decls := 0
      for (data, _) in parts do
        decls := decls + data.constants.size
        for c in data.constants do
          for n in c.getUsedConstantsAsSet do
            if let some idx := owner[n]? then
              used := used.insert idx ((used.getD idx {}).insert n)
      let cells := used.toArray.map fun (idx, names) => s!"{idx}:{names.size}"
      h.putStrLn s!"P\t{r[1]!}\t{decls}\t{" ".intercalate cells.toList}"
      -- The regions are never freed: freeing one while any value still points into it crashes.
      -- They are memory-mapped files, so the operating system can drop their pages when it needs to.
      done := done + 1
      if done % 5000 == 0 then IO.eprintln s!"{done} project modules"
  h.flush

unsafe def main (args : List String) : IO Unit :=
  match args with
  | [list, out] => run list out
  | _ => throw <| IO.userError "usage: lean --run usage.lean LIST OUT"
