# Contract: `auto.md` D.5 token fix (verbatim `<pr-ref>` → `<issue>` substitution)

Structural contract for the two-line edit to `packages/claude-plugin-cockpit/commands/auto.md` that closes the T-S6 diagnosis-round-burn observed on the cockpit v1.5 auto-mode integration smoke test.

## What the edit does

Substitute the argument-kind token in `auto.md`'s D.5 dispatch section from `<pr-ref>` to `<issue>` — the verbatim usage-string token from `generacy cockpit merge --help` (per Q3=A).

## Pre-state

`auto.md` line 171 (§ Dispatch → D.5 → dispatch step 2):

```markdown
2. **Merge**: `generacy cockpit merge <pr-ref>` (squash, branch delete per the CLI's default).
```

## Post-state

`auto.md` line 171 (§ Dispatch → D.5 → dispatch step 2):

```markdown
2. **Merge**: `generacy cockpit merge <issue>` (squash, branch delete per the CLI's default; the CLI resolves the issue's linked PR internally — passing a PR ref directly is a distinct failure mode observed in agency#398).
```

## Rationale

**Why `<issue>` specifically**: The spec's §Assumptions declares `--help` authoritative; per `generacy cockpit merge --help`, the usage line reads:

```
Usage: generacy cockpit merge <issue> [options]

  Squash-merge the PR for <issue> iff it carries completed:validate and its
  checks are all green.
```

The token is `<issue>`, not `<issue-ref>`, not `<pr-ref>`. Q3=A pins exact-string-from-`--help` as the canonical spelling; the playbook copies verbatim.

**Why the parenthetical note is added**: The pre-fix prose is deceptively symmetric — `<pr-ref>` sounds like the right thing to pass to a "merge PR" verb, and the CLI's shared-namespace resolver made the wrong invocation succeed at parse time. Adding "the CLI resolves the issue's linked PR internally — passing a PR ref directly is a distinct failure mode observed in agency#398" documents the trap for the next reader and links the anti-pattern to its finding.

**Why no other D.5 edits**: The § Dispatch table row for D.5 (line 66) is intentionally terse ("`cockpit merge` (no gate — human verdict was implementation-review)") and does NOT name an argument. The § Ledger table row for D.5 (line 604) similarly does NOT reference argument tokens. Only the D.5 prose block's step 2 requires an edit.

## Verifier

**Static grep (positive anchor)** — MUST match:
```bash
grep -n 'generacy cockpit merge <issue>' packages/claude-plugin-cockpit/commands/auto.md
```

**Static grep (negative anchor — smoking gun)** — MUST return zero matches:
```bash
grep -n '<pr-ref>' packages/claude-plugin-cockpit/commands/auto.md
```

**Vitest** (indirect): assertion 398-1 sweeps all `commands/*.md` invocations against `help-snapshots/*.txt` and reports mismatches. Post-fix, the D.5 invocation matches `help-snapshots/merge.txt`'s `<issue>` and does not appear in the mismatch list.

## Failure modes

**The edit ships but `<pr-ref>` remains elsewhere in `auto.md`** (e.g., in an example or comment): the negative-anchor grep fails, catching the incomplete fix. Sweep the whole file for `<pr-ref>` before committing.

**The edit ships but the snapshot file was captured against a different `--help` wording** (e.g., an older CLI version whose usage said `<pr-ref>`): assertion 398-1 fails on the D.5 invocation. Refresh the snapshot (`bash scripts/refresh-help-snapshots.sh`) — the snapshot should say `<issue>` per the CLI's current contract; if it doesn't, the CLI's `--help` has drifted and either the CLI needs to be updated OR the playbook edit is premature (pending a CLI release).

**The parenthetical note drifts from the finding number**: purely cosmetic; the finding number is a link, not a load-bearing anchor. If agency#398 is renumbered or the finding is superseded, update the reference in the same edit.

## Precedent match

This is the same-shape fix as:
- **#394**: pinned unfiltered stream consumption verbatim at the surface where filtering had drifted (invariant §7, `.+` regex).
- **#396**: pinned "any `waiting-for:*` without a dispatch row → D.10" verbatim at the surface where classification had drifted (D.10 trigger prose).
- **#398** (this fix): pins `<issue>` verbatim at the surface where the argument-kind token had drifted (D.5 step 2).

Each fix follows the pattern "correct the prose at the drift surface + backstop with a regression check the model cannot silently regress" — this contract is the *correct-the-prose* half; the drift-audit assertion (398-1) is the *regression check* half.
