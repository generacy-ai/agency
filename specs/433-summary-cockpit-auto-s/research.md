# Research: `/cockpit:auto` pre-flight doorbell probe fix

**Feature**: agency#433 — replace the false-positive `--help`-based probe with a pure verb-existence check.
**Branch**: `433-summary-cockpit-auto-s`
**Date**: 2026-07-17
**Status**: Complete

## R1 — Why the current probe false-passes

**Decision**: The probe `generacy cockpit doorbell --help >/dev/null 2>&1` is a false-positive because commander.js processes `--help` **before** validating the subcommand.

**Evidence** (snappoll cluster, `generacy 0.0.0-preview-20260717045830-01bbb03`, doorbell absent):

```
$ generacy cockpit doorbell --help >/dev/null 2>&1;      echo $?   # 0  ← false positive
$ generacy cockpit doorbell christrudelpw/snappoll#1 >/dev/null 2>&1; echo $?   # 1  ← real result
```

The gap between the `--help` probe (exit 0) and the runtime verb (exit 1) is what let the loop proceed to step 2 and then fail at `Monitor.spawn(...)` time with `unknown command 'doorbell'`. Observed live as: pre-flight `passed (doorbell probe)`, then `Doorbell sensor failed to spawn (unknown command 'doorbell')`, then degrade to C4 heartbeat-only (Q3=A/#420 behavior).

**Mechanism**: commander.js's `--help` handler is registered at the top level and short-circuits argument parsing. When commander sees a subcommand it doesn't recognize followed by `--help`, it treats `--help` as a request for the parent's help text and exits 0. This is documented commander behavior, not a bug in the library.

**Alternatives considered**:

- Hardcoding a `generacy` semver floor via `generacy --version` parsing — brittle to preview-build version strings (`0.0.0-preview-<timestamp>-<sha>`) and would require churning the floor on every engine bump.
- Adding a synthetic `generacy cockpit --capabilities` command — requires an engine-side change (out of scope; the fix's whole point is to be self-contained on the skill side).

## R2 — Probe form choice (Q1)

**Decision**: Use `generacy cockpit help doorbell >/dev/null 2>&1` — the pure verb-existence form via commander.js's `help <verb>` router.

**Rationale**:

- commander.js **auto-wires** `help <verb>` for every registered command. Given `help <unknown-verb>`, commander exits 1. Given `help <present-verb>`, commander prints that verb's help and exits 0. This is a clean two-state signal that does not depend on any specific verb being wired.
- Verified on the snappoll cluster: `generacy cockpit help doorbell` → exit 1 (verb absent). Verified locally with a shim that registers a `doorbell` command → exit 0 (verb present).
- Insensitive to help-text formatting: the check is exit-code-based only; no grep, no `--wrap`-column dependency, no risk of a rendering change breaking the check.

**Alternative rejected**: `generacy cockpit --help 2>&1 | grep -qw doorbell`.

- **Why rejected**: (a) brittle to help-text formatting/wrapping — commander may wrap long lists into columns or reflow at terminal width; `grep -qw` is a whole-word match but still vulnerable to hyphenation, alignment padding, or truncation; (b) false-positive risk — if any other command's description ever contained the word "doorbell" (e.g., a future `notify --via doorbell` flag description), the probe would report present incorrectly; (c) commander.js's help output format is not a public API surface, so a cosmetic rewrite in commander could break the check silently.

**Q1 clarification wording**: "commander.js auto-wires the `help <verb>` router for every registered command, so option A's stated risk ('assumes the help router is wired for every verb') doesn't apply to a commander-based CLI." This confirms option A is safe.

## R3 — Test pin strictness (Q2)

**Decision**: Positive + negative pin.

**Positive**: `expect(readFileSync(AUTO_MD_PATH, "utf-8")).toContain("generacy cockpit help doorbell")` — asserts the corrected probe string is present.
**Negative**: `expect(readFileSync(AUTO_MD_PATH, "utf-8")).not.toContain("cockpit doorbell --help")` — asserts the broken form appears nowhere in auto.md.

**Why both are needed**:

- Positive-only would fail on a full revert (the corrected string disappears), but would **not** fail on a partial revert that leaves L53's doc cross-reference as `generacy cockpit doorbell --help` while restoring L41 to the same broken form. A partial revert is the plausible failure mode for a manual find-and-replace during a rebase or a copy-paste from an old branch.
- Positive + negative catches: full reverts (positive fails), partial reverts (negative fails), and half-merges where one occurrence was fixed and the other wasn't (negative fails). It also puts the commander.js short-circuit bug in the test's evidence trail — a future reader of the test can see *why* the negative assertion exists.

**Scoping the negative match**: Scoped to the exact string `cockpit doorbell --help` (with the `--help` flag) — **NOT** the bare string `generacy cockpit doorbell`, which is legitimate and appears many times in auto.md (the sensor invocation `generacy cockpit doorbell <epic-ref>` in step 2, already pinned by 406-3; ledger comments; example lines). Narrowing to `cockpit doorbell --help` avoids collision with those legitimate uses.

**Sibling audit compatibility**: The corrected probe (`generacy cockpit help doorbell`) is compatible with the existing 398 drift-audit snapshot test. 398 sweeps `commands/*.md` for `generacy cockpit <verb>` invocations, extracts the positional angle-bracket tokens, and cross-checks them against `tests/fixtures/help-snapshots/<verb>.txt`. The corrected probe matches verb `help` (not `doorbell`), and `help` is not in the snapshot set covered by 398 (per the 398-1 post-#406 comment: "only covers the `watch` verb"). No new `doorbell.txt` snapshot is added; the probe is not treated as a snapshot-checked verb invocation.

## R4 — `generacy#970` → `generacy#974` attribution correction

**Decision**: All three `generacy#970` references in auto.md are corrected to `generacy#974`.

**Evidence**:

- **generacy#970**: Already merged (as generacy PR #971). Shipped GraphQL rate-limit efficiency work (a `GhWrapper` observability layer counting GraphQL calls per subprocess). Did NOT add the `doorbell` verb. Confirmed via issue title + merged-PR diff review during the #433 clarification round.
- **generacy#974**: In progress. Implements the `generacy cockpit doorbell` verb — the actual missing surface. Not yet landed on any preview cluster.

**Consequence of NOT correcting**: The pre-flight failure message would tell operators to "upgrade the cluster's generacy build" and point them at an already-closed PR (#970) that never provided the verb. Operators would follow the link, find nothing actionable, and be forced to grep the generacy repo for the actual tracking issue. This is a documentation regression that would nullify the whole point of the pre-flight guard's clean message.

**Occurrences to correct** (three, all in auto.md):

1. L41 inline comment: `the surface owned by generacy#970 hasn't landed on this cluster`
2. L44 error message body: `needs a generacy build that ships \`generacy cockpit doorbell\` (generacy#970)`
3. L53 inline comment: `the doorbell subprocess is engine-owned per generacy#970`

## R5 — SC-002 verification approach (Q3)

**Decision**: Verify SC-002 (no regression on doorbell-present clusters) via a local `generacy` shim on PATH whose `cockpit help doorbell` exits 0. Record the shim invocation in the PR description. Do NOT block merge on generacy#974's rollout timeline.

**Shim shape** (concrete example for the PR body):

```bash
cat > /tmp/generacy-shim/generacy <<'EOF'
#!/usr/bin/env bash
if [[ "$1 $2 $3" == "cockpit help doorbell" ]]; then exit 0; fi
exec /usr/local/bin/generacy "$@"
EOF
chmod +x /tmp/generacy-shim/generacy
PATH="/tmp/generacy-shim:$PATH" claude /cockpit:auto <epic-ref>
# expect: pre-flight passes; step 2 spawns doorbell under Monitor
```

**Rationale**:

- The absent-path is already verified against the real binary on snappoll (exit 1). What remains is the present-path.
- Blocking on #974's rollout couples this fix's merge to a cross-repo dependency's timeline (option A rejected).
- Skipping runtime verification entirely (option C — "static review satisfies SC-002") is weaker: the corrected probe string was chosen based on shell-level exit-code behavior, not deep prose review, so a runtime sanity check is cheap and de-risks a "what if commander's exit-code contract for `help <verb>` isn't what we assumed" scenario.
- A shim decouples timelines while preserving reproducibility — the PR reviewer can re-run the shim invocation and confirm the pre-flight passes.

**Follow-up (not merge-gating)**: Once generacy#974 lands on a preview cluster, do a one-time real-build confirmation. This is a rollout check on the operator side, not a gate on this PR.

## R6 — Impact assessment

**Severity**: Cosmetic / robustness. The loop already degrades gracefully to a 5-min heartbeat via C4 (Q3=A/#420 behavior), so nothing is stuck. But:

- The failure surface is confusing: `unknown command 'doorbell'` looks like a version-drift bug in the sensor, when the real story is "your engine build doesn't ship the verb the guard was supposed to detect."
- The pre-flight guard that exists *specifically* to produce a clear operator message never fires — its whole reason for being is defeated by the false positive.
- Operator time-to-diagnosis is worse than the pre-#431 state, because the operator now has to read past the misleading "pre-flight passed" message before finding the real error at step 2.

**Blast radius**: Two edits in `auto.md`, one edit in `playbook-verification.test.ts`. All under `packages/claude-plugin-cockpit/`. No engine changes, no MCP tool changes, no cross-plugin changes.

**Rollback**: Trivial — revert the three commits (or one squash commit). No data migration, no schema, no persistent state.

## Sources

- **snappoll cluster** — real-binary probe evidence for both forms.
- **commander.js README + source** — documented `--help` short-circuit and auto-wired `help <verb>` router behavior.
- **agency#431** — the spec that introduced the pre-flight probe and the doorbell dependency (context for what the fix is restoring).
- **generacy#970** — the already-merged PR whose scope is misattributed in the current auto.md prose (the mistake this PR corrects).
- **generacy#974** — the in-progress PR that owns the `doorbell` verb.
- **agency#433 clarifications.md** — Q1/Q2/Q3 clarification round that pinned the probe form, test-pin strictness, and SC-002 verification approach.

---

*Generated by speckit*
