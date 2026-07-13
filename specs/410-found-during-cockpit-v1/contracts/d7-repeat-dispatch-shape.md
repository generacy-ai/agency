# Contract: post-fix `auto.md` D.7 step 1 body — first-vs-repeat dispatch shape

**Surface**: `packages/claude-plugin-cockpit/commands/auto.md` — the D.7 subsection `### D.7 — \`agent:error\` / \`failed:*\` → escalation gate (Requeue path)` within the `## Dispatch` H2 section, specifically the **Dispatch classification** paragraph + step 1 body.

## Structural contract

D.7 MUST contain:

1. **A dispatch-classification paragraph** distinguishing first vs repeat dispatches per Q1=B (per-issue, any failure class, per contiguous invocation).
2. **A first-dispatch sub-path** in step 1 naming `cockpit_context(issue=<issue-ref>)` as the evidence-fetch verb (unchanged from pre-fix).
3. **A repeat-dispatch sub-path** in step 1 naming `cockpit_context(issue=<issue-ref>)` as the evidence-fetch verb (same verb; no dispatch of a repeat D.7 without the new alert body in hand).
4. **A no-parent-characterization rule** stated within step 1 (or step 2 — placement is flexible; the audit checks both).

## Dispatch classification (Q1=B)

A D.7 event is:

- A **first dispatch** iff it is the issue's first `agent:error` / `failed:*` event within the current contiguous auto invocation.
- A **repeat dispatch** iff it is the issue's second-and-subsequent `agent:error` / `failed:*` event within the current contiguous auto invocation, regardless of `failed:<subtype>` match.

Session restart resets first-vs-repeat state (per #406 Q2's session-local grain). A restart's startup sweep does a fresh first-dispatch with fresh evidence, safe by construction against this spec's failure mode.

## First-dispatch sub-path (unchanged from pre-fix)

```markdown
- **First dispatch**: call `cockpit_context(issue=<issue-ref>)`; the engine bundle payload is the first-dispatch evidence, forwarded to the subagent per step 2.
```

Structural properties:

- The word "first dispatch" (or "first-dispatch" or "First dispatch") appears as an explicit sub-path anchor.
- `cockpit_context` appears in the same line/paragraph or within the sub-path's body.

## Repeat-dispatch sub-path (post-fix)

```markdown
- **Repeat dispatch**: call `cockpit_context(issue=<issue-ref>)` again — same evidence verb as first-dispatch. **No dispatch of a repeat D.7 without the new alert body in hand.** The parent's role at this boundary is pure transport: fetch the fresh alert, and hand it to the subagent verbatim (step 2). **The parent MUST NOT characterize the fresh failure** with a phrase like "requeue failed identically", "same as before", "another `<subtype>`", or any other parent-authored summary of similarity; the subagent — not the parent — determines same-or-different from the evidence. Parent-authored summaries of evidence are forbidden in diagnosis prompts (the loop-trust-boundary principle applied to the parent itself: assertions are advisory, evidence is authoritative).
```

Structural properties:

- The word "repeat dispatch" (or "repeat-dispatch" or "Repeat dispatch") appears as an explicit sub-path anchor.
- `cockpit_context` appears in the same line/paragraph or within the sub-path's body.
- A rule-statement anchor appears matching a tolerant pattern (`MUST NOT characterize`, `no parent-authored`, `not the parent's role`, `parent MUST NOT summarize`, or equivalent).

## No-parent-characterization rule (post-fix)

The rule must be stated explicitly. The audit tolerates prose variation but requires at least one of the following anchor patterns:

- `MUST NOT characterize`
- `no parent-authored`
- `not the parent's role to characterize` (or `not the parent's role to summarize`)
- `parent MUST NOT summarize`
- Equivalent structural rule statement (e.g., a bolded `**Parent MUST NOT summarize evidence**` sentence)

The rule may live in step 1 (colocated with the repeat-dispatch sub-path) or in step 2 (colocated with the subagent invocation instructions). The audit checks both surfaces.

## Convergence with step 2

Both first-dispatch and repeat-dispatch sub-paths hand off to step 2 (subagent invocation). The difference in dispatch classification propagates to step 2's verdict-return-schema addendum: on repeat dispatches, the subagent's return payload gains two required fields (`failure_class_changed`, `failure_classes_seen`); on first dispatch, both fields are absent (or `null`).

See [verdict-schema.md](./verdict-schema.md) for the step 2 verdict-schema contract.

## Post-fix wording (illustrative reference; the exact prose may vary as long as the structural contract is met)

```markdown
### D.7 — `agent:error` / `failed:*` → escalation gate (Requeue path)

**Trigger**: An issue enters `agent:error` or any `failed:*` state. Verbatim event strings: `agent:error` and `failed:` (matching any `failed:<subtype>`).

**Dispatch classification**: A D.7 event is a **first dispatch** iff it is the issue's first `agent:error` / `failed:*` event within the current contiguous auto invocation. A D.7 event is a **repeat dispatch** iff it is the issue's second-and-subsequent `agent:error` / `failed:*` event within the current contiguous auto invocation, regardless of `failed:<subtype>` match (Q1=B: subtype match not required; session restart resets first-vs-repeat state per #406 Q2's session-local grain).

**Dispatch**:
1. **Fetch evidence** — the parent's sole evidence-fetch tool is `cockpit_context(issue=<issue-ref>)`. **No ad-hoc `gh` chains, no link-following, no `gh issue view --comments` inline in the parent.** …
   - **First dispatch**: call `cockpit_context(issue=<issue-ref>)`; the engine bundle payload is the first-dispatch evidence, forwarded to the subagent per step 2.
   - **Repeat dispatch**: call `cockpit_context(issue=<issue-ref>)` again — same evidence verb as first-dispatch. **No dispatch of a repeat D.7 without the new alert body in hand.** The parent's role at this boundary is pure transport … **The parent MUST NOT characterize the fresh failure** …
2. **Spawn diagnosis subagent** — … (see [verdict-schema.md](./verdict-schema.md))
3. **Present escalation gate** (see § Gate contract G.4b). … On **repeat dispatches**, the presentation block gains a sixth element between "Evidence" and "Current state": `**Failure class changed since prior:** <yes | no>  (classes this session: <class1> → <class2> → …)`, populated verbatim from the verdict's `failure_class_changed` and `failure_classes_seen` fields. (see [g4b-presentation-block.md](./g4b-presentation-block.md))
4. **Apply verdict**: … (unchanged from pre-fix).
```

## Non-goals (things this contract does NOT constrain)

- The exact prose of the first-dispatch / repeat-dispatch sub-path headings (may be `**First dispatch**` / `**Repeat dispatch**`, or `- First dispatch:` / `- Repeat dispatch:`, or any other bullet-marked sub-path separator). Structural check: two distinct sub-paths, each naming `cockpit_context`.
- The exact wording of the no-parent-characterization rule (may be phrased as any of the tolerant patterns above or equivalent). Structural check: a rule anchor is present, tolerant of prose variation.
- The exact list of forbidden parent-authored phrasings (may include or omit the specific incident phrase "requeue failed identically" as long as the general rule stands). Structural check: the rule statement exists, not the illustrative examples.
- The exact structure of D.7 step 3's cross-reference to G.4(b)'s sixth element (may be inline in step 3's prose or a separate bullet). Structural check: the reference exists in step 3's body.

## Failure modes the contract prevents

- **Pre-fix wording** (one unified dispatch path, no first-vs-repeat classification) fails the structural check for "distinct sub-paths" — the audit's parser cannot find two sub-path anchors.
- **Fresh evidence-fetch omitted from repeat-dispatch sub-path** (the repeat sub-path exists but does not name `cockpit_context`) fails the structural check for the `cockpit_context` co-location on the repeat sub-path.
- **No no-parent-characterization rule** (the sub-paths exist but neither states the rule) fails the structural check for the rule anchor — the parent can slip in a summary of similarity and undo the whole fix.
- **G.4(b) sixth-element row missing** (the row is not added to G.4(b) presentation block) fails the structural check for the G.4(b) row anchor.
- **Cross-reference D.7 → G.4(b) missing** (step 3 does not reference the sixth element) is caught by the quickstart static grep, not by the audit — this is stable-anchored enough that a build-time grep suffices.

## Precedent match

- **D.7 first-dispatch shape** is unchanged from pre-fix (#403 established the first-dispatch subagent invocation contract).
- **First-vs-repeat sub-path structure** is a new structural pattern for D-family dispatch rows; the shape is analogous to D.11's step 1.5 (which adds a diagnosis-subagent sub-step) and G.4(d)'s "initial presentation vs. re-presentation" shape.
- **No-parent-characterization rule** is a new instance of the loop-trust-boundary principle at the parent-to-continuing-subagent boundary. Prior instances of the principle at other boundaries (engine-to-parent, parent-to-first-dispatch-subagent) are established in earlier D-family dispatch rows.
