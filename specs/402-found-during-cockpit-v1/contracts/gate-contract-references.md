# Contract: Each of G.1–G.5's gate-invocation paragraph carries a `Per § AskUserQuestion invocation contract` reference

**Consumers**: Gate authors extending G.1–G.5, future authors adding G.6+; the audit (`402-1`) which structurally checks each gate contract carries the reference substring.

## Rule

Every gate contract in `packages/claude-plugin-cockpit/commands/auto.md`'s `## Gate contract` section (`### G.1`, `### G.2`, `### G.3`, `### G.4` and its subtypes `(a)`/`(b)`/`(c)`/`(d)`, `### G.5`) MUST contain the substring `AskUserQuestion invocation contract` at least once within its section body. The canonical carrier is the gate-invocation paragraph.

## Canonical reference sentence shape

Each gate's `**Gate invocation**` paragraph opens with (or contains near its opening) a sentence of the form:

```markdown
**Gate invocation**: Per § AskUserQuestion invocation contract — <gate-specific one-sentence restatement of the composition>. Parameters:
- ... (gate-specific parameters follow: Question text, Header, multiSelect, Options)
```

The `<gate-specific one-sentence restatement>` names how the composition applies to this specific gate. For example:

- **G.1** (clarification batch): `one call per batch (single-item questions array); when multiple clarification gates fuse into one response, fire one call per gate.`
- **G.2** (review verdict): `one call per verdict gate (single-item questions array); when multiple review gates fuse into one response, fire one call per gate.`
- **G.3** (manual-validation confirm): `one call per manual-validation gate (single-item questions array); when multiple manual-validation gates fuse into one response, fire one call per gate.`
- **G.4** (escalation, all subtypes): `one call per escalation gate (single-item questions array); when multiple escalation gates fuse into one response, fire one call per gate.`
- **G.5** (phase-queue confirmation): `one call per phase-queue gate (single-item questions array); phase-queue gates rarely fuse but the fanout rule applies uniformly if they do.`

The exact wording of the restatement is not audited — only the substring `AskUserQuestion invocation contract` is required. This is a deliberate structural discriminator over prose-sniffing (Q3=C rationale).

## Constraints

- **Every G.<n> section body contains the reference substring at least once.** The audit's `hasReference` check per gate is a simple `body.includes("AskUserQuestion invocation contract")`.
- **The reference lives in the gate-invocation paragraph** — not in the presentation block, not in the post-gate behavior list, not in the failure-modes list. Placing it elsewhere technically satisfies the audit's substring check but hides the rule from a future author who reads only the invocation paragraph.
- **The gate-specific parameters stay inline** in each gate contract's paragraph. Only the invocation-shape prose (`Exactly one` / `never ceil(N/4)` / call-count / fanout-dimension) is factored out to the contract section. G.1's `Options` (three-option batch gate), G.2's `Options` (approve/request-changes/abort), etc. remain in the gate contract.
- **G.4's four subtypes each carry their own reference.** G.4 is one section but its Options table lists four distinct escalation-gate variants (a/b/c/d). Each variant's row (or its explanatory paragraph) MUST reference the contract section, because a future author reading only one subtype's row needs to see the discovery path.

Two viable placements for G.4's references:

1. One reference in G.4's shared `**Gate invocation**` paragraph (before the Options table), which covers all four subtypes uniformly.
2. One reference per subtype row (belt-and-suspenders).

The audit's `hasReference` check is a substring test on the entire G.4 section body; either placement satisfies it. Placement 1 is preferred for brevity.

## Edit path (from pre-fix G.1)

Pre-fix (line 372 of `auto.md`):

```markdown
**Gate invocation**: **Exactly one** `AskUserQuestion` call per batch in the same response (never `ceil(N/4)`, never per-question). Parameters:
```

Post-fix:

```markdown
**Gate invocation**: Per § AskUserQuestion invocation contract — one `AskUserQuestion` call per batch (single-item `questions` array); when multiple clarification gates fuse into one response, fire one call per gate. Parameters:
```

Substitutions:

- `**Exactly one**` → `Per § AskUserQuestion invocation contract — one`
- ` in the same response (never \`ceil(N/4)\`, never per-question)` → ` (single-item \`questions\` array); when multiple clarification gates fuse into one response, fire one call per gate`

Net: one line's phrasing rewrites; the rest of the paragraph (Question text, Header, multiSelect, Options list) is unchanged.

## Edit paths (from pre-fix G.2, G.3, G.4, G.5)

Each of G.2, G.3, G.4, G.5 has a `**Gate invocation**` paragraph opening with `One \`AskUserQuestion\` call in the same response, with:` or similar. Post-fix, prepend the reference sentence:

```markdown
**Gate invocation**: Per § AskUserQuestion invocation contract — <gate-specific restatement>. Parameters:
- ... (unchanged from pre-fix)
```

Net per gate: +1 sentence prepended; the parameters list unchanged. Total across G.2, G.3, G.4, G.5: ~4 sentences added.

## Build-time enforcement

`402-1`'s `gateReferences` array is populated by scanning each `### G.<n>` (and `### G.4a`/`G.4b`/`G.4c`/`G.4d`) section body:

```typescript
const gateReferences = gateSections.map(gate => ({
  gate: extractGateName(gate.header),
  hasReference: gate.body.includes("AskUserQuestion invocation contract"),
}));
expect(gateReferences.every(g => g.hasReference)).toBe(true);
```

Failure mode: the missing gate's name is reported; the fix is a one-line edit to that gate's invocation paragraph.

## Rationale

Cross-references from each gate contract to the invocation contract are the discovery path. A future author extending G.3 (say, adding a new option to the manual-validation gate) reads only G.3, sees the reference, and follows it to the contract section — where they encounter the ≤4 ceiling and the fanout rule. Without the cross-reference, that author might reinline the ceiling at G.3 (Q1=C's rejected shape) or forget it (finding #57 shape).
