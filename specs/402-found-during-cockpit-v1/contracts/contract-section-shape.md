# Contract: `## AskUserQuestion invocation contract` section shape

**Consumers**: The auto loop reads this section at runtime when composing multi-gate fused responses. The audit (`402-1`) checks it exists at the declared depth, states the ≤4 bound, and is referenced from every gate contract.

## Placement

- **File**: `packages/claude-plugin-cockpit/commands/auto.md`.
- **Depth**: H2 (`##`).
- **Position**: Sibling to `## Gate contract`, inserted between `## Gate contract` (closing at G.5's last content line) and `## Ledger` (the next H2 heading). NOT nested inside `## Gate contract`.

## Header (verbatim)

```markdown
## AskUserQuestion invocation contract
```

Substring match is case-insensitive per the audit's parser but the checked-in prose uses the exact casing above.

## Body (three rules + composition paragraph)

The section body MUST contain three labeled rules and a composition paragraph. The audit checks (a) the section exists, and (b) the ≤4 bound is present anywhere in the section body — it does NOT enforce the exact wording of the paragraphs.

### Rule 1 — Default gate shape

> `AskUserQuestion.questions` is a **single-item array** (one call per gate/batch).

Load-bearing property: G.1–G.5 each emit exactly one item in their `questions` array; the default shape aligns with #400's post-rewrite G.1 shape and G.2–G.5's single-question gates.

### Rule 2 — Harness ceiling

> `AskUserQuestion.questions` array MUST NOT exceed **4 items** per call.

Load-bearing property: exceeding the bound returns `InputValidationError: Too big: expected array to have <=4 items (questions)` at input validation. The ceiling is a Claude Code SDK harness bound; the playbook cannot change it.

**Audit-detectable tokens** (`402-1`'s `boundPresent` check):

- The regex `≤ ?4 ?items? ?per ?call` matches within the section body, OR
- Both literal tokens `4 items` and `per call` appear on the same line or in adjacent lines within the section body.

### Rule 3 — Multi-gate fanout

> When multiple gates fuse into one assistant response, fire **multiple `AskUserQuestion` calls** in that response — one call per gate — never a single fused call.

Load-bearing property: the fanout dimension is the *number of `AskUserQuestion` calls*, not the length of a single call's `questions` array. This is the rule directly protecting against the finding #57 concatenation.

### Composition paragraph

Explains that the three rules compose transitively (default 1 + ≤4 + per-call fanout → the ceiling is per call, and the array shape stays 1 per gate). Documents that every gate contract G.1–G.5 references this section and any future gate G.6+ MUST also reference it.

## Constraints

- **The section header appears exactly once** at H2 depth. Multiple headers with this text would confuse the audit's `findContractSection` helper (which returns the first match) and produce inconsistent audit reports.
- **The section body contains the ≤4 bound in a form matching the audit's tokens.** If the section is renamed (say, to `## AskUserQuestion call contract`), `402-1` fails until the audit's substring match is updated.
- **No numeric interpolation of the bound.** The audit's `boundPresent` check looks for the literal `4 items` / `per call`; a variable expansion like `MAX_ITEMS items per call` would false-negate. The bound is documented as a hard number because the Claude Code SDK enforces it as a hard number.
- **The section is NOT an invariant.** It is a contract section at H2 depth, sibling to `## Gate contract`. Do NOT add a corresponding entry to `## Invariants` (SC-007 precedent from #394; no-§8 rule from #396/#398/#400).
- **The three rules are documented independently** — not as a single fused paragraph. Independence matters because each rule has a distinct load-bearing property; a future author touching one shouldn't accidentally alter the others.

## Runtime consumption path

At runtime, when the auto loop encounters a multi-gate fusion event (5 issues transitioning simultaneously, phase boundary co-fire, escalation gate co-fire), the response-composing pass reads:

1. The gate contract G.<n> for each fused gate.
2. The gate contract's `**Gate invocation**` paragraph, which opens with `Per § AskUserQuestion invocation contract — …`.
3. The `## AskUserQuestion invocation contract` section, which states the three rules.

The composition of steps 2 and 3 tells the model: emit one `AskUserQuestion` call per gate, single-item `questions` array each, never concatenated.

## Build-time enforcement

`402-1` parses `auto.md` into H2/H3 sections (see [data-model.md § Surface 2](../data-model.md)) and asserts:

- The H2 section with header substring `AskUserQuestion invocation contract` exists.
- `boundPresent(section.body) === true` per the token check above.
- Each H3 gate section (`G.1` through `G.5`, including `G.4a`–`G.4d`) contains the substring `AskUserQuestion invocation contract` in its body.

Failure mode: fail the test suite with the specific missing element identified (`sectionExists: false`, `boundPresent: false`, or `missing-reference-from-G.<n>`).
