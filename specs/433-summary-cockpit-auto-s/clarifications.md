# Clarifications

Questions and answers to clarify the feature specification.

## Batch 1 - 2026-07-17 14:40

### Q1: Probe form choice
**Context**: FR-001 lists two verified-correct candidate probes (`generacy cockpit help doorbell >/dev/null 2>&1` and `generacy cockpit --help 2>&1 | grep -qw doorbell`) and says 'Pick one and pin it'. The two forms have different failure modes: the `help doorbell` form is a pure verb-existence check (cleanest signal, matches how commander.js exposes per-verb help), while the `--help | grep -qw doorbell` form checks the parent's rendered help output for the token (slightly more brittle to help-text formatting changes but doesn't depend on `help <verb>` being wired). The choice determines both the auto.md edit and the exact string the playbook-verification test will pin.
**Question**: Which probe form should be used in auto.md pre-flight (and pinned by playbook-verification.test.ts)?
**Options**:
- A: `generacy cockpit help doorbell >/dev/null 2>&1` — pure verb-existence check via the `help <verb>` router; cleanest signal, but assumes generacy's help router is wired for every verb.
- B: `generacy cockpit --help 2>&1 | grep -qw doorbell` — greps the parent help output for the `doorbell` token; robust to help-router wiring, but slightly brittle to help-text formatting changes.
- C: Something else (please specify) — e.g. a different exit-code-based check, or a combined belt-and-braces form.

**Answer**: **A** — `generacy cockpit help doorbell >/dev/null 2>&1` (pure verb-existence check; verified exit 1 when the verb is absent, 0 when present; avoids option B's help-text brittleness). commander.js auto-wires the `help <verb>` router for every registered command, so option A's stated risk ("assumes the help router is wired for every verb") doesn't apply to a commander-based CLI.

### Q2: Test pin strictness
**Context**: FR-004 requires the playbook-verification test pin to be strict enough that reverting `auto.md` to the broken `--help` form fails the test. There are two obvious ways to achieve that strictness: (a) a positive pin — assert the auto.md pre-flight section contains the exact corrected probe string, which fails if reverted because the string no longer appears; or (b) positive-and-negative — additionally assert the broken form `generacy cockpit doorbell --help` does NOT appear anywhere in auto.md, which is a stronger drift guard (catches partial reverts, half-merges, copy-paste regressions) at the cost of extra assertion surface. This affects how much the test flags future edits and how much the test cross-references the specific commander.js short-circuit bug.
**Question**: Should the drift-audit pin be positive-only (exact string of the corrected probe) or positive + explicit negative (also assert the broken `doorbell --help` form is absent)?
**Options**:
- A: Positive-only — pin the exact corrected probe string via `.toContain(...)`; the pin fails on revert because the corrected string disappears. Simpler, matches the style of most existing pins.
- B: Positive + negative — pin the corrected form AND explicitly assert `generacy cockpit doorbell --help` does not appear anywhere in `auto.md`. Catches partial reverts and puts the commander.js bug in the test's evidence trail.

**Answer**: **B** — positive + negative pin: assert the corrected probe string is present AND that `generacy cockpit doorbell --help` appears nowhere in auto.md. Implementation notes: (1) Fix BOTH occurrences — the probe at auto.md:41 and the doc cross-reference at auto.md:53 (change to `generacy cockpit help doorbell` or `generacy cockpit doorbell`); leaving line 53 as-is would make the negative assertion fail even on a correct fix. (2) Scope the negative match to the exact string `cockpit doorbell --help` — NOT the bare `generacy cockpit doorbell` sensor invocation, which is legitimate and appears many times (already pinned by test 406-3). (3) Confirm the corrected `help doorbell` probe is excluded from / compatible with the existing 398 drift-audit snapshot test ("playbook invocations match `generacy cockpit <verb> --help` snapshot") — the pre-flight probe should not be treated as a snapshot-checked verb invocation since no `doorbell --help` snapshot exists.

### Q3: SC-002 verification cluster
**Context**: SC-002 requires manual verification that the corrected probe still passes on a cluster whose `generacy` build ships the `doorbell` verb, so we can confirm no regression when generacy#970 lands. Assumption line in the spec notes generacy#970 is out of scope here; if no doorbell-shipping build exists yet on any cluster, SC-002 can't be demonstrated at PR-review time, only at the moment generacy#970 rolls out. This affects whether the merge gate treats SC-002 as (a) required-at-review, (b) deferred-to-#970-rollout, or (c) satisfied by a locally-mocked `generacy` shim that exposes a fake `doorbell` verb.
**Question**: How should SC-002 (no regression on doorbell-present clusters) be verified before merging this fix?
**Options**:
- A: Merge only after a doorbell-shipping generacy build is available on some cluster; block on generacy#970 rollout. Highest confidence but couples this fix's merge to generacy#970's timeline.
- B: Verify with a local `generacy` shim / stub that simulates the doorbell verb (e.g. temporary script on PATH), record the shim invocation in the PR description, and merge without waiting for generacy#970. Decouples timelines.
- C: Treat SC-002 as satisfied by static review of the probe form (both candidates were verified in-spec against a real generacy binary); skip runtime verification of the doorbell-present path until generacy#970 rolls out.

**Answer**: **B** — verify the doorbell-present path now with a local `generacy` shim (temporary script on PATH whose `cockpit help doorbell` exits 0); record the shim invocation in the PR description; do not block the merge on the verb landing. **Premise correction**: the doorbell verb is NOT owned by generacy#970 — that PR already merged (as generacy PR #971) and shipped GraphQL rate-limit efficiency work, not the doorbell verb. The missing verb is tracked by **generacy#974** (in progress, not on any cluster build yet). Concrete asks: (1) Verify SC-002 now with the shim; the "absent" path is already verified against the real binary on the snappoll cluster (exit 1). (2) Once generacy#974 lands on a preview cluster, do a one-time real-build confirmation as a follow-up rollout check — not a merge gate. (3) While editing auto.md, correct the stale attribution: pre-flight error message (~L44, "needs a generacy build that ships `generacy cockpit doorbell` (generacy#970)") and "engine-owned per generacy#970" comments (L41, L53) should all point to **generacy#974**.

