# Data Model: Improvement spec from the cockpit v1.5 auto-mode smoke test

**Purpose**: Define the types, validation rules, and pre/post structural changes for the `auto.md` prose edits, the diagnosis-subagent verdict schema, and the D.9d dispatch-class classifier. Grounded in the plan's Structure section and the spec's Functional Requirements.

---

## Types

### `Verdict` — diagnosis subagent return schema

The D.7 and D.11 dispatch rows call a diagnosis subagent (`subagent_type: "general-purpose"`) whose contract is a single JSON return value. On the happy path, the return is a `Verdict`; on unrecoverable error, the return is `{"error": "<description>"}`.

```typescript
type Verdict = {
  root_cause: string;      // 1-3 sentence explanation of what caused the failure
  evidence: string;        // Verbatim snippet(s) from the failure bundle supporting root_cause
  recommended_action: RecommendedAction;
  confidence: Confidence;
};

type Confidence = "low" | "medium" | "high";

type RecommendedAction =
  | D7RecommendedAction
  | D11RecommendedAction;

type D7RecommendedAction =
  | "Requeue (cockpit resume)"
  | "Skip (session-local mute)"
  | "Stop (exit auto)";

type D11RecommendedAction =
  | "I've resolved it — advance the gate"
  | "Skip (session-local mute)"
  | "Stop (exit auto)";

type VerdictError = { error: string };

// The subagent returns one of:
type SubagentReturn = Verdict | VerdictError;
```

### Validation rules for `Verdict`

- `root_cause` and `evidence` are non-empty strings.
- `recommended_action` is one of the exact option strings enumerated for the target gate — checked against `D7RecommendedAction` for D.7 dispatches and `D11RecommendedAction` for D.11 dispatches. **The option-string set is verbatim; the parser does not tolerate whitespace variation, capitalization variation, or paraphrase.** (Whitespace is normalized only for the `AskUserQuestion` option list — see the plan's constraint about the option set being unchanged for the operator.)
- `confidence` is one of `"low"`, `"medium"`, `"high"`. **Numeric confidence values are rejected** (Q4=B was rejected — LLM judges have no calibration data for numeric confidence).
- The `error` shape is mutually exclusive with the `Verdict` shape — a return with any of the four Verdict fields alongside an `error` field fails validation.

### Semantic mapping for `confidence`

- `"high"` — subagent believes the recommended action will resolve the failure. Evidence is direct (e.g., "the CI log names the exact test that failed and the fix is a one-line change already in the branch"). Operator can typically accept the recommendation without a second look.
- `"medium"` — plausible but uncertain. Evidence is indirect or the failure has multiple viable interpretations. Operator should read `root_cause` before choosing.
- `"low"` — a guess. Evidence is thin or the failure is unusual. Operator should verify — often means the subagent hit an edge case the failure bundle didn't cover well; a bundle-completeness fix (server-side in generacy) may be the follow-up.

### `parseVerdict(input: string, gateType: "D.7" | "D.11") → Verdict | ValidationError`

Reference validator, inline in the test file (matching the `dispatchClassifier` at `tests/playbook-verification.test.ts:187`). Not exported as a library module — small enough to live inline.

```typescript
type ValidationError = { kind: "validation-error"; reason: string };

function parseVerdict(
  input: string,
  gateType: "D.7" | "D.11",
): Verdict | ValidationError {
  let raw: unknown;
  try {
    raw = JSON.parse(input);
  } catch (e) {
    return { kind: "validation-error", reason: `not valid JSON: ${(e as Error).message}` };
  }

  if (typeof raw !== "object" || raw === null) {
    return { kind: "validation-error", reason: "expected a JSON object" };
  }
  const obj = raw as Record<string, unknown>;

  // The error shape short-circuits.
  if ("error" in obj) {
    // Not a validation error; the subagent explicitly returned an error shape.
    // The caller decides how to handle this (typically: ledger line + skip).
    return { kind: "validation-error", reason: `subagent returned error: ${String(obj.error)}` };
  }

  for (const field of ["root_cause", "evidence", "recommended_action", "confidence"]) {
    if (typeof obj[field] !== "string" || (obj[field] as string).length === 0) {
      return { kind: "validation-error", reason: `missing or non-string field: ${field}` };
    }
  }

  const confidence = obj.confidence as string;
  if (confidence !== "low" && confidence !== "medium" && confidence !== "high") {
    return {
      kind: "validation-error",
      reason: `confidence must be one of "low"|"medium"|"high"; got ${JSON.stringify(confidence)}`,
    };
  }

  const options = gateType === "D.7"
    ? ["Requeue (cockpit resume)", "Skip (session-local mute)", "Stop (exit auto)"] as const
    : ["I've resolved it — advance the gate", "Skip (session-local mute)", "Stop (exit auto)"] as const;
  const action = obj.recommended_action as string;
  if (!options.includes(action as never)) {
    return {
      kind: "validation-error",
      reason: `recommended_action for ${gateType} must be one of ${JSON.stringify(options)}; got ${JSON.stringify(action)}`,
    };
  }

  return {
    root_cause: obj.root_cause as string,
    evidence: obj.evidence as string,
    recommended_action: action as RecommendedAction,
    confidence: confidence as Confidence,
  };
}
```

---

### `DispatchClass` — dispatch classifier output

The reference `dispatchClassifier` in the test file (extended from the #396 implementation) routes a transition-class token to a dispatch class. For #403 the D.9d prefix-match branch is added; the D.10 catch-all is preserved.

```typescript
type DispatchClass =
  | { kind: "D.1"; token: string }
  | { kind: "D.2"; token: string; artifact: "spec" | "clarification" | "plan" | "tasks" }
  | { kind: "D.3"; token: string }
  | { kind: "D.4"; token: string }
  | { kind: "D.5"; token: string }
  | { kind: "D.6"; token: string }
  | { kind: "D.7"; token: string }
  | { kind: "D.8"; token: string }
  | { kind: "D.9"; token: string; subrow: "" | "a" | "b" | "c" | "d" }  // D.9, D.9a, D.9b, D.9c, D.9d
  | { kind: "D.10"; token: string }
  | { kind: "D.11"; token: string };
```

### Dispatch classifier logic (relevant edits for #403)

The full classifier already exists inline at `tests/playbook-verification.test.ts:187` (added by #396). For #403 the change is one new branch — the `phase:` prefix rule — inserted before the D.10 catch-all:

```typescript
function dispatchClassifier(issue: FixtureIssue, ctx: DispatchContext): void {
  const token = issue.transition_class;

  // Named ledger-only rows (D.9 family, enumerated).
  if (token === "waiting-for:address-pr-feedback") { /* D.9 */ ledgerLineOnly(issue, ctx, "D.9"); return; }
  if (token === "waiting-for:pr-feedback")         { /* D.9a */ ledgerLineOnly(issue, ctx, "D.9a"); return; }
  if (token === "waiting-for:children-complete")   { /* D.9b */ ledgerLineOnly(issue, ctx, "D.9b"); return; }
  if (token === "waiting-for:dependencies")        { /* D.9c */ ledgerLineOnly(issue, ctx, "D.9c"); return; }

  // NEW — D.9d: prefix-match on `phase:` — added by #403.
  if (token.startsWith("phase:")) {
    ledgerLineOnly(issue, ctx, "D.9d");
    return;
  }

  // D.11 (specific `waiting-for:merge-conflicts` — from #396).
  if (token === "waiting-for:merge-conflicts") { d11Dispatch(issue, ctx); return; }

  // Actionable named rows would live here (D.1–D.8) — omitted for brevity;
  // the reference classifier is exercised only against ledger-only / D.10 / D.11
  // for the 403 assertions.

  // D.10 catch-all — tightened trigger (from #396) routes any `waiting-for:*`
  // without a matching row to the unrecognized-state gate. Note: `phase:*` is
  // now matched above, so a novel `phase:someday` never reaches D.10.
  if (token.startsWith("waiting-for:") && !NAMED_DISPATCH_TOKENS.has(token)) {
    d10Dispatch(issue, ctx);
    return;
  }
  // Any other unrecognized token — deliberately falls through here in the
  // reference (real classifier would route to D.10 as well).
}
```

The invariant load-bearing for FR-005 is: any token beginning with `phase:` routes to D.9d, not D.10. The 403-3 assertion exercises this with `phase:plan` (existing enumerated phase) and `phase:someday` (never-enumerated novel phase) fixtures.

---

## Status table anchor

For the 403-7 assertion — "full epic status table appears only at permitted surfaces" — a well-defined anchor substring lets a section-grep audit distinguish "this section has a status table" from "this section doesn't". The anchor must be:

1. Unique to the full epic status table (not other tables — e.g., findings-summary tables from G.2, dispatch tables from § Dispatch).
2. Stable — a rewrite that reformats the table but preserves the anchor keeps the audit green.
3. Grep-friendly — a single-line substring that doesn't require multiline regex.

**Anchor**: `| Issue | Phase | State |`  — the header row of the full epic status table (columns: issue-ref, current phase, current transition class). This is the substring the 403-7 assertion greps for; any occurrence outside the four permitted surfaces is a failure.

Rationale for the anchor choice:

- The header row is the top of the table and appears once per table emission; no false positives from body rows.
- The three columns are semantically stable (a full status table without any of them wouldn't be a full status table); a rewrite that renames columns would be a semantic change worth catching.
- No other table in `auto.md` uses this exact column triple (the dispatch table uses `| # | Event | Action shape |`; the findings table uses `| # | File:line | Finding | Blocking? |`; the ledger vocabulary table uses `| Dispatch row | \`<action>\` | \`<outcome>\` (examples) |`).

The permitted surfaces where the anchor may appear:

1. **§ Dispatch D.8 phase-complete → G.5 presentation** — the "Phase P<current> complete on <epic-ref>" block, immediately preceded by a full status table showing the epic's current state before the queue confirmation.
2. **Step 6 / § Ledger L.6 epic-complete exit** — the run-summary paragraph, immediately preceded by a full status table showing the final state.
3. **§ Gate contract G.4 escalation gates (a/b/c/d)** — every escalation gate presentation includes a full status table for operator orientation before the decision.
4. **Step 3 startup-sweep summary** — the sweep ends with exactly one full status table (session-start orientation).

The 403-7 assertion enumerates these four surfaces and asserts the anchor appears only in sections whose heading matches one of them.

---

## Pre/post playbook surface changes

For each section of `auto.md` that the plan edits, this table shows the pre-state and post-state. Line numbers refer to the current `auto.md` on branch `403-improvement-spec-from-cockpit` at the plan-authoring commit.

### § Dispatch table (top of § Dispatch, around lines 60-75)

| Pre | Post |
|-----|------|
| Six D.9-family rows: D.9 (`waiting-for:address-pr-feedback`), D.9a (`waiting-for:pr-feedback`), D.9b (`waiting-for:children-complete`), D.9c (`waiting-for:dependencies`), plus D.10 and D.11. | Seven D.9-family rows: D.9, D.9a, D.9b, D.9c, **NEW D.9d (`phase:*`)**, plus D.10 and D.11. D.9d row: `\| D.9d \| \`phase:*\` (prefix-match) \| Ledger line only (engine-owned phase transition) \|` |

### § Dispatch D.9 / D.9a / D.9b / D.9c subheadings (around lines 271-301)

| Pre | Post |
|-----|------|
| Each subheading's Dispatch paragraph reads: `**Ledger line only.** No CLI verb, no subagent, no gate — server-side-owned.` | Each subheading's Dispatch paragraph reads: `**Ledger line only.** No CLI verb (in particular, no \`generacy cockpit status --json\` re-check), no subagent, no gate, no status table, no prose recap — server-side-owned.` |

Rationale: the same-shape edit across all four rows means the audit grep (`no status table, no prose recap`) matches all four; the shared no-op contract is visible at every subheading.

### § Dispatch D.9d — new subheading (inserted between D.9c and D.11, around line 302)

**New section, no pre-state.** Post-state:

```markdown
### D.9d — `phase:*` → ledger only

**Trigger**: An issue enters any `phase:*` state. **Prefix-match**: any transition class whose token begins with the literal `phase:` prefix matches this row (`phase:specify`, `phase:clarify`, `phase:plan`, `phase:tasks`, `phase:implement`, `phase:validate`, and any future workflow-phase addition). The phase set is workflow-dependent and open-ended — speckit-feature and speckit-bugfix already differ; enumeration would break the day a workflow adds a phase.

**Dispatch**: **Ledger line only.** No CLI verb (in particular, no `generacy cockpit status --json` re-check), no subagent, no gate, no status table, no prose recap — engine-owned transient transition. Never surface a D.10 escalation gate on a `phase:*` token; D.10 remains the catch-all for genuinely unknown, non-`phase:` labels (per § Dispatch D.10's tightened trigger — an unrecognized `waiting-for:*` still fires D.10).

**Ledger line**: `<issue-ref> · <phase:*-token> · (no-op) · engine-owned phase transition`.
```

### § Dispatch D.7 (`agent:error` / `failed:*`) around lines 240-256

| Pre | Post |
|-----|------|
| Step 1 reads: "Fetch evidence — read the alert content (bot-authored comment on the issue with the failure evidence). Use `gh issue view <issue-ref> --comments --json comments -q '.comments[]'` or equivalent." | Step 1 reads: "Fetch evidence — the parent's sole evidence-fetch verb is `generacy cockpit context <issue>`. No ad-hoc `gh` chains, no link-following, no `gh issue view --comments` inline in the parent. The payload is whatever the engine bundle returns — if the diagnosis subagent routinely needs a specific artifact (e.g., the primary CI log), fix the engine bundle (server-side, generacy-side), not the per-session parent envelope." |
| Step 2 (in prior prose): direct presentation of the escalation gate without a diagnosis subagent. | Step 2 (new): "Spawn diagnosis subagent" prose block with the `subagent_type: "general-purpose"` invocation shape + return-schema directive `{root_cause: string, evidence: string, recommended_action: string, confidence: "low"\|"medium"\|"high"}` where `recommended_action` is exactly one of the target gate's option strings. |
| Step 3: "Present escalation gate (see § Gate contract G.4b)" — the presentation block is populated from ad-hoc reasoning over the alert content. | Step 3: "Present escalation gate (see § Gate contract G.4b)" — the presentation block is populated verbatim from the verdict (`root_cause`/`evidence` fill the context and evidence rows; `recommended_action` renders as a "Suggested decision" line with `confidence` beside it). No in-parent re-analysis. |

The "Apply verdict" branches, degradation clause, and ledger lines are unchanged.

### § Dispatch D.11 (`waiting-for:merge-conflicts`) around lines 303-317

| Pre | Post |
|-----|------|
| Step 1 reads: "Fetch context. Read the pause-alert comment posted by the engine when the label was set (via `gh issue view --comments <issue-ref>`). Extract the list of conflicted paths." | Step 1 reads: "Fetch context. The parent's sole evidence-fetch verb is `generacy cockpit context <issue>`; the payload includes the pause-alert comment content and the list of conflicted paths. No ad-hoc `gh` chains, no link-following, no `gh issue view --comments` inline in the parent." |
| (no diagnosis subagent step) | Step 1.5 (new): "Spawn diagnosis subagent" prose block — same shape as D.7 step 2, with the D.11 gate's option strings (`I've resolved it — advance the gate` / `Skip (session-local mute)` / `Stop (exit auto)`) as the constraint for `recommended_action`. |
| Step 2: "Present escalation gate (see § Gate contract G.4d)" — populated from ad-hoc reading. | Step 2: same reference, populated verbatim from the verdict per G.4d's updated presentation-population source. |

The "Apply verdict" branches, non-zero re-present shape, and ledger lines are unchanged.

### § Gate contract G.4 (b) and (d) presentation-block descriptions (around lines 503-573)

| Pre | Post |
|-----|------|
| G.4(b) presentation block: `<evidence — bot-authored alert comment body from gh issue view --comments, or the failure trace>` | G.4(b) presentation block: five-element shape populated verbatim from the diagnosis subagent's verdict — root_cause / evidence / current-state / "Suggested decision: <recommended_action>" with confidence beside it. Followed by the unchanged single `AskUserQuestion` with the D.7 option set. |
| G.4(d) presentation block: verbatim conflicted paths from the engine pause alert. | G.4(d) presentation block: five-element shape populated verbatim from the diagnosis subagent's verdict — root_cause / evidence / conflicted-paths / "Suggested decision: <recommended_action>" with confidence beside it. Followed by the unchanged single `AskUserQuestion` with the D.11 option set. |

G.4(a) (validate-red / merge-red) is unchanged — the bounded fixer subagent (D.6) already returns strict JSON that populates G.4a; FR-003 targets D.7 and D.11 only. G.4(c) (unrecognized state) is unchanged.

### § Ledger — new L.4 "Status table policy" subsection (around line 680, after the vocabulary table)

**New section, no pre-state.** Post-state:

```markdown
### L.4 — Status table policy

The full epic status table (anchor: header row `| Issue | Phase | State |`) is emitted **only** at the following surfaces:

1. **`phase-complete` dispatch** (D.8, § Gate contract G.5 presentation block).
2. **`epic-complete` exit** (step 6, § Ledger L.6 run-summary paragraph).
3. **Escalation-gate presentations** (D.6 G.4a, D.7 G.4b, D.10 G.4c, D.11 G.4d) — the operator needs orientation before an escalation decision.
4. **Startup-sweep summary** (step 3) — session-start orientation is a real operator need; every resumed run starts with "where are things?". The sweep ends with exactly one full status table, then enters the main loop.

Between phase boundaries, the ledger line is the sole record of a dispatch. No status table is emitted after D.1–D.5, D.9/D.9a/D.9b/D.9c/D.9d, or any actionable dispatch that is not one of the four surfaces above.
```

### § Ledger — Action + outcome vocabulary table (around line 660-680)

| Pre | Post |
|-----|------|
| Rows for D.9 / D.9a / D.9b / D.9c with `<action>` = `(no-op)` and `<outcome>` = `server-side-owned`. | Rows unchanged. New row inserted: `D.9d phase:*` with `<action>` = `(no-op)` and `<outcome>` = `engine-owned phase transition`. |

### § Invariants — new §8 (added at the end of § Invariants, around line 710)

**New numbered item, no pre-state (§1–§7 unchanged).** Post-state:

```markdown
8. **Ledger-only rows are cheap by contract.** A transition that dispatches to a ledger-only row (D.9, D.9a, D.9b, D.9c, D.9d) must add no tool calls beyond the ledger append and no prose. Playbook edits that add per-event output — a `cockpit status --json` re-check, an epic status table, a prose recap — on a ledger-only row are efficiency regressions.
```

---

## Assertion index

Mapping the seven behavioral assertions in `tests/playbook-verification.test.ts` (`describe("403 — …")` block) to the spec's FR / SC anchors:

| Assertion | Verifies | Spec anchor |
|-----------|----------|-------------|
| 403-1 | D.9 subheadings state the no-re-check/no-prose contract | FR-001, FR-007 |
| 403-2 | New D.9d subheading with `phase:*` prefix-match, ledger-line-only dispatch | FR-005, FR-007, SC-007 |
| 403-3 | Reference classifier prefix-matches `phase:*` to D.9d, not D.10 | FR-005, SC-007 |
| 403-4 | D.7/D.11 sole-verb contract + subagent-schema anchor | FR-003, FR-007, SC-004 |
| 403-5 | Verdict reference type shape + option-set constraint | FR-003, FR-004, FR-007 |
| 403-6 | Invariants §8 cost-contract line present | FR-006, FR-007, SC-006 |
| 403-7 | Status table emission restricted to four permitted surfaces | FR-002, SC-003 |

Static-grep checks (in `quickstart.md § Static checks`) additionally verify:

- `commands/clarify.md` shows zero changes (FR-009).
- Historical spec directories show zero changes (implicit FR-010).
- Existing `lib/*.ts` files show zero changes (implicit FR-010).
- The mandatory ledger line per dispatch (§ Ledger L.5) is unchanged (FR-010).
- The #400 five-element gate display shape is unchanged in G.1 / G.2 / G.3 (FR-010).
- The never-content-filter rule (§7) is unchanged (FR-010, agency#394).

---

## Audit deliverable format (FR-008 — generated by `/tasks`, not here)

The D.9 misclassification audit task in `tasks.md` produces a table in the PR body. Columns:

| Row | Trigger label | One-line justification for ledger-only status |
|-----|---------------|-----------------------------------------------|
| D.9 | `waiting-for:address-pr-feedback` | Server-side-owned: the engine's feedback loop advances the label when addressed; parent has no local action to take. |
| D.9a | `waiting-for:pr-feedback` | Server-side-owned: legacy alias of D.9. |
| D.9b | `waiting-for:children-complete` | Server-side-owned: epic-container state; the running auto loop is its resolution. |
| D.9c | `waiting-for:dependencies` | Server-side-owned: engine-owned cross-issue wait; resolved when the depended-on issue transitions. |
| D.9d | `phase:*` (prefix-match) | Engine-owned transient transition: workflow-phase movement is a heartbeat, not an actionable wait. |

(This is the shape the audit produces; the actual justifications are re-written per row by the implementer performing the audit. If a row's justification is "there's an operator action here", the row is misclassified and re-routed to the correct actionable class in the same PR — FR-008.)
