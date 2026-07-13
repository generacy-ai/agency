# Contract: `merge.md` frontmatter + prose fix (`ref` → `issue` rename, `<pr-ref>` → `<issue>` sweep)

Structural contract for the slash-command wrapper edit that closes the same D.5-class drift at the operator-facing `/cockpit:merge` surface (per Q3=A's "fix it in passing" clause).

## What the edit does

Rename the slash-command's positional argument from `ref` to `issue`, rewrite the argument description, sync the step-1 parsing prose, update the step-4 CLI invocation reference, and update the two example lines. All `<pr-ref>` occurrences in `merge.md` are substituted or removed.

## Pre-state (four sites)

### Site 1 — Frontmatter (lines 3-6)

```yaml
arguments:
  - name: ref
    description: "PR reference (owner/repo#N, #N, or bare integer). Optional; falls back to the current branch's open PR."
    required: false
```

### Site 2 — Step 1 parsing prose (lines 24-28)

```markdown
1. **Parse arguments** — Extract:
   - `<pr-ref>` (positional, optional) — if omitted, resolve from the current branch's open PR via `gh pr view --json url,number,headRefName -q .` (from the repository root).
   - `--max-fix-attempts=N` (integer, default `1`; must be `>= 0`). Setting `0` short-circuits the fixer entirely; setting `>= 1` allows up to N fixer passes.

   On usage error, print `Usage: /cockpit:merge [<pr-ref>] [--max-fix-attempts=N]` and exit non-zero.
```

### Site 3 — Step 4 CLI invocation (line 34)

```markdown
4. **Invoke CLI** — Run `generacy cockpit merge <resolved-pr-ref>` via the Bash tool. ...
```

### Site 4 — Examples (lines 85-87)

```markdown
`/cockpit:merge` — resolves the current branch's open PR and attempts merge; on red-checks with one attempt remaining, spawns a fixer, re-checks, and merges if green.

`/cockpit:merge generacy-ai/agency#789 --max-fix-attempts=2` — merges PR #789 with up to two fixer passes.
```

## Post-state (four sites)

### Site 1 — Frontmatter (lines 3-6, renamed)

```yaml
arguments:
  - name: issue
    description: "Issue reference (owner/repo#N, #N, or bare integer). Optional; falls back to the current branch's open PR's linked issue. Passing a PR reference directly is a distinct failure mode — the CLI resolves the linked PR from the issue internally."
    required: false
```

### Site 2 — Step 1 parsing prose (lines 24-28, `<pr-ref>` → `<issue>`)

```markdown
1. **Parse arguments** — Extract:
   - `<issue>` (positional, optional) — an issue reference (owner/repo#N, #N, or bare integer). If omitted, resolve the current branch's open PR via `gh pr view --json url,number,headRefName -q .` and pass its linked issue to the CLI. Passing a PR reference directly is prohibited — the CLI resolves the linked PR from the issue internally (see agency#398).
   - `--max-fix-attempts=N` (integer, default `1`; must be `>= 0`). Setting `0` short-circuits the fixer entirely; setting `>= 1` allows up to N fixer passes.

   On usage error, print `Usage: /cockpit:merge [<issue>] [--max-fix-attempts=N]` and exit non-zero.
```

### Site 3 — Step 4 CLI invocation (line 34, `<resolved-pr-ref>` → `<resolved-issue>`)

```markdown
4. **Invoke CLI** — Run `generacy cockpit merge <resolved-issue>` via the Bash tool. ...
```

### Site 4 — Examples (lines 85-87)

```markdown
`/cockpit:merge` — resolves the current branch's open PR, extracts its linked issue, and attempts merge; on red-checks with one attempt remaining, spawns a fixer, re-checks, and merges if green.

`/cockpit:merge generacy-ai/agency#789 --max-fix-attempts=2` — merges the PR linked to issue #789 with up to two fixer passes. (The bare `#789` is an issue reference, per the CLI's contract; the CLI resolves its linked PR internally.)
```

## Rationale

**Why rename the argument**: The slash-command wrapper's frontmatter is a contract with the operator typing `/cockpit:merge <arg>`. If the frontmatter says `PR reference`, the operator will type a PR reference — reproducing the T-S6 failure at the operator surface. Renaming `ref` to `issue` and rewriting the description makes the correct contract explicit.

**Why include the "distinct failure mode" note in the description**: The frontmatter is the first thing an operator reads when typing `/cockpit:merge` (via slash-command autocomplete). Documenting the anti-pattern inline makes the trap visible before the operator types the wrong thing.

**Why edit all four sites in one commit**: They're the same drift at different surfaces. Editing only the frontmatter would leave `<pr-ref>` in the step-1 prose (an inline invocation the audit would flag); editing only the step-1 prose would leave the frontmatter contract lying. The scope boundary is "all `<pr-ref>` occurrences in `merge.md` are gone post-edit."

## Verifier

**Static grep (positive anchor)** — MUST match:
```bash
grep -n '^  - name: issue$' packages/claude-plugin-cockpit/commands/merge.md
grep -n 'Usage: /cockpit:merge \[<issue>\]' packages/claude-plugin-cockpit/commands/merge.md
grep -n 'generacy cockpit merge <resolved-issue>' packages/claude-plugin-cockpit/commands/merge.md
```

**Static grep (negative anchor)** — MUST return zero matches:
```bash
grep -n '<pr-ref>' packages/claude-plugin-cockpit/commands/merge.md
grep -n 'name: ref$' packages/claude-plugin-cockpit/commands/merge.md
```

**Vitest**: assertion 398-1 sweeps `commands/*.md` invocations. The step-1 and step-4 inline invocations in `merge.md` are picked up by the Q2=B extractor and matched against `help-snapshots/merge.txt`. Post-fix, all `merge.md` invocations use `<issue>` (or a `<resolved-issue>` variant the parser treats as position-0 argument for the `merge` verb) and match the snapshot.

## Note on `<resolved-issue>`

The step-4 invocation uses `<resolved-issue>` rather than `<issue>` because step 1 resolves the operator's input (which may be omitted) into a concrete issue reference before invoking the CLI. This is a *documentation* variable name inside the playbook prose, not a `--help` usage-string token — the parser's job is to match position-0 arg tokens verbatim, but the audit's snapshot-side extraction reads `<issue>` from the usage line. The parser MUST accept `<resolved-issue>` as a match for `<issue>` when the token is a documented-variable-name for the position-0 arg **within the same playbook file**.

Alternatively (and preferred if the parser's rule is strict exact-match Q3=A): rename `<resolved-issue>` to `<issue>` in the step-4 prose to match the snapshot verbatim. This is the simpler solution and is chosen at implement time. If the strict-exact-match parser fails on `<resolved-issue>`, refactor the prose to use `<issue>` throughout step 1-4 (the parenthetical "resolved from the current branch's open PR's linked issue" already documents the resolution semantic; the variable name doesn't need to encode it).

**Decision at implement time**: prefer verbatim `<issue>` in step 4 to keep the audit's exact-match rule uniform. `<resolved-issue>` is a distraction from the audit's clarity.

## Failure modes

**The frontmatter is renamed but the description still says "PR reference"**: the negative-anchor grep on the description string catches it. The description sentence is load-bearing operator-facing prose — it MUST be rewritten to say "Issue reference," not just have the argument name changed.

**A future edit adds a new `<pr-ref>` occurrence elsewhere in `merge.md`**: the negative-anchor grep in CI (added by static-check-suite integration during implement) catches it. The negative anchor is a permanent regression check for this class of drift.

**The two example lines are edited but their trailing `.` gets accidentally converted to `!` or similar during a reformat**: cosmetic; no impact on the audit. The load-bearing content is the invocation string; punctuation drift is out of scope.

## Precedent match

This is the same-shape fix at a different surface as [d5-token-fix.md](./d5-token-fix.md): pin the argument-kind token to `--help`'s verbatim spelling. `auto.md` D.5 is the auto-loop surface; `merge.md` is the slash-command wrapper surface. Both fail at the same class (playbook says one thing, CLI's `--help` says another), both are fixed by the same rule (playbook copies `--help` verbatim).
