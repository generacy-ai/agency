# Data Model: #402 — `AskUserQuestion invocation contract` section + fusion-drift audit

Structural model of the four surfaces this fix touches:

1. `packages/claude-plugin-cockpit/commands/auto.md` — the new `## AskUserQuestion invocation contract` section (pre/post layout at H2 depth) and the one-sentence reference edits at each `### G.<n>` gate contract.
2. `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` — the new `describe("402 — …")` block's inputs/outputs (audit parser input, mismatch report shape).
3. `packages/claude-plugin-cockpit/tests/fixtures/402-drift-auto.md` — the negative fixture's minimal structure.
4. (Read-only) Claude Code SDK `AskUserQuestion` harness contract — the load-bearing property the playbook prose exists to reflect.

## Surface 1: `packages/claude-plugin-cockpit/commands/auto.md`

### Pre-fix layout (H2 sections, in-order)

```
# Auto Command
## User Input
## Instructions
## Dispatch
  ### D.1 — waiting-for:clarification
  ### D.2 — waiting-for:<artifact>-review
  ### D.3 — waiting-for:implementation-review
  ### D.4 — waiting-for:manual-validation
  ### D.5 — completed:validate (checks green) → merge without gate
  ### D.6 — completed:validate (red) / merge red → bounded fixer subagent
  ### D.7 — agent:error / failed:* → escalation gate (Requeue path)
  ### D.8 — phase-complete → phase-queue confirmation gate
  ### D.9 — waiting-for:address-pr-feedback → ledger only
  ### D.9a — waiting-for:pr-feedback → ledger only
  ### D.9b — waiting-for:children-complete → ledger only
  ### D.9c — waiting-for:dependencies → ledger only
  ### D.11 — waiting-for:merge-conflicts → escalation gate (I've resolved it / Skip / Stop)
  ### D.10 — Unrecognized / ambiguous state → escalation gate (Skip / Stop only)
## Gate contract
  ### G.1 — Clarification batch gate
  ### Directive grammar
  ### G.2 — Review verdict gate (artifact and implementation)
  ### G.3 — Manual-validation confirm gate
  ### G.4 — Escalation gate (three subtypes)
  ### G.5 — Phase-queue confirmation gate
## Ledger
  ### Action + outcome vocabulary (per dispatch row)
  ### L.6 — Run summary at exit
## Invariants
## Examples
```

Pre-fix, G.1's `**Gate invocation**` paragraph (`commands/auto.md` line 372-379) reads:

```markdown
**Gate invocation**: **Exactly one** `AskUserQuestion` call per batch in the same response (never `ceil(N/4)`, never per-question). Parameters:
- **Question text**: `Post all <N> drafted answers to <issue-ref>?`
- **Header**: `Clarify` (≤ 12 chars)
- **multiSelect**: `false`
- **Options** (exactly three, discrete, in this order):
  1. `Approve all & post (Recommended)` — post every drafted answer as-is.
  2. `Make changes` — enter the re-loop (see § Directive grammar): parse operator-typed directives, apply them, re-present only the changed questions plus the same three-option batch gate, loop until Approve or Skip. Zero directives is a no-op re-present.
  3. `Skip this batch` — post nothing; do not advance; ledger line noting the skip.
```

G.2–G.5 gate-invocation paragraphs (`commands/auto.md` lines 457–464 for G.2, 493–499 for G.3, 575–587 for G.4, 613–619 for G.5) similarly state their own `Gate invocation` paragraph inline with parameters, but do NOT state the ≤4 ceiling or the multi-gate fanout rule.

The `## Invariants` section (line 702-711) lists §1–§7. No invariant covers `AskUserQuestion` invocation shape.

### Post-fix layout (H2 sections, in-order)

```
# Auto Command
## User Input
## Instructions
## Dispatch
  ### D.1 through D.10 (unchanged)
## Gate contract
  ### G.1 — Clarification batch gate     (Gate invocation paragraph SHORTENED to reference)
  ### Directive grammar                   (unchanged)
  ### G.2 — Review verdict gate           (Gate invocation paragraph ADDS reference)
  ### G.3 — Manual-validation confirm     (Gate invocation paragraph ADDS reference)
  ### G.4 — Escalation gate               (Gate invocation paragraph ADDS reference)
  ### G.5 — Phase-queue confirmation      (Gate invocation paragraph ADDS reference)
## AskUserQuestion invocation contract   ← NEW H2 SECTION
## Ledger
## Invariants                             (unchanged — no new §8)
## Examples
```

The new section is inserted between `## Gate contract` (ends at G.5's closing content, before the `## Ledger` header) and `## Ledger`. Sibling to `## Gate contract` at H2 depth — NOT nested inside it.

### New section body (verbatim)

```markdown
## AskUserQuestion invocation contract

This section governs the shape of every `AskUserQuestion` call the auto loop fires — not the gate-specific parameters (Question text / Header / Options / multiSelect), which stay inline in each gate contract, but the call count, item count, and fanout dimension that apply uniformly to G.1–G.5.

**Default gate shape**: `AskUserQuestion.questions` is a **single-item array** (one call per gate/batch). Every gate contract G.1–G.5 emits exactly one item in its `questions` array — this is the load-bearing structural default. The pre-#400 `ceil(N/4)` phrasing is retired; today's default gate shape is a single-item array.

**Harness ceiling**: `AskUserQuestion.questions` array MUST NOT exceed **4 items** per call. This is the Claude Code SDK's hard input-validation bound: exceeding it returns `InputValidationError: Too big: expected array to have <=4 items (questions)` and forces a retry round-trip that costs correctness signal (duplicated presentation block in the transcript, laggy last item). The ceiling applies to every `AskUserQuestion` call the auto loop fires, without exception.

**Multi-gate fanout**: When multiple gates fuse into one assistant response (5 issues hitting `waiting-for:clarification` simultaneously, or a fused verdict gate at a phase boundary, or any other multi-gate event burst), fire **multiple `AskUserQuestion` calls** in that response — one call per gate — never a single fused call carrying all gates' items concatenated. The fanout dimension is the *number of `AskUserQuestion` calls*, not the length of a single call's `questions` array. Each of those calls independently obeys the ≤4 ceiling; because the default shape is single-item per gate, the ceiling is only reachable if a single gate ever needed >1 item (none of G.1–G.5 do today).

**Composition**: Default single-item + ≤4 ceiling + per-call fanout compose transitively. A single response fusing 5 clarification gates fires 5 `AskUserQuestion` calls, each carrying 1 item in `questions`. A single response fusing a verdict gate + a phase-queue gate + an escalation gate fires 3 `AskUserQuestion` calls, each carrying 1 item. The ceiling only becomes a live constraint if a future gate contract emits multi-item `questions` (not the case in G.1–G.5).

Every gate contract G.1–G.5 references this section from its gate-invocation paragraph. A future gate G.6+ that fuses under some new multi-gate condition MUST reference this section — the audit (402-1) checks that each `### G.<n>` section body carries the reference.
```

The section is ~30-40 lines of markdown (headers + four labeled rule paragraphs + composition paragraph + author-facing forward-reference note).

### G.1 gate-invocation paragraph edit (post-fix)

Replace lines 372–379's inline shape with a shortened reference-plus-parameters block. The gate-specific parameters (Question text / Header / multiSelect / Options) stay inline; only the invocation-shape prose (`Exactly one` / `never ceil(N/4)` / `never per-question`) is factored out:

```markdown
**Gate invocation**: Per § AskUserQuestion invocation contract — one `AskUserQuestion` call per batch (single-item `questions` array); when multiple clarification gates fuse into one response, fire one call per gate. Parameters:
- **Question text**: `Post all <N> drafted answers to <issue-ref>?`
- **Header**: `Clarify` (≤ 12 chars)
- **multiSelect**: `false`
- **Options** (exactly three, discrete, in this order):
  1. `Approve all & post (Recommended)` — post every drafted answer as-is.
  2. `Make changes` — enter the re-loop (see § Directive grammar): parse operator-typed directives, apply them, re-present only the changed questions plus the same three-option batch gate, loop until Approve or Skip. Zero directives is a no-op re-present.
  3. `Skip this batch` — post nothing; do not advance; ledger line noting the skip.
```

The removed phrases: `**Exactly one**`, `never \`ceil(N/4)\``, `never per-question`. The replacement: `Per § AskUserQuestion invocation contract — one \`AskUserQuestion\` call per batch (single-item \`questions\` array); when multiple clarification gates fuse into one response, fire one call per gate`. Net: -1 line, +1 line, ~0 net line change; the `**Gate invocation**` paragraph shrinks from 1 sentence to 1 sentence (same length, different content).

### G.2 gate-invocation paragraph edit (post-fix)

G.2 currently reads (lines 457–464):

```markdown
**Gate invocation**: One `AskUserQuestion` call in the same response, with:
- **Question text**: `Verdict for <issue-ref> (<gate-name>)?`
- **Header**: `Verdict` (≤ 12 chars)
- **Options** (exactly three, discrete, in this order):
  1. `approve` — advance the gate
  2. `request-changes` — post COMMENT review with per-finding inline threads
  3. `abort` — do nothing
- **multiSelect**: `false`
```

Post-fix, prepend the reference sentence:

```markdown
**Gate invocation**: Per § AskUserQuestion invocation contract — one `AskUserQuestion` call per verdict gate (single-item `questions` array); when multiple review gates fuse into one response, fire one call per gate. Parameters:
- **Question text**: `Verdict for <issue-ref> (<gate-name>)?`
- **Header**: `Verdict` (≤ 12 chars)
- **Options** (exactly three, discrete, in this order):
  1. `approve` — advance the gate
  2. `request-changes` — post COMMENT review with per-finding inline threads
  3. `abort` — do nothing
- **multiSelect**: `false`
```

G.3, G.4, G.5 receive equivalent one-sentence reference-insertion edits. Each `**Gate invocation**` paragraph gains a leading `Per § AskUserQuestion invocation contract — …` sentence, the rest of the paragraph unchanged.

## Surface 2: `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts`

### New describe block (appended after the existing `describe("400 — …")` block)

Input: `commands/auto.md` file path + `tests/fixtures/402-drift-auto.md` file path.

Output: Two `it(…)` assertions, both structural.

#### `402-1` (positive drift audit) — inputs/outputs

**Input**: `commands/auto.md` file contents (utf-8 string).

**Parser output**: `AuditReport` structure:

```typescript
type AuditReport = {
  sectionExists: boolean;        // does `## AskUserQuestion invocation contract` heading appear at H2 depth?
  boundPresent: boolean;         // within that section's body, does the ≤4 bound appear (as regex or `4 items` + `per call`)?
  gateReferences: {              // for each of G.1, G.2, G.3, G.4a, G.4b, G.4c, G.4d, G.5:
    gate: string;                //   the gate name (e.g., "G.1")
    hasReference: boolean;       //   does the section body contain `AskUserQuestion invocation contract` substring?
  }[];
};
```

**Assertion shape**:

- `report.sectionExists === true`
- `report.boundPresent === true`
- `report.gateReferences.every(g => g.hasReference)`

On failure, emit `{failure: "missing-contract-section" | "missing-bound-in-contract-section" | "missing-reference-from-G.<n>", details: <specific offending element>}`.

#### `402-2` (negative-fixture regression) — inputs/outputs

**Input**: `tests/fixtures/402-drift-auto.md` file contents.

**Parser output**: Same `AuditReport` shape.

**Assertion shape**: assert exactly `report.sectionExists === false` (the specific failure mode the fixture is defined to reproduce). This is the positive-signal check that the audit's parser correctly identifies the absence of the section, not just checks-that-passes-happen-to-hold.

### Section-parsing helper (new)

The audit's parser walks the markdown by line, tracking H2 section boundaries and H3 gate-contract boundaries:

```typescript
type Section = {
  header: string;      // the raw header line (e.g., "## AskUserQuestion invocation contract")
  depth: 2 | 3;        // H2 or H3
  startLine: number;   // 1-indexed line of the header
  endLine: number;     // 1-indexed line of the last line before the next same-or-shallower depth header
  body: string;        // lines[startLine..endLine].join('\n')
};

function parseSections(raw: string): Section[]
function findContractSection(sections: Section[]): Section | null
function findGateSections(sections: Section[]): Section[]  // matches /^### G\.\d(a|b|c|d)? — /
function boundPresent(body: string): boolean               // regex `≤ ?4 ?items? ?per ?call` OR (contains "4 items" AND contains "per call")
function referencePresent(body: string): boolean           // body.includes("AskUserQuestion invocation contract")
```

## Surface 3: `packages/claude-plugin-cockpit/tests/fixtures/402-drift-auto.md`

Minimal markdown reproducing the pre-fix state — the crucial property is that the audit MUST report `sectionExists: false` when run against this fixture.

Structure (~15-25 lines):

```markdown
# Auto Command (drift fixture for #402 — DO NOT EDIT prose semantics)

## Gate contract

Four gate types — clarification batches, review/validation verdicts, phase-queue confirmations, red/error escalations — are the exhaustive human-interaction surface.

### G.1 — Clarification batch gate

**Trigger**: D.1 (`waiting-for:clarification`).

**Presentation**: (elided — irrelevant to the drift audit)

**Gate invocation**: **Exactly one** `AskUserQuestion` call per batch in the same response (never `ceil(N/4)`, never per-question). Parameters:
- **Question text**: `Post all <N> drafted answers to <issue-ref>?`
- **Header**: `Clarify` (≤ 12 chars)
- **multiSelect**: `false`
- **Options** (exactly three, discrete, in this order):
  1. `Approve all & post (Recommended)`
  2. `Make changes`
  3. `Skip this batch`

<!-- Note: NO `## AskUserQuestion invocation contract` section below. This fixture reproduces the pre-#402 state; the audit MUST report sectionExists=false. -->
```

The fixture is deliberately minimal: one `## Gate contract` header + one G.1 gate contract with the pre-fix inline `Exactly one` / `never ceil(N/4)` phrasing + no `## AskUserQuestion invocation contract` section. Feeding it through the audit MUST produce the specific failure `sectionExists === false` — the exact failure mode `402-2` asserts.

Future drift regressions follow the `<finding>-drift-<command>.md` naming pattern and drop into the same fixtures directory.

## Surface 4: Claude Code SDK `AskUserQuestion` harness contract (read-only)

Load-bearing property the playbook prose exists to reflect:

- **Tool name**: `AskUserQuestion`
- **Parameter**: `questions: Question[]` (array; MinItems=1, MaxItems=4 per the SDK's input JSON schema)
- **Input validation**: MaxItems violation returns `InputValidationError: Too big: expected array to have <=4 items (questions)` at input validation, before any user-facing prompt is rendered.
- **Empirical evidence**: T-S12 run at 00:18Z (tetrad-development#92, finding #57) exercised the violation directly with a 5-item `questions` array.

The playbook cannot change this contract. The contract section in `auto.md` exists to make the SDK bound explicit in the prose the auto loop reads. If the SDK ceiling ever changes (say, to ≤8), the fix is a mechanical two-token substitution: update `4` in the contract section body and update the audit's regex/tokens in `402-1`.

## Relationships between surfaces

- **`auto.md`'s contract section** is the load-bearing runtime prose (the auto loop reads it to know the ≤4 rule).
- **`auto.md`'s G.1–G.5 gate-invocation paragraphs** each reference the contract section — the discovery path from a specific gate to the general rule.
- **`playbook-verification.test.ts`'s `402-1` assertion** structurally checks the contract section exists, the bound is present, and every gate contract references it — build-time enforcement of the load-bearing runtime prose.
- **`playbook-verification.test.ts`'s `402-2` assertion** feeds `402-drift-auto.md` through the audit and checks the specific `sectionExists === false` failure — positive-signal check that the audit's structural logic isn't vacuous.
- **`402-drift-auto.md` fixture** is the minimal reproduction of the pre-fix state — the regression fixture that guards against the audit silently degrading.
- **Claude Code SDK `AskUserQuestion` tool contract** is the read-only harness bound the entire chain exists to reflect.

If any single surface breaks (contract section missing, gate reference missing, audit assertion vacuous, fixture stale), the audit fails at build time — surfacing the drift before it can reach a runtime session and re-burn the finding #57 diagnosis round.
